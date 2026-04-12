from pydantic import BaseModel, Field, ConfigDict, computed_field, AliasChoices
from typing import Optional

class DisciplineBase(BaseModel):
    nomeDisciplina: str = Field(..., validation_alias=AliasChoices("nomeDisciplina", "nome"), serialization_alias="nomeDisciplina")
    matriculaDisciplina: Optional[str] = Field(None, validation_alias=AliasChoices("matriculaDisciplina", "codigo"), serialization_alias="matriculaDisciplina")

class DisciplineCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nomeDisciplina: str
    matriculaDisciplina: Optional[str] = None
    cursoId: Optional[int] = Field(None, validation_alias=AliasChoices("cursoId", "fk_curso"))


class DisciplineUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nomeDisciplina: Optional[str] = None
    matriculaDisciplina: Optional[str] = None
    cursoId: Optional[int] = Field(None, validation_alias=AliasChoices("cursoId", "fk_curso"))


class DisciplineOut(DisciplineBase):
    id: int
    cursoId: Optional[int] = Field(default=None, validation_alias=AliasChoices("cursoId", "fk_curso"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @computed_field
    @property
    def idDisciplina(self) -> int:
        return self.id
