# app/schemas/user.py

from pydantic import BaseModel, EmailStr, ConfigDict, Field, computed_field, AliasChoices, field_validator
from typing import Optional, Any, Union
from datetime import datetime
import re

def validar_senha_forte(v: Optional[str]) -> Optional[str]:
    if not v:
        return v
        
    if not re.match(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$", v):
        raise ValueError("A senha deve ter no mínimo 12 caracteres, incluindo maiúsculas, minúsculas, números e símbolos.")
    
    termos_proibidos = (
        "senha", "password", "12345", "qwerty", "admin", "teste", 
        "sigra", "uepa", "aluno", "prof"
    )
    
    v_lower = v.lower()
    if any(termo in v_lower for termo in termos_proibidos):
        raise ValueError("A senha contém termos proibidos, previsíveis ou dados do sistema.")
        
    return v

class UserLogin(BaseModel):
    username: str
    senha: str = Field(..., validation_alias="password")

    # Suporte para ambos no dump
    model_config = ConfigDict(populate_by_name=True)

class UserBase(BaseModel):
    nome: str
    email: EmailStr
    username: Optional[str] = None
    telefone: Optional[str] = None
    tipo_usuario: int = 1  # 1=aluno, 2=professor, 3=admin, 4=tecnico_adm
    curso: Optional[str] = None
    cursoId: Optional[int] = Field(None, validation_alias=AliasChoices("cursoId", "fk_curso", "curso_id"), serialization_alias="cursoId")

class UserCreate(UserBase):
    senha: str
    departamento: Optional[str] = None
    # Alias para frontend
    papel: Optional[str] = Field(None, validation_alias="papel")

    @field_validator('senha')
    @classmethod
    def validar_complexidade(cls, v: str) -> str:
        return validar_senha_forte(v)

class UserUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    telefone: Optional[str] = None
    tipo_usuario: Optional[int] = None
    senha: Optional[str] = None
    senha_atual: Optional[str] = None
    cursoId: Optional[int] = Field(None, alias="cursoId")
    departamento: Optional[str] = None
    status: Optional[str] = None
    papel: Optional[str] = None

    @field_validator('senha')
    @classmethod
    def validar_complexidade(cls, v: str) -> str:
        return validar_senha_forte(v)

class UserOut(UserBase):
    id: int
    departamento: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @computed_field
    @property
    def papel(self) -> str:
        roles = {1: "aluno", 2: "professor", 3: "admin", 4: "tecnico_adm"}
        return roles.get(self.tipo_usuario, "aluno")