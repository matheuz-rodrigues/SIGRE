from sqlalchemy import Column, Integer, String, Text, Date, Time, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.try_database import Base

class Solicitacao(Base):
    __tablename__ = "solicitacoes"

    id = Column(Integer, primary_key=True, index=True)
    solicitante = Column(String(150), nullable=False)
    email = Column(String(150), nullable=False, index=True)
    matricula = Column(String(50), nullable=False)
    papel = Column(String(50), nullable=False) # aluno, professor, etc.
    
    motivo = Column(String(100), nullable=False)
    descricao = Column(Text, nullable=False)
    observacoes = Column(Text, nullable=True)
    participantes = Column(Integer, nullable=True)
    
    dia_semana = Column(String(20), nullable=False)
    data_evento = Column(Date, nullable=True)
    horario_inicio = Column(Time, nullable=False)
    horario_fim = Column(Time, nullable=False)
    
    fk_sala = Column(Integer, ForeignKey("salas.id"), nullable=False)
    fk_curso = Column(Integer, ForeignKey("cursos.id"), nullable=True)
    fk_alocacao = Column(Integer, ForeignKey("alocacao.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), server_default="pendente") # pendente, aprovado, recusado
    motivo_recusa = Column(Text, nullable=True)
    
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relacionamentos
    sala = relationship("Sala")
    curso_rel = relationship("Curso")
    alocacao = relationship("Alocacao", foreign_keys=[fk_alocacao])

    @property
    def curso(self):
        return self.curso_rel.nome if self.curso_rel else None
