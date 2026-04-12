"""
Modelo SQLAlchemy para a entidade Professor.
"""

from sqlalchemy import Column, Integer, String, TIMESTAMP
from sqlalchemy.sql import func
from app.try_database import Base

class Professor(Base):
    """
    Representa um professor no sistema.
    
    Esta entidade é utilizada para cadastros base e relatórios, 
    podendo estar vinculada a alocações de salas.
    """
    __tablename__ = "professores"

    id = Column(Integer, primary_key=True, index=True)
    
    # Nome completo do docente
    nome = Column(String(150), nullable=False)
    
    # E-mail institucional ou de contato (único para identificação)
    email = Column(String(150), unique=True, nullable=False)
    
    # Matrícula / SIAPE (opcional; única quando informada)
    matricula = Column(String(50), unique=True, nullable=True)
    
    # Campos de auditoria mantidos automaticamente
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
