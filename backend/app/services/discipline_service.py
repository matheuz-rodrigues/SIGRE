from fastapi import HTTPException, status
from typing import Optional
from sqlalchemy.orm import Session
from app.services.base_service import BaseService
from app.repositories.discipline_repository import discipline_repository
from app.models.discipline import Disciplina
from app.schemas.discipline import DisciplineCreate, DisciplineUpdate


def _codigo_disciplina_limpo(raw: Optional[str]) -> str:
    """Remove sufixo legado `| META:{...}` embutido no código."""
    if not raw:
        return ""
    s = str(raw).strip()
    if "| META:" in s:
        s = s.split("| META:")[0].strip()
    return s


class DisciplineService(BaseService[Disciplina]):
    def __init__(self):
        super().__init__(discipline_repository)

    def create(self, db: Session, data: DisciplineCreate) -> Disciplina:
        codigo = _codigo_disciplina_limpo(data.matriculaDisciplina)
        if not codigo:
            raise HTTPException(status_code=400, detail="Código da disciplina é obrigatório")

        if db.query(Disciplina).filter(Disciplina.nome == data.nomeDisciplina).first():
            raise HTTPException(status_code=409, detail="Disciplina com este nome já cadastrada")
        if db.query(Disciplina).filter(Disciplina.codigo == codigo).first():
            raise HTTPException(status_code=409, detail="Disciplina com este código já cadastrada")

        db_data = {
            "nome": data.nomeDisciplina,
            "codigo": codigo,
            "fk_curso": data.cursoId,
        }
        return self.repository.create(db, db_data)

    def update(self, db: Session, id: int, data: DisciplineUpdate) -> Optional[Disciplina]:
        db_obj = self.repository.get_by_id(db, id)
        if not db_obj:
            return None

        dump = data.model_dump(exclude_unset=True)
        update_data: dict = {}
        if "nomeDisciplina" in dump and dump["nomeDisciplina"] is not None:
            update_data["nome"] = dump["nomeDisciplina"]
        if "matriculaDisciplina" in dump and dump["matriculaDisciplina"] is not None:
            codigo = _codigo_disciplina_limpo(dump["matriculaDisciplina"])
            if codigo:
                update_data["codigo"] = codigo
        if "cursoId" in dump:
            update_data["fk_curso"] = dump["cursoId"]

        if not update_data:
            return db_obj

        return self.repository.update(db, db_obj, update_data)


discipline_service = DisciplineService()
