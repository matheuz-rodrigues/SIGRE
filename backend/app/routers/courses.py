"""
Roteador de Cursos — Padronizado RESTful.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.course import CourseCreate, CourseUpdate, CourseOut
from app.services.course_service import course_service
from app.services.rbac import require_role, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/courses", tags=["courses"])

@router.get("/", response_model=List[CourseOut])
def list_courses(db: Session = Depends(get_db), _u=Depends(require_role(ROLE_USER))):
    return course_service.get_all(db)

@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(course: CourseCreate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    return course_service.create(db, course)

@router.put("/{course_id}", response_model=CourseOut)
def update_course(course_id: int, course: CourseUpdate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    db_course = course_service.update(db, course_id, course)
    if not db_course:
        raise HTTPException(status_code=404, detail="Curso não encontrado")
    return db_course

@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: int, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    success = course_service.delete(db, course_id)
    if not success:
        raise HTTPException(status_code=404, detail="Curso não encontrado")
    return None
