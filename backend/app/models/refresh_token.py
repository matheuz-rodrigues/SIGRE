from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.try_database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    # Com fuso: em timestamp sem fuso, o Postgres converte o UTC gravado para o fuso da sessão
    # (TZ=America/Belem no compose) e a leitura volta deslocada, quebrando a tolerância de reuso
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("Usuario", backref="refresh_tokens")
