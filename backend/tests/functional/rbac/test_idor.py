"""
Autorização por objeto (IDOR) e por papel.

Cada ator tenta ler, alterar ou apagar dados de outro usuário ou de um papel acima do seu.
"""
from datetime import datetime, timedelta

import pytest

from app.models.allocation import Alocacao
from app.models.room import Sala
from app.models.solicitation import Solicitacao
from app.models.user import Usuario
from app.services.auth.security import create_access_token


def _user(db, username, tipo, status="aprovado"):
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user:
        user = Usuario(nome=username, email=f"{username}@uepa.br", username=username,
                       senha="x", tipo_usuario=tipo, status=status)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _h(user):
    return {"Authorization": f"Bearer {create_access_token(user.email, user.id, user.tipo_usuario)}"}


@pytest.fixture
def actors(db_session):
    return {
        "aluno_a": _user(db_session, "idor_aluno_a", 1),
        "aluno_b": _user(db_session, "idor_aluno_b", 1),
        "professor": _user(db_session, "idor_prof", 2),
        "tecnico": _user(db_session, "idor_tecnico", 4),
        "admin": _user(db_session, "idor_admin", 3),
        "admin2": _user(db_session, "idor_admin2", 3),
    }


@pytest.fixture
def sala(db_session):
    room = db_session.query(Sala).filter(Sala.codigo_sala == "IDOR-1").first()
    if not room:
        room = Sala(codigo_sala="IDOR-1", descricao_sala="Sala IDOR", limite_usuarios=10)
        db_session.add(room)
        db_session.commit()
        db_session.refresh(room)
    return room


def _reserva(db, owner, sala, status="PENDING"):
    start = datetime.now() + timedelta(days=3)
    aloc = Alocacao(fk_usuario=owner.id, fk_sala=sala.id, tipo="Evento", uso=f"reserva de {owner.username}",
                    dia_horario_inicio=start, dia_horario_saida=start + timedelta(hours=1), status=status)
    db.add(aloc)
    db.commit()
    db.refresh(aloc)
    return aloc


# ---------- Reservas ----------

def test_user_cannot_delete_someone_elses_reservation(client, db_session, actors, sala):
    aula = _reserva(db_session, actors["admin"], sala, status="APPROVED")
    resp = client.delete(f"/reservations/{aula.id}", headers=_h(actors["aluno_a"]))
    assert resp.status_code == 403
    db_session.expire_all()
    assert db_session.get(Alocacao, aula.id) is not None


def test_user_cannot_edit_someone_elses_reservation(client, db_session, actors, sala):
    alheia = _reserva(db_session, actors["aluno_b"], sala)
    resp = client.patch(f"/reservations/{alheia.id}", json={"uso": "sequestrada"}, headers=_h(actors["aluno_a"]))
    assert resp.status_code == 403


def test_owner_cannot_self_approve_or_change_owner(client, db_session, actors, sala):
    propria = _reserva(db_session, actors["aluno_a"], sala)
    resp = client.patch(
        f"/reservations/{propria.id}",
        json={"status": "APPROVED", "fk_usuario": actors["aluno_b"].id, "uso": "nova descrição"},
        headers=_h(actors["aluno_a"]),
    )
    assert resp.status_code == 200
    db_session.expire_all()
    salva = db_session.get(Alocacao, propria.id)
    assert salva.status == "PENDING"
    assert salva.fk_usuario == actors["aluno_a"].id
    assert salva.uso == "nova descrição"


def test_owner_can_delete_own_reservation(client, db_session, actors, sala):
    propria = _reserva(db_session, actors["aluno_a"], sala)
    assert client.delete(f"/reservations/{propria.id}", headers=_h(actors["aluno_a"])).status_code == 200
    db_session.expire_all()
    assert db_session.get(Alocacao, propria.id) is None


def test_user_cannot_create_reservation_in_someone_elses_name(client, db_session, actors, sala):
    start = datetime.now() + timedelta(days=5)
    resp = client.post("/reservations/", json={
        "fk_usuario": actors["aluno_b"].id, "salaId": sala.id, "tipo": "Evento", "uso": "em nome de B",
        "dia_horario_inicio": start.isoformat(), "dia_horario_saida": (start + timedelta(hours=1)).isoformat(),
        "status": "APPROVED",
    }, headers=_h(actors["aluno_a"]))
    assert resp.status_code == 201
    db_session.expire_all()
    criada = db_session.query(Alocacao).filter(Alocacao.uso == "em nome de B").one()
    assert criada.fk_usuario == actors["aluno_a"].id
    assert criada.status == "PENDING"


def test_user_does_not_see_others_pending_reservations(client, db_session, actors, sala):
    _reserva(db_session, actors["aluno_b"], sala)
    items = client.get("/reservations/", headers=_h(actors["aluno_a"])).json()["items"]
    donos = {i["extendedProperties"]["private"]["fk_usuario"] for i in items if i["status"] != "APPROVED"}
    assert str(actors["aluno_b"].id) not in donos


@pytest.mark.parametrize("actor", ["aluno_a", "professor"])
@pytest.mark.parametrize("acao", ["approve", "refuse"])
def test_only_staff_can_approve_or_refuse_reservations(client, db_session, actors, sala, actor, acao):
    pendente = _reserva(db_session, actors["aluno_b"], sala)
    assert client.patch(f"/reservations/{acao}/{pendente.id}", headers=_h(actors[actor])).status_code == 403


# ---------- Solicitações ----------

def _solicitacao(db, owner, sala):
    sol = Solicitacao(solicitante=owner.nome, email=owner.email, papel="aluno", motivo="m", descricao=f"de {owner.username}",
                      dia_semana="Segunda", horario_inicio=datetime(2026, 1, 1, 8).time(),
                      horario_fim=datetime(2026, 1, 1, 9).time(), fk_sala=sala.id, status="pendente")
    db.add(sol)
    db.commit()
    db.refresh(sol)
    return sol


