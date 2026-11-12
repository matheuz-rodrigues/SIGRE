from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.try_database import Base


class MfaCode(Base):
    """Código de MFA enviado por e-mail. Um ativo por usuário; apagado ao ser usado."""
    __tablename__ = "mfa_codes"

    user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    # HMAC-SHA256 do código (chave JWT_SECRET): o banco nunca guarda o código em texto
    code_hash = Column(String(64), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    sent_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
