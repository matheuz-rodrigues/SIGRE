"""MFA por código de 6 dígitos enviado ao e-mail da conta (perfis administrativos e técnicos)."""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.mfa_code import MfaCode
from app.models.user import Usuario
from app.services.auth import rate_limit
from app.services.infra.email import EmailDeliveryError, send_email

settings = get_settings()
logger = logging.getLogger(__name__)

CODE_LENGTH = 6


def mfa_required_for(user: Usuario) -> bool:
    return int(user.tipo_usuario or 1) in settings.MFA_REQUIRED_ROLES


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def mask_email(email: str) -> str:
    """'pentest.admin@uepa.br' -> 'pe***@uepa.br' (o usuário reconhece a conta sem expor o endereço)."""
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def _hash(user_id: int, code: str) -> str:
    return hmac.new(settings.JWT_SECRET.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def get_record(db: Session, user_id: int) -> Optional[MfaCode]:
    return db.query(MfaCode).filter(MfaCode.user_id == user_id).first()


def _active(record: Optional[MfaCode]) -> bool:
    return bool(
        record
        and _aware(record.expires_at) > _now()
        and record.attempts < settings.MFA_CODE_MAX_ATTEMPTS
    )


def send_code_email(user: Usuario, code: str) -> None:
    if not settings.SMTP_HOST:
        if settings.is_production:
            raise EmailDeliveryError("SMTP não configurado")
        # Apenas desenvolvimento local sem SMTP (a validação de produção exige SMTP_HOST)
        logger.warning("SMTP não configurado: código de verificação de %s = %s", user.email, code)
        return
    send_email(
        user.email,
        "Seu código de acesso ao SIGRA",
        f"Olá, {user.nome}.\n\n"
        f"Seu código de acesso ao SIGRA é: {code}\n\n"
        f"Ele vale por {settings.MFA_CODE_TTL_MINUTES} minutos e só pode ser usado uma vez.\n"
        "Não compartilhe este código com ninguém. A equipe do SIGRA nunca pede este código.\n\n"
        "Se não foi você que tentou entrar, troque sua senha assim que possível.\n",
    )


def issue_code(db: Session, user: Usuario, ip: Optional[str], force: bool = False) -> None:
    """Gera e envia um novo código.

    Sem `force` (login), reaproveita o código ainda ativo enviado há pouco, para um segundo
    login seguido não disparar outro e-mail. Com `force` (reenviar), respeita o intervalo mínimo.
    """
    record = get_record(db, user.id)
    if not force and _active(record):
        since_sent = (_now() - _aware(record.sent_at)).total_seconds()
        if since_sent < settings.MFA_RESEND_COOLDOWN_SECONDS:
            return

    identifier = f"uid:{user.id}"
    rate_limit.ensure_mfa_send_allowed(db, identifier, ip, enforce_cooldown=force)

    code = "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))
    now = _now()
    if record is None:
        record = MfaCode(user_id=user.id)
        db.add(record)
    record.code_hash = _hash(user.id, code)
    record.attempts = 0
    record.sent_at = now
    record.expires_at = now + timedelta(minutes=settings.MFA_CODE_TTL_MINUTES)
    db.commit()

    try:
        send_code_email(user, code)
    except EmailDeliveryError:
        logger.exception("Falha ao enviar o código de MFA (user_id=%s)", user.id)
        db.delete(record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível enviar o código agora. Tente novamente em instantes.",
        )
    rate_limit.record_event(db, rate_limit.EVENT_MFA_SEND, identifier, ip, success=True, user_id=user.id)


def verify_code(db: Session, user_id: int, code: str) -> bool:
    """Confere o código; uso único, com validade e número máximo de tentativas."""
    record = get_record(db, user_id)
    if not _active(record) or not code or not code.isdigit() or len(code) != CODE_LENGTH:
        return False
    if not hmac.compare_digest(record.code_hash, _hash(user_id, code)):
        record.attempts += 1
        db.commit()
        return False
    db.delete(record)
    db.commit()
    return True
