from pydantic import BaseModel, Field, ConfigDict, computed_field, AliasChoices
from typing import Optional

class ProfessorBase(BaseModel):
    nomeProf: str = Field(..., validation_alias=AliasChoices("nomeProf", "nome"), serialization_alias="nomeProf")
    emailProf: Optional[str] = Field(None, validation_alias=AliasChoices("emailProf", "email"), serialization_alias="emailProf")
    matriculaProf: Optional[str] = Field(None, validation_alias=AliasChoices("matriculaProf", "matricula"), serialization_alias="matriculaProf")

class ProfessorCreate(BaseModel):
    """matriculaProf é opcional (SIAPE / matrícula funcional)."""

    nomeProf: str
    emailProf: str
    matriculaProf: Optional[str] = None

class ProfessorUpdate(BaseModel):
    nomeProf: Optional[str] = None
    emailProf: Optional[str] = None
    matriculaProf: Optional[str] = None

class ProfessorOut(ProfessorBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @computed_field
    @property
    def idProfessor(self) -> int:
        return self.id
