"""
RBAC boundary tests.

Verifies:
- Professor (tipo=2) is blocked from all admin-guarded routes after ROLE_ADMIN=3 fix.
- tecnico_adm (tipo=4) is blocked from management routes but allowed on scheduling routes.
"""
import pytest
from app.services.auth.security import create_access_token
from app.models.user import Usuario


def _headers(db_session, email: str, username: str, tipo_usuario: int) -> dict:
    user = db_session.query(Usuario).filter(Usuario.email == email).first()
    if not user:
        user = Usuario(
            nome=f"RBAC Test {email}",
            email=email,
            username=username,
            senha="hashed_pw",
            tipo_usuario=tipo_usuario,
            status="aprovado",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    token = create_access_token(subject=user.email, user_id=user.id, role=user.tipo_usuario)
    return {"Authorization": f"Bearer {token}"}


# ── Professor (tipo=2) must be 403 on management endpoints ──────────────────

def test_professor_blocked_from_dashboard(client, db_session):
    r = client.get("/dashboard/metrics", headers=_headers(db_session, "prof_rbac@test.com", "prof_rbac", 2))
    assert r.status_code == 403


def test_professor_blocked_from_reports_base(client, db_session):
    r = client.get("/reports/base", headers=_headers(db_session, "prof_rbac@test.com", "prof_rbac", 2))
    assert r.status_code == 403


def test_professor_blocked_from_reports_users(client, db_session):
    r = client.get("/reports/users", headers=_headers(db_session, "prof_rbac@test.com", "prof_rbac", 2))
    assert r.status_code == 403


def test_professor_blocked_from_create_room(client, db_session):
    r = client.post(
        "/rooms/",
        json={"nomeSala": "ProfRoom", "capacidade": 1},
        headers=_headers(db_session, "prof_rbac@test.com", "prof_rbac", 2),
    )
    assert r.status_code == 403


def test_professor_blocked_from_user_create(client, db_session):
    r = client.post(
        "/users/",
        json={"nome": "X", "email": "xprof@x.com", "username": "xprofuser", "senha": "Pass@123!", "tipo_usuario": 1},
        headers=_headers(db_session, "prof_rbac@test.com", "prof_rbac", 2),
    )
    assert r.status_code == 403


# ── tecnico_adm (tipo=4) blocked from management routes ─────────────────────

def test_tecnico_adm_blocked_from_dashboard(client, db_session):
    r = client.get("/dashboard/metrics", headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4))
    assert r.status_code == 403


def test_tecnico_adm_blocked_from_reports(client, db_session):
    r = client.get("/reports/base", headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4))
    assert r.status_code == 403


def test_tecnico_adm_blocked_from_create_room(client, db_session):
    r = client.post(
        "/rooms/",
        json={"nomeSala": "TecRoom", "capacidade": 1},
        headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4),
    )
    assert r.status_code == 403


def test_tecnico_adm_blocked_from_user_create(client, db_session):
    r = client.post(
        "/users/",
        json={"nome": "Y", "email": "ytec@y.com", "username": "ytecuser", "senha": "Pass@123!", "tipo_usuario": 1},
        headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4),
    )
    assert r.status_code == 403


def test_tecnico_adm_blocked_from_create_course(client, db_session):
    r = client.post(
        "/courses/",
        json={"nome": "TecCourse"},
        headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4),
    )
    assert r.status_code == 403


def test_tecnico_adm_blocked_from_editing_other_users(client, db_session, test_admin_user):
    r = client.patch(
        f"/users/{test_admin_user.id}",
        json={"nome": "Hacked"},
        headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4),
    )
    assert r.status_code == 403


# ── tecnico_adm allowed on scheduling/viewing endpoints ─────────────────────

def test_tecnico_adm_can_view_solicitations(client, db_session):
    r = client.get("/solicitations/", headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4))
    assert r.status_code == 200


def test_tecnico_adm_can_list_rooms(client, db_session):
    r = client.get("/rooms/", headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4))
    assert r.status_code == 200


def test_tecnico_adm_can_list_reservations(client, db_session):
    r = client.get("/reservations/", headers=_headers(db_session, "tecnico_rbac@test.com", "tecnico_rbac", 4))
    assert r.status_code == 200
