from pydantic import BaseModel, Field, ConfigDict, computed_field, AliasChoices, field_validator
from typing import Optional
from datetime import datetime
import re

# A cor vai direto para o atributo style no front: só aceita #RRGGBB (bloqueia url(), expressões etc.)
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validar_cor(v: Optional[str]) -> Optional[str]:
    if v in (None, ""):
        return None
    if not _HEX_COLOR.match(v):
        raise ValueError("A cor deve estar no formato #RRGGBB")
    return v

class CourseBase(BaseModel):
    nomeCurso: str = Field(..., validation_alias=AliasChoices("nomeCurso", "nome"), serialization_alias="nomeCurso")
    siglaCurso: Optional[str] = Field(None, validation_alias=AliasChoices("siglaCurso", "sigla"), serialization_alias="siglaCurso")
    corCurso: Optional[str] = Field(None, validation_alias=AliasChoices("corCurso", "cor"), serialization_alias="corCurso")

class CourseCreate(BaseModel):
    nomeCurso: str
    siglaCurso: Optional[str] = None
    corCurso: Optional[str] = None

    @field_validator('corCurso')
    @classmethod
    def validar_cor(cls, v: Optional[str]) -> Optional[str]:
        return _validar_cor(v)

class CourseUpdate(BaseModel):
    nomeCurso: Optional[str] = None
    siglaCurso: Optional[str] = None
    corCurso: Optional[str] = None

    @field_validator('corCurso')
    @classmethod
    def validar_cor(cls, v: Optional[str]) -> Optional[str]:
        return _validar_cor(v)

class CourseOut(CourseBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @computed_field
    @property
    def idCurso(self) -> int:
        return self.id
