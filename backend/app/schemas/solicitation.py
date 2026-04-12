from pydantic import BaseModel, Field, ConfigDict, computed_field, AliasChoices
from typing import Optional
from datetime import date, time, datetime
from app.schemas.room import RoomOut

class SolicitationBase(BaseModel):
    solicitante: str
    email: str
    matricula: str
    papel: str
    motivo: str
    descricao: str
    observacoes: Optional[str] = None
    participantes: Optional[int] = None
    diaSemana: str = Field(..., validation_alias=AliasChoices("diaSemana", "dia_semana"), serialization_alias="diaSemana")
    dataEvento: Optional[date] = Field(None, validation_alias=AliasChoices("dataEvento", "data_evento"), serialization_alias="dataEvento")
    horarioInicio: time = Field(..., validation_alias=AliasChoices("horarioInicio", "horario_inicio"), serialization_alias="horarioInicio")
    horarioFim: time = Field(..., validation_alias=AliasChoices("horarioFim", "horario_fim"), serialization_alias="horarioFim")
    salaId: int = Field(..., validation_alias=AliasChoices("salaId", "fk_sala"), serialization_alias="salaId")
    cursoId: Optional[int] = Field(None, validation_alias=AliasChoices("cursoId", "fk_curso", "curso_id"), serialization_alias="cursoId")
    curso: Optional[str] = None

class SolicitationCreate(SolicitationBase):
    pass

class SolicitationUpdateStatus(BaseModel):
    status: str
    motivoRecusa: Optional[str] = Field(None, alias="motivoRecusa")

class SolicitationOut(SolicitationBase):
    id: int
    status: str
    motivoRecusa: Optional[str] = Field(None, validation_alias=AliasChoices("motivoRecusa", "motivo_recusa"), serialization_alias="motivoRecusa")
    criadoEm: datetime = Field(..., validation_alias=AliasChoices("criadoEm", "created_at"), serialization_alias="criadoEm")
    fk_alocacao: Optional[int] = Field(None, serialization_alias="alocacaoId")
    sala: Optional[RoomOut] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @computed_field
    @property
    def idSolicitacao(self) -> int:
        return self.id
