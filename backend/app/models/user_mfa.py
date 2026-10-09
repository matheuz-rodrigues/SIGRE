from sqlalchemy import Column, Integer, String, DateTime, BigInteger, ForeignKey
from app.try_database import Base


class UserMfa(Base):
    """Segredo TOTP do usuário, cifrado com MFA_ENCRYPTION_KEY."""
    __tablename__ = "user_mfa"

    user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    secret_encrypted = Column(String(255), nullable=False)
    # Preenchido quando o primeiro código é confirmado
    enabled_at = Column(DateTime(timezone=True), nullable=True)
    # Último passo de 30s aceito; impede reutilizar o mesmo código
    last_used_step = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
