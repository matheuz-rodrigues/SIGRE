import pytest
from app.models.solicitation import Solicitacao
from app.models.course import Curso
from app.models.user import Usuario
from app.models.allocation import Alocacao
from datetime import date, time, datetime, timedelta

def test_solicitation_course_persistence(client, db_session, user_token_headers):
    # 1. Setup metadata
    course = db_session.query(Curso).first()
    if not course:
        course = Curso(nome="Civil Engineering", sigla="ENG", cor="#112233")
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)
    
    from app.models.room import Sala
    room = db_session.query(Sala).first()
    if not room:
        room = Sala(codigo_sala=101, fk_tipo_sala=1, limite_usuarios=30, descricao_sala="Test Room")
        db_session.add(room)
        db_session.commit()
        db_session.refresh(room)

    # 2. Create solicitation with courseId
    payload = {
        "solicitante": "Applicant Name",
        "email": "applicant@test.com",
        "papel": "aluno",
        "motivo": "Academic Meeting",
        "descricao": "Description",
        "diaSemana": "Segunda-feira",
        "dataEvento": str(date.today()),
        "horarioInicio": "14:00:00",
        "horarioFim": "16:00:00",
        "salaId": room.id,
        "cursoId": course.id
    }
    response = client.post("/solicitations/", json=payload, headers=user_token_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["cursoId"] == course.id
    assert data["curso"] == course.nome

    # 3. Check Database
    db_sol = db_session.query(Solicitacao).filter(Solicitacao.email == "aluno@test.com").first()
    assert db_sol is not None
    assert db_sol.fk_curso == course.id

def test_reports_user_course_info(client, admin_token_headers, db_session):
    # Ensure a user with a course exists
    course = db_session.query(Curso).first()
    if not course:
        course = Curso(nome="Biology", sigla="BIO", cor="#00FF00")
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)
    
    user = db_session.query(Usuario).filter(Usuario.email == "report_user@test.com").first()
    if not user:
        from app.services.auth.security import hash_password
        user = Usuario(
            nome="Report User",
            email="report_user@test.com",
            username="reportuser",
            senha=hash_password("pwd"),
            tipo_usuario=1,
            fk_curso=course.id,
            status="aprovado"
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    response = client.get("/reports/users", headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    
    user_report = next((u for u in data if u["Email"] == "report_user@test.com"), None)
    assert user_report is not None
    assert user_report["Curso"] == course.nome

def test_reports_history_course_info(client, admin_token_headers, db_session):
    # Ensure an allocation with a course exists
    course = db_session.query(Curso).first()
    if not course:
        course = Curso(nome="Physics", sigla="PHY", cor="#0000FF")
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)
    
    from app.models.room import Sala
    room = db_session.query(Sala).first()
    if not room:
        room = Sala(codigo_sala=202, fk_tipo_sala=1, limite_usuarios=50, descricao_sala="History Room")
        db_session.add(room)
        db_session.commit()
        db_session.refresh(room)

    from app.models.user import Usuario
    user = db_session.query(Usuario).first()

    allocation = Alocacao(
        fk_sala=room.id,
        fk_usuario=user.id,
        fk_curso=course.id,
        tipo="EVENTUAL",
        dia_horario_inicio=datetime.now(),
        dia_horario_saida=datetime.now() + timedelta(hours=2),
        status="APPROVED",
        uso="Test Allocation"
    )
    db_session.add(allocation)
    db_session.commit()

    response = client.get("/reports/history", headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    
    found = False
    for item in data:
        if item.get("Disciplina") == "Test Allocation":
            assert item.get("Curso") == course.nome
            found = True
            break
    assert found
