"""MFA por TOTP (RFC 6238) para perfis administrativos e técnicos."""
import base64
import hashlib
from datetime import datetime, timezone
from typing import Optional

import pyotp
import segno
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import Usuario
from app.models.user_mfa import UserMfa

settings = get_settings()

TOTP_INTERVAL = 30
# Aceita o passo anterior e o seguinte para tolerar relógios levemente fora de sincronia
TOTP_VALID_WINDOW = 1


def mfa_required_for(user: Usuario) -> bool:
    return int(user.tipo_usuario or 1) in settings.MFA_REQUIRED_ROLES


def _fernet() -> Fernet:
    if settings.MFA_ENCRYPTION_KEY:
        return Fernet(settings.MFA_ENCRYPTION_KEY.encode())
    if settings.ENV == "development":
        # Conveniência local: chave derivada do JWT_SECRET. Produção exige chave própria
        # (Settings.validate_for_production).
        digest = hashlib.sha256(f"mfa:{settings.JWT_SECRET}".encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="MFA não configurado no servidor",
    )


def _decrypt(record: UserMfa) -> str:
    try:
        return _fernet().decrypt(record.secret_encrypted.encode()).decode()
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível validar o MFA",
        )


def get_record(db: Session, user_id: int) -> Optional[UserMfa]:
    return db.query(UserMfa).filter(UserMfa.user_id == user_id).first()


def is_enabled(db: Session, user_id: int) -> bool:
    record = get_record(db, user_id)
    return bool(record and record.enabled_at)


def start_setup(db: Session, user: Usuario) -> dict:
    """Gera (ou regera, enquanto não confirmado) o segredo TOTP e devolve o QR code."""
    record = get_record(db, user.id)
    if record and record.enabled_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="MFA já configurado")

    secret = pyotp.random_base32()
    encrypted = _fernet().encrypt(secret.encode()).decode()
    if record:
        record.secret_encrypted = encrypted
        record.last_used_step = None
    else:
        db.add(UserMfa(
            user_id=user.id,
            secret_encrypted=encrypted,
            created_at=datetime.now(tz=timezone.utc),
        ))
    db.commit()

    uri = pyotp.TOTP(secret, interval=TOTP_INTERVAL).provisioning_uri(
        name=user.email, issuer_name=settings.MFA_ISSUER_NAME
    )
    return {
        "otpauth_uri": uri,
        "qr_code": segno.make(uri, error="m").svg_data_uri(scale=5),
        "secret": secret,
    }


def verify_code(db: Session, user_id: int, code: str) -> bool:
    """Confere o código; ativa o MFA no primeiro acerto e bloqueia reutilização do mesmo passo."""
    record = get_record(db, user_id)
    if not record or not code or not code.isdigit() or len(code) != 6:
        return False

    totp = pyotp.TOTP(_decrypt(record), interval=TOTP_INTERVAL)
    now = datetime.now(tz=timezone.utc)
    current_step = totp.timecode(now)
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        step = current_step + offset
        if record.last_used_step is not None and step <= record.last_used_step:
            continue
        if pyotp.utils.strings_equal(totp.generate_otp(step), code):
            record.last_used_step = step
            if not record.enabled_at:
                record.enabled_at = now
            db.commit()
            return True
    return False


def reset(db: Session, user_id: int) -> bool:
    record = get_record(db, user_id)
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
