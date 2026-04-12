from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.try_database import Base

class Alocacao(Base):
    __tablename__ = "alocacao"

    id = Column(Integer, primary_key=True)
    fk_usuario = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fk_sala = Column(Integer, ForeignKey("salas.id"), nullable=False)
    fk_professor = Column(Integer, ForeignKey("professores.id"), nullable=True)
    fk_disciplina = Column(Integer, ForeignKey("disciplinas.id"), nullable=True)
    fk_curso = Column(Integer, ForeignKey("cursos.id"), nullable=True)
    fk_periodo = Column(Integer, ForeignKey("periodos.id"), nullable=True)
    
    tipo = Column(String(50), nullable=False)
    dia_horario_inicio = Column(DateTime, nullable=False)
    dia_horario_saida = Column(DateTime, nullable=False)
    
    # Detalhes para Calendário e Exportação
    dia_semana = Column(String(20)) # Ex: Segunda
    data_inicio = Column(DateTime)
    data_fim = Column(DateTime)
    
    uso = Column(String(255))
    justificativa = Column(String(255))
    oficio = Column(String(255))
    recurrency = Column(String, nullable=True)
    status = Column(String(20), default="PENDING", nullable=False)
    google_event_id = Column(String(255), nullable=True)

    # Relacionamentos
    usuario = relationship("Usuario")
    sala = relationship("Sala")
    professor = relationship("Professor")
    disciplina = relationship("Disciplina")
    curso = relationship("Curso")
    periodo = relationship("Periodo")