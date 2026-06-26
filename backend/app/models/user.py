from sqlalchemy import Column, Integer, String, TIMESTAMP, text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.try_database import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    username = Column(String(50), unique=True)
    telefone = Column(String(20))
    senha = Column(String(255), nullable=False)
    
    # tipo_usuario: 1=aluno, 2=professor, 3=admin, 4=tecnico_adm
    tipo_usuario = Column(Integer, server_default=text("1"))
    
    # Campos específicos
    fk_curso = Column(Integer, ForeignKey("cursos.id"), nullable=True)
    departamento = Column(String(100), nullable=True)
    
    # Relacionamentos
    curso_rel = relationship("Curso")

    @property
    def curso(self):
        """Retorna o nome do curso para compatibilidade."""
        return self.curso_rel.nome if self.curso_rel else None
    
    # Status: pendente, aprovado, recusado
    status = Column(String(20), server_default=text("'pendente'"))
    
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP)
