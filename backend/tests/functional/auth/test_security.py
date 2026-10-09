"""Testes dos controles pedidos na análise de segurança (DSPD/UEPA)."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import jwt
import pyotp
import pytest
from cryptography.fernet import Fernet

from app.config import Settings, get_settings
from app.models.user import Usuario
from app.services.auth.security import (
    hash_password, create_access_token, create_mfa_token, decode_token,
)

settings = get_settings()
PASSWORD = "Sigilo#Forte2026x"


def _make_user(db, email, username, tipo=1, status="aprovado"):
    user = db.query(Usuario).filter(Usuario.email == email).first()
    if user:
        return user
    user = Usuario(
        nome=username, email=email, username=username,
        senha=hash_password(PASSWORD), tipo_usuario=tipo, status=status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client, username, password=PASSWORD):
    return client.post("/auth/login", json={"username": username, "password": password})


@pytest.fixture(autouse=True)
def fresh_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


# ---------- JWT (PyJWT) ----------

def _forge(**overrides):
    now = datetime.now(tz=timezone.utc)
    claims = {
        "sub": "x@uepa.br", "uid": 1, "typ": "access", "jti": "j",
        "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE,
        "iat": now, "nbf": now, "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")


def test_access_token_roundtrip():
    payload = decode_token(create_access_token("a@uepa.br", 7, 1))
    assert payload["uid"] == 7
    assert payload["iss"] == settings.JWT_ISSUER


@pytest.mark.parametrize("overrides", [
    {"iss": "outro-emissor"},
    {"aud": "outra-audiencia"},
    {"exp": datetime.now(tz=timezone.utc) - timedelta(minutes=1)},
    {"typ": "mfa"},
])
def test_invalid_claims_are_rejected(overrides):
    assert decode_token(_forge(**overrides)) is None


def test_alg_none_is_rejected():
    token = jwt.encode({"uid": 1, "typ": "access"}, key=None, algorithm="none")
    assert decode_token(token) is None


def test_mfa_token_is_not_an_access_token(client, db_session):
    user = _make_user(db_session, "mfatok@aluno.uepa.br", "mfatok")
    headers = {"Authorization": f"Bearer {create_mfa_token(user.id)}"}
    assert client.get("/users/me", headers=headers).status_code == 401


# ---------- Cookies HttpOnly + CSRF ----------

def test_login_sets_httponly_cookies_and_csrf(client, db_session):
    _make_user(db_session, "cookie@aluno.uepa.br", "cookieuser")
    resp = _login(client, "cookieuser")
    assert resp.status_code == 200
    assert "access_token" not in resp.json()
    set_cookie = ",".join(resp.headers.get_list("set-cookie"))
    assert "access_token=" in set_cookie and "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert client.get("/users/me").status_code == 200


def test_cookie_session_requires_csrf_header(client, db_session):
    user = _make_user(db_session, "csrf@aluno.uepa.br", "csrfuser")
    csrf = _login(client, "csrfuser").json()["csrf_token"]

    no_header = client.patch(f"/users/{user.id}", json={"nome": "Sem header"})
    assert no_header.status_code == 403

    wrong = client.patch(f"/users/{user.id}", json={"nome": "Errado"}, headers={"X-CSRF-Token": "x"})
    assert wrong.status_code == 403

    ok = client.patch(f"/users/{user.id}", json={"nome": "Com header"}, headers={"X-CSRF-Token": csrf})
    assert ok.status_code == 200


def test_foreign_origin_is_rejected(client, db_session):
    user = _make_user(db_session, "origin@aluno.uepa.br", "originuser")
    csrf = _login(client, "originuser").json()["csrf_token"]
    resp = client.patch(
        f"/users/{user.id}", json={"nome": "x"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"},
    )
    assert resp.status_code == 403


def test_refresh_rotates_and_logout_clears(client, db_session):
    _make_user(db_session, "refresh@aluno.uepa.br", "refreshuser")
    _login(client, "refreshuser")
    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["csrf_token"] == client.cookies.get("csrf_token")

    client.post("/auth/logout")
    assert client.cookies.get("access_token") is None
    assert client.post("/auth/refresh").status_code == 401


def test_refresh_rejects_unapproved_user(client, db_session):
    user = _make_user(db_session, "revoked@aluno.uepa.br", "revokeduser")
    _login(client, "revokeduser")
    user.status = "recusado"
    db_session.commit()
    assert client.post("/auth/refresh").status_code == 401


# ---------- Limitação de tentativas ----------

def test_progressive_lockout_returns_429_with_retry_after(client, db_session):
    _make_user(db_session, "brute@aluno.uepa.br", "bruteuser")
    for _ in range(settings.LOGIN_MAX_FAILURES):
        assert _login(client, "bruteuser", "Errada#123456").status_code == 401

    blocked = _login(client, "bruteuser")  # mesmo com a senha certa
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_unknown_user_is_also_limited(client):
    for _ in range(settings.LOGIN_MAX_FAILURES):
        assert _login(client, "naoexiste@uepa.br", "x").status_code == 401
    assert _login(client, "naoexiste@uepa.br", "x").status_code == 429


def test_ip_limit_across_accounts(client, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES_PER_IP", 3)
    for i in range(3):
        _login(client, f"spray{i}@uepa.br", "x")
    assert _login(client, "spray-outro@uepa.br", "x").status_code == 429


# ---------- Cadastro ----------

def _register_payload(**overrides):
    payload = {
        "nome": "Novo", "email": "novo@aluno.uepa.br", "username": "novo",
        "senha": PASSWORD, "papel": "aluno",
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize("overrides", [
    {"papel": "admin", "email": "adm1@uepa.br", "username": "adm1"},
    {"papel": None, "tipo_usuario": 3, "email": "adm2@uepa.br", "username": "adm2"},
    {"email": "fora@gmail.com", "username": "fora"},
    {"email": "aluno@uepa.br", "username": "alunoerrado"},
])
def test_register_rejects_admin_and_foreign_domains(client, overrides):
    assert client.post("/auth/register", json=_register_payload(**overrides)).status_code == 422


def test_register_never_auto_approves(client, db_session):
    resp = client.post("/auth/register", json=_register_payload(
        papel="tecnico_adm", email="tec@uepa.br", username="tecnovo"))
    assert resp.status_code == 201
    assert db_session.get(Usuario, resp.json()["id"]).status == "pendente"


def test_register_can_be_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_REGISTRATION_ENABLED", False)
    assert client.post("/auth/register", json=_register_payload(username="off")).status_code == 403


def test_register_validates_turnstile(client, monkeypatch):
    monkeypatch.setattr(settings, "TURNSTILE_SECRET_KEY", "segredo-de-teste")
    resp = MagicMock(status_code=200)
    resp.json.return_value = {"success": False}
    with patch("app.services.auth.auth_service.httpx.post", return_value=resp):
        payload = _register_payload(email="bot@aluno.uepa.br", username="bot", turnstileToken="t")
        assert client.post("/auth/register", json=payload).status_code == 400
    assert client.post("/auth/register", json=_register_payload(username="semtoken")).status_code == 400


def test_register_rate_limit_per_ip(client, monkeypatch, db_session):
    from app.models.auth_event import AuthEvent
    db_session.query(AuthEvent).filter(AuthEvent.event_type == "register").delete()
    db_session.commit()
    monkeypatch.setattr(settings, "REGISTER_MAX_PER_IP_PER_HOUR", 2)
    for i in range(2):
        client.post("/auth/register", json=_register_payload(email=f"rl{i}@gmail.com", username=f"rl{i}"))
    resp = client.post("/auth/register", json=_register_payload(email="rl9@aluno.uepa.br", username="rl9"))
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


# ---------- Escalonamento de privilégio ----------

def test_user_cannot_promote_self(client, db_session):
    user = _make_user(db_session, "promo@aluno.uepa.br", "promouser")
    headers = {"Authorization": f"Bearer {create_access_token(user.email, user.id, user.tipo_usuario)}"}
    for body in ({"tipo_usuario": 3}, {"papel": "admin"}, {"status": "aprovado"}):
        assert client.patch(f"/users/{user.id}", json=body, headers=headers).status_code == 403
    db_session.refresh(user)
    assert user.tipo_usuario == 1


# ---------- MFA (TOTP) ----------

@pytest.fixture
def mfa_enforced(monkeypatch):
    monkeypatch.setattr(settings, "MFA_REQUIRED_ROLES", [3, 4])
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())


def test_mfa_setup_and_verify_flow(client, db_session, mfa_enforced):
    _make_user(db_session, "tecmfa@uepa.br", "tecmfa", tipo=4)

    first = _login(client, "tecmfa").json()
    assert first == {"mfa_setup_required": True, "mfa_token": first["mfa_token"]}
    assert client.cookies.get("access_token") is None

    setup = client.post("/auth/mfa/setup", json={"mfa_token": first["mfa_token"]}).json()
    assert setup["qr_code"].startswith("data:image/svg+xml")
    totp = pyotp.TOTP(setup["secret"])

    bad = client.post("/auth/mfa/verify", json={"mfa_token": first["mfa_token"], "code": "000000"})
    assert bad.status_code == 401

    code = totp.now()
    ok = client.post("/auth/mfa/verify", json={"mfa_token": first["mfa_token"], "code": code})
    assert ok.status_code == 200
    assert ok.json()["papel"] == "tecnico_adm"
    assert client.cookies.get("access_token")

    # Próximo login pede só o código, e o mesmo código não pode ser reutilizado
    client.cookies.clear()
    second = _login(client, "tecmfa").json()
    assert second["mfa_required"] is True
    replay = client.post("/auth/mfa/verify", json={"mfa_token": second["mfa_token"], "code": code})
    assert replay.status_code == 401
    assert client.post("/auth/mfa/setup", json={"mfa_token": second["mfa_token"]}).status_code == 409


def test_mfa_roles_cannot_use_password_only_token_endpoint(client, db_session, mfa_enforced):
    _make_user(db_session, "admmfa@uepa.br", "admmfa", tipo=3)
    resp = client.post("/auth/token", data={"username": "admmfa", "password": PASSWORD})
    assert resp.status_code == 403


def test_mfa_verify_is_rate_limited(client, db_session, mfa_enforced):
    _make_user(db_session, "mfabrute@uepa.br", "mfabrute", tipo=4)
    token = _login(client, "mfabrute").json()["mfa_token"]
    client.post("/auth/mfa/setup", json={"mfa_token": token})
    for _ in range(settings.LOGIN_MAX_FAILURES):
        client.post("/auth/mfa/verify", json={"mfa_token": token, "code": "000000"})
    assert client.post("/auth/mfa/verify", json={"mfa_token": token, "code": "000000"}).status_code == 429


# ---------- Cabeçalhos e configuração ----------

def test_security_headers_present(client):
    headers = client.get("/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["Referrer-Policy"] == "no-referrer"


def test_cors_rejects_unknown_origin(client):
    resp = client.options("/auth/login", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST",
    })
    assert resp.headers.get("access-control-allow-origin") is None


def test_production_rejects_default_secrets():
    with pytest.raises(RuntimeError):
        Settings(ENV="production").validate_for_production()


def test_production_accepts_hardened_config():
    Settings(
        ENV="production",
        JWT_SECRET="a" * 64,
        SESSION_SECRET="b" * 64,
        MFA_ENCRYPTION_KEY=Fernet.generate_key().decode(),
        TURNSTILE_SECRET_KEY="segredo",
        CORS_ORIGINS=["https://sigra.uepa.br"],
    ).validate_for_production()
