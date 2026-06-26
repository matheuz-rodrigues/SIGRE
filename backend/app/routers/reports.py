"""
Roteador de Relatórios (Exportação de Dados).

Este módulo define as rotas de API para extração de dados formatados para relatórios
no frontend. Segue a metodologia API First e utiliza a camada de serviço para
processamento de dados.
"""

from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.report import BaseDataReportOut, UserReportOut, HistoryReportOut
from app.services.auth.rbac import require_role_exact, ROLE_ADMIN
from app import services

# Note: assuming 'report_service' is accessible via 'app.services.reporting.report_service'
# or directly imported. Given the project structure:
from app.services.reporting import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get(
    "/base", 
    response_model=BaseDataReportOut,
    summary="Obter Cadastros Base para Relatórios",
    description="Retorna um objeto consolidado contendo todos os Professores, Disciplinas, Cursos e Salas cadastrados no sistema."
)
def get_base_data_report(
    db: Session = Depends(get_db), 
    _u=Depends(require_role_exact(ROLE_ADMIN))
):
    """
    Endpoint que agrupa os quatro pilares de cadastros do sistema.
    Acesso restrito a administradores.
    """
    return report_service.get_base_data(db)

@router.get(
    "/users", 
    response_model=List[UserReportOut],
    summary="Obter Lista de Usuários para Relatórios",
    description="Retorna a lista completa de usuários ativos com seus respectivos papéis formatados (Aluno, Professor, Administrador)."
)
def get_users_report(
    db: Session = Depends(get_db), 
    _u=Depends(require_role_exact(ROLE_ADMIN))
):
    """
    Lista todos os usuários não-removidos do sistema.
    Acesso restrito a administradores.
    """
    return report_service.get_users_report_data(db)

@router.get(
    "/history", 
    response_model=List[HistoryReportOut],
    summary="Obter Histórico de Alocações para Relatórios",
    description="Retorna o histórico cronológico de alocações (reservas) com nomes de professores e disciplinas resolvidos."
)
def get_history_report(
    db: Session = Depends(get_db), 
    _u=Depends(require_role_exact(ROLE_ADMIN))
):
    """
    Lista todas as alocações ordenadas da mais recente para a mais antiga.
    Campos como Data e Horário são retornados como strings já formatadas.
    Acesso restrito a administradores.
    """
    return report_service.get_allocation_history_data(db)
