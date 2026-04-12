"""
Modelo SQLAlchemy para a entidade Disciplina.
"""

from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.try_database import Base

class Disciplina(Base):
    """
    Representa uma disciplina acadêmica cadastrada na instituição.
    """
    __tablename__ = "disciplinas"

    id = Column(Integer, primary_key=True, index=True)
    
    # Nome descritivo da disciplina
    nome = Column(String(150), nullable=False)
    
    # Código único (ex: MAT001, BES024)
    codigo = Column(String(50), unique=True, nullable=False)

    fk_curso = Column(Integer, ForeignKey("cursos.id", ondelete="SET NULL"), nullable=True)

    # Auditoria
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
