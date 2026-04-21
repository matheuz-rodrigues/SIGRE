"""
Serviço de Relatórios — Camada de Negócio.

Responsável por agregar, filtrar e formatar dados para exportação,
isolando a lógica do banco de dados e as transformações de dados das rotas HTTP.
"""

from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models import Professor, Disciplina, Curso, Sala, Usuario, Alocacao
from app.schemas.report import UserReportOut, HistoryReportOut

def get_base_data(db: Session) -> Dict[str, Any]:
    """
    Obtém todos os registros das tabelas base para o relatório consolidado.
    
    Args:
        db (Session): Sessão ativa do banco de dados.
        
    Returns:
        Dict: Dicionário contendo listas de professores, disciplinas, cursos e salas.
    """
    return {
        "professors": db.query(Professor).all(),
        "disciplines": db.query(Disciplina).all(),
        "courses": db.query(Curso).all(),
        "rooms": db.query(Sala).all()
    }

def get_users_report_data(db: Session) -> List[UserReportOut]:
    """
    Processa a lista de usuários ativos e mapeia seus papéis para exibição.
    
    Args:
        db (Session): Sessão ativa do banco de dados.
        
    Returns:
        List[UserReportOut]: Lista de objetos formatados para o schema de saída.
    """
    users = db.query(Usuario).filter(Usuario.deleted_at.is_(None)).all()
    
    # Mapeamento de papéis conforme definido no sistema RBAC
    role_map = {1: "Aluno", 2: "Professor", 3: "Administrador"}
    
    return [
        UserReportOut(
            Nome=u.nome,
            Email=u.email,
            Papel=role_map.get(u.tipo_usuario, "Usuário"),
            Curso=u.curso,
            Status="Ativo"
        ) for u in users
    ]

def get_allocation_history_data(db: Session) -> List[HistoryReportOut]:
    """
    Recupera todo o histórico de alocações e formata as colunas para o frontend.
    
    Realiza o join implícito via relacionamentos do SQLAlchemy para buscar
    nomes de professores, disciplinas e salas.
    
    Args:
        db (Session): Sessão ativa do banco de dados.
        
    Returns:
        List[HistoryReportOut]: Lista de alocações formatadas (strings DD/MM/YYYY e HH:MM).
    """
    allocations = db.query(Alocacao).order_by(desc(Alocacao.dia_horario_inicio)).all()
    
    report = []
    for a in allocations:
        # Formatação de Data e Horário seguindo padrões brasileiros
        data_str = a.dia_horario_inicio.strftime("%d/%m/%Y")
        periodo_str = f"{a.dia_horario_inicio.strftime('%H:%M')} - {a.dia_horario_saida.strftime('%H:%M')}"
        
        # Fallbacks amigáveis para campos nulos
        report.append(HistoryReportOut(
            data=data_str,
            periodo=periodo_str,
            professor=a.professor.nome if a.professor else (a.usuario.nome if a.usuario else "Não informado"),
            disciplina=a.disciplina.nome if a.disciplina else (a.uso or "Não informada"),
            curso=a.curso.nome if a.curso else None,
            sala=a.sala.descricao_sala or a.sala.codigo_sala if a.sala else "Desconhecida"
        ))
        
    return report