def test_mine_only_returns_own_solicitations(client, db_session, actors, sala):
    _solicitacao(db_session, actors["aluno_b"], sala)
    minhas = client.get("/solicitations/mine", headers=_h(actors["aluno_a"])).json()
    assert all(s["email"] == actors["aluno_a"].email for s in minhas)


@pytest.mark.parametrize("actor", ["aluno_a", "professor"])
def test_regular_users_cannot_list_or_decide_solicitations(client, db_session, actors, sala, actor):
    sol = _solicitacao(db_session, actors["aluno_b"], sala)
    assert client.get("/solicitations/", headers=_h(actors[actor])).status_code == 403
    resp = client.patch(f"/solicitations/{sol.id}/status", json={"status": "recusado"}, headers=_h(actors[actor]))
    assert resp.status_code == 403


# ---------- Usuários ----------

@pytest.mark.parametrize("actor", ["aluno_a", "professor", "tecnico"])
def test_non_admin_cannot_touch_other_users(client, actors, actor):
    alvo = actors["aluno_b"]
    h = _h(actors[actor])
    assert client.patch(f"/users/{alvo.id}", json={"nome": "invadido"}, headers=h).status_code == 403
    assert client.patch(f"/users/approve/{alvo.id}", headers=h).status_code == 403
    assert client.patch(f"/users/refuse/{alvo.id}", headers=h).status_code == 403
    assert client.delete(f"/users/{alvo.id}", headers=h).status_code == 403
    assert client.post("/users/", json={"nome": "x", "email": "x@uepa.br", "senha": "Outra#Senha2026x"},
                       headers=h).status_code == 403


@pytest.mark.parametrize("actor", ["aluno_a", "professor"])
def test_regular_users_cannot_list_users(client, actors, actor):
    assert client.get("/users/", headers=_h(actors[actor])).status_code == 403


def test_admin_cannot_edit_or_delete_another_admin(client, actors):
    h = _h(actors["admin"])
    alvo = actors["admin2"]
    assert client.patch(f"/users/{alvo.id}", json={"nome": "x"}, headers=h).status_code == 403
    assert client.delete(f"/users/{alvo.id}", headers=h).status_code == 403


def test_users_me_returns_only_the_caller(client, actors):
    for nome in ("aluno_a", "tecnico", "admin"):
        assert client.get("/users/me", headers=_h(actors[nome])).json()["id"] == actors[nome].id


# ---------- Cadastros, relatórios e painel (somente admin) ----------

ADMIN_ONLY = [
    ("post", "/rooms/", {"nomeSala": "X", "tipoSalaId": 1, "capacidade": 1}),
    ("put", "/rooms/1", {"nomeSala": "X"}),
    ("delete", "/rooms/1", None),
    ("post", "/room-types/", {"nome": "Tipo IDOR"}),
    ("put", "/room-types/1", {"nome": "Tipo IDOR"}),
    ("delete", "/room-types/1", None),
    ("post", "/courses/", {"nomeCurso": "X"}),
    ("put", "/courses/1", {"nomeCurso": "X"}),
    ("delete", "/courses/1", None),
    ("post", "/disciplines/", {"nomeDisciplina": "X"}),
    ("put", "/disciplines/1", {"nomeDisciplina": "X"}),
    ("delete", "/disciplines/1", None),
    ("post", "/periods/", {"semestre": "X", "dataInicio": "2026-01-01", "dataFim": "2026-06-30"}),
    ("put", "/periods/1", {"semestre": "X"}),
    ("delete", "/periods/1", None),
    ("post", "/professors/", {"nomeProf": "X", "emailProf": "x@uepa.br"}),
    ("put", "/professors/1", {"nomeProf": "X"}),
    ("delete", "/professors/1", None),
    ("get", "/reports/base", None),
    ("get", "/reports/users", None),
    ("get", "/reports/history", None),
    ("get", "/dashboard/metrics", None),
]


@pytest.mark.parametrize("actor", ["aluno_a", "professor", "tecnico"])
@pytest.mark.parametrize("method,path,body", ADMIN_ONLY)
def test_admin_only_routes(client, actors, actor, method, path, body):
    kwargs = {"headers": _h(actors[actor])}
    if body is not None:
        kwargs["json"] = body
    assert getattr(client, method)(path, **kwargs).status_code == 403


def test_professor_emails_only_for_staff(client, db_session, actors):
    _user(db_session, "idor_prof_lista", 2)
    aluno = client.get("/professors/", headers=_h(actors["aluno_a"])).json()
    admin = client.get("/professors/", headers=_h(actors["admin"])).json()
    assert aluno and all(p["emailProf"] is None for p in aluno)
    assert any(p["emailProf"] for p in admin)


# ---------- Sem autenticação ----------

PROTECTED = [
    ("get", "/users/me"), ("get", "/users/"), ("patch", "/users/1"), ("delete", "/users/1"),
    ("get", "/reservations/"), ("post", "/reservations/"), ("patch", "/reservations/1"), ("delete", "/reservations/1"),
    ("get", "/solicitations/"), ("get", "/solicitations/mine"), ("post", "/solicitations/"),
    ("get", "/rooms/"), ("get", "/room-types/"), ("get", "/periods/"), ("get", "/disciplines/"),
    ("get", "/professors/"), ("get", "/reports/base"), ("get", "/dashboard/metrics"),
    ("get", "/calendar/events"), ("get", "/google/status"), ("get", "/google/connect"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
def test_protected_routes_require_authentication(client, method, path):
    assert getattr(client, method)(path).status_code == 401
