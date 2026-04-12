from pydantic import BaseModel, Field, ConfigDict, computed_field, AliasChoices
from typing import Optional
from datetime import datetime
from app.schemas.professor import ProfessorOut
from app.schemas.discipline import DisciplineOut
from app.schemas.period import PeriodOut

class ReservationBase(BaseModel):
    fk_usuario: int
    fk_sala: int = Field(..., validation_alias="salaId", serialization_alias="salaId")
    fk_professor: Optional[int] = Field(None, validation_alias="professorId", serialization_alias="professorId")
    fk_disciplina: Optional[int] = Field(None, validation_alias="disciplinaId", serialization_alias="disciplinaId")
    fk_curso: Optional[int] = Field(None, validation_alias="cursoId", serialization_alias="cursoId")
    fk_periodo: Optional[int] = Field(None, validation_alias="periodoId", serialization_alias="periodoId")
    
    tipo: str = Field(..., min_length=1, max_length=50)
    dia_horario_inicio: datetime
    dia_horario_saida: datetime
    
    dia_semana: Optional[str] = Field(None, validation_alias="diaSemana", serialization_alias="diaSemana")
    data_inicio: Optional[datetime] = Field(None, validation_alias="dataInicio", serialization_alias="dataInicio")
    data_fim: Optional[datetime] = Field(None, validation_alias="dataFim", serialization_alias="dataFim")
    
    uso: Optional[str] = None
    justificativa: Optional[str] = None
    oficio: Optional[str] = None
    recurrency: Optional[str] = None
    status: str = "PENDING"

class ReservationCreate(ReservationBase):
    pass

class ReservationUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    fk_usuario: Optional[int] = None
    fk_sala: Optional[int] = Field(None, validation_alias=AliasChoices("salaId", "fk_sala"))
    fk_professor: Optional[int] = Field(None, validation_alias=AliasChoices("professorId", "fk_professor"))
    fk_disciplina: Optional[int] = Field(None, validation_alias=AliasChoices("disciplinaId", "fk_disciplina"))
    fk_curso: Optional[int] = Field(None, validation_alias=AliasChoices("cursoId", "fk_curso"))
    fk_periodo: Optional[int] = Field(None, validation_alias=AliasChoices("periodoId", "fk_periodo"))

    tipo: Optional[str] = None
    dia_horario_inicio: Optional[datetime] = None
    dia_horario_saida: Optional[datetime] = None
    dia_semana: Optional[str] = Field(None, validation_alias=AliasChoices("diaSemana", "dia_semana"))
    data_inicio: Optional[datetime] = Field(None, validation_alias=AliasChoices("dataInicio", "data_inicio"))
    data_fim: Optional[datetime] = Field(None, validation_alias=AliasChoices("dataFim", "data_fim"))

    uso: Optional[str] = None
    justificativa: Optional[str] = None
    oficio: Optional[str] = None
    recurrency: Optional[str] = None
    status: Optional[str] = None

class ReservationOut(ReservationBase):
    id: int
    professor: Optional[ProfessorOut] = None
    disciplina: Optional[DisciplineOut] = None
    periodo: Optional[PeriodOut] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @computed_field
    @property
    def idAlocacao(self) -> int:
        return self.id

    @computed_field
    @property
    def horarioInicio(self) -> str:
        return self.dia_horario_inicio.strftime("%H:%M")

    @computed_field
    @property
    def horarioFim(self) -> str:
        return self.dia_horario_saida.strftime("%H:%M")
    
    @computed_field
    @property
    def cursoId(self) -> Optional[int]:
        return self.fk_curso

    @computed_field
    @property
    def salaId(self) -> int:
        return self.fk_sala

    @computed_field
    @property
    def periodoId(self) -> Optional[int]:
        return self.fk_periodo
