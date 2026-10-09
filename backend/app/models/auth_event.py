from sqlalchemy import Column, Integer, String, Boolean, DateTime, Index
from app.try_database import Base


class AuthEvent(Base):
    """Registro de eventos de autenticação.

    Serve para a limitação de tentativas (login, MFA e cadastro) e como trilha de auditoria.
    """
    __tablename__ = "auth_events"

    id = Column(Integer, primary_key=True)
    # login, mfa, register
    event_type = Column(String(20), nullable=False)
    # e-mail/username normalizado (minúsculas) ou id do usuário no caso do MFA
    identifier = Column(String(255), nullable=True)
    ip = Column(String(64), nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_auth_events_type_identifier_created", "event_type", "identifier", "created_at"),
        Index("ix_auth_events_type_ip_created", "event_type", "ip", "created_at"),
    )
