"""Limitação progressiva de tentativas e registro de eventos de autenticação.

Os eventos ficam na tabela auth_events (Postgres), então o limite vale para
todas as réplicas da API sem depender de infraestrutura extra.
"""
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.auth_event import AuthEvent

settings = get_settings()
audit_logger = logging.getLogger("sigra.audit")

EVENT_LOGIN = "login"
EVENT_MFA = "mfa"
EVENT_REGISTER = "register"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _aware(dt: datetime) -> datetime:
    # SQLite devolve datetimes sem fuso; Postgres devolve com fuso.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def client_ip(request: Request) -> Optional[str]:
    # Com uvicorn --proxy-headers, request.client já reflete o X-Forwarded-For de proxies confiáveis.
    return request.client.host if request.client else None


def normalize_identifier(value: Optional[str]) -> str:
    return (value or "").strip().lower()[:255]


def _too_many(retry_after: float, detail: str) -> HTTPException:
    seconds = max(1, math.ceil(retry_after))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(seconds)},
    )


def record_event(
    db: Session,
    event_type: str,
    identifier: Optional[str],
    ip: Optional[str],
    success: bool,
    user_id: Optional[int] = None,
) -> None:
    db.add(AuthEvent(
        event_type=event_type,
        identifier=identifier,
        ip=ip,
        success=success,
        user_id=user_id,
        created_at=_now(),
    ))
    db.commit()
    audit_logger.info(
        "auth.%s.%s",
        event_type,
        "success" if success else "failure",
        extra={"event": f"auth.{event_type}", "success": success, "identifier": identifier, "ip": ip, "user_id": user_id},
    )


def _identifier_lock_seconds(db: Session, event_type: str, identifier: str) -> float:
    """Bloqueio progressivo: após N falhas seguidas na janela, espera base·2^(falhas-N), até o máximo."""
    now = _now()
    window_start = now - timedelta(minutes=settings.LOGIN_FAILURE_WINDOW_MINUTES)

    last_success = db.query(func.max(AuthEvent.created_at)).filter(
        AuthEvent.event_type == event_type,
        AuthEvent.identifier == identifier,
        AuthEvent.success.is_(True),
    ).scalar()
    since = window_start
    if last_success is not None and _aware(last_success) > since:
        since = _aware(last_success)

    failures = db.query(AuthEvent.created_at).filter(
        AuthEvent.event_type == event_type,
        AuthEvent.identifier == identifier,
        AuthEvent.success.is_(False),
        AuthEvent.created_at >= since,
    ).order_by(AuthEvent.created_at.desc()).all()

    count = len(failures)
    if count < settings.LOGIN_MAX_FAILURES:
        return 0
    lock = min(
        settings.LOGIN_LOCKOUT_BASE_SECONDS * 2 ** (count - settings.LOGIN_MAX_FAILURES),
        settings.LOGIN_LOCKOUT_MAX_SECONDS,
    )
    unlock_at = _aware(failures[0][0]) + timedelta(seconds=lock)
    return (unlock_at - now).total_seconds()


def _ip_lock_seconds(db: Session, event_type: str, ip: Optional[str], limit: int, window: timedelta, only_failures: bool) -> float:
    if not ip:
        return 0
    now = _now()
    query = db.query(AuthEvent.created_at).filter(
        AuthEvent.event_type == event_type,
        AuthEvent.ip == ip,
        AuthEvent.created_at >= now - window,
    )
    if only_failures:
        query = query.filter(AuthEvent.success.is_(False))
    events = query.order_by(AuthEvent.created_at.desc()).limit(limit).all()
    if len(events) < limit:
        return 0
    # Libera quando o evento mais antigo entre os últimos `limit` sair da janela
    return (_aware(events[-1][0]) + window - now).total_seconds()


def ensure_not_locked(db: Session, event_type: str, identifier: str, ip: Optional[str]) -> None:
    """Levanta 429 com Retry-After se o identificador ou o IP estiverem bloqueados."""
    wait = max(
        _identifier_lock_seconds(db, event_type, identifier),
        _ip_lock_seconds(
            db, event_type, ip,
            settings.LOGIN_MAX_FAILURES_PER_IP,
            timedelta(minutes=settings.LOGIN_FAILURE_WINDOW_MINUTES),
            only_failures=True,
        ),
    )
    if wait > 0:
        audit_logger.warning(
            "auth.%s.locked",
            event_type,
            extra={"event": f"auth.{event_type}.locked", "identifier": identifier, "ip": ip, "retry_after": math.ceil(wait)},
        )
        raise _too_many(wait, "Muitas tentativas. Tente novamente mais tarde.")


def ensure_registration_allowed(db: Session, ip: Optional[str]) -> None:
    wait = _ip_lock_seconds(
        db, EVENT_REGISTER, ip,
        settings.REGISTER_MAX_PER_IP_PER_HOUR,
        timedelta(hours=1),
        only_failures=False,
    )
    if wait > 0:
        audit_logger.warning("auth.register.locked", extra={"event": "auth.register.locked", "ip": ip, "retry_after": math.ceil(wait)})
        raise _too_many(wait, "Muitas tentativas de cadastro. Tente novamente mais tarde.")
