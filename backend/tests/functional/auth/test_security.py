"""Testes dos controles pedidos na análise de segurança (DSPD/UEPA)."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import jwt
import pytest

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
    cookies = resp.headers.get_list("set-cookie")
    assert {c.split("=", 1)[0] for c in cookies} == {"access_token", "refresh_token", "csrf_token"}
    for cookie in cookies:
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie, cookie
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


# ---------- MFA (código por e-mail) ----------

@pytest.fixture
def mfa_enforced(monkeypatch):
    """Exige MFA para admin/técnico e captura os e-mails em vez de enviá-los."""
    monkeypatch.setattr(settings, "MFA_REQUIRED_ROLES", [3, 4])
    sent = []
    monkeypatch.setattr("app.services.auth.mfa.send_code_email", lambda user, code: sent.append((user.email, code)))
    return sent


def _mfa_record(db, user):
    from app.models.mfa_code import MfaCode
    db.expire_all()
    return db.query(MfaCode).filter(MfaCode.user_id == user.id).first()


def test_mfa_email_flow(client, db_session, mfa_enforced):
    _make_user(db_session, "tecmfa@uepa.br", "tecmfa", tipo=4)

    first = _login(client, "tecmfa").json()
    assert first == {
        "mfa_required": True, "mfa_method": "email",
        "email_hint": "te***@uepa.br", "mfa_token": first["mfa_token"],
    }
    assert client.cookies.get("access_token") is None
    assert len(mfa_enforced) == 1 and mfa_enforced[0][0] == "tecmfa@uepa.br"
    code = mfa_enforced[0][1]
    assert len(code) == 6 and code.isdigit()

    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/auth/mfa/verify", json={"mfa_token": first["mfa_token"], "code": wrong}).status_code == 401

    ok = client.post("/auth/mfa/verify", json={"mfa_token": first["mfa_token"], "code": code})
    assert ok.status_code == 200
    assert ok.json()["papel"] == "tecnico_adm"
    assert client.cookies.get("access_token")

    # Uso único: o mesmo código não vale num novo login
    client.cookies.clear()
    second = _login(client, "tecmfa").json()
    assert client.post("/auth/mfa/verify", json={"mfa_token": second["mfa_token"], "code": code}).status_code == 401


def test_mfa_code_is_not_stored_in_plaintext(client, db_session, mfa_enforced):
    user = _make_user(db_session, "hashmfa@uepa.br", "hashmfa", tipo=3)
    _login(client, "hashmfa")
    code = mfa_enforced[-1][1]
    record = _mfa_record(db_session, user)
    assert record.code_hash != code and code not in record.code_hash


def test_mfa_code_expires(client, db_session, mfa_enforced):
    user = _make_user(db_session, "expmfa@uepa.br", "expmfa", tipo=3)
    token = _login(client, "expmfa").json()["mfa_token"]
    record = _mfa_record(db_session, user)
    record.expires_at = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    resp = client.post("/auth/mfa/verify", json={"mfa_token": token, "code": mfa_enforced[-1][1]})
    assert resp.status_code == 401


def test_mfa_code_invalidated_after_max_attempts(client, db_session, mfa_enforced, monkeypatch):
    monkeypatch.setattr(settings, "MFA_CODE_MAX_ATTEMPTS", 3)
    _make_user(db_session, "attmfa@uepa.br", "attmfa", tipo=3)
    token = _login(client, "attmfa").json()["mfa_token"]
    code = mfa_enforced[-1][1]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(3):
        client.post("/auth/mfa/verify", json={"mfa_token": token, "code": wrong})
    assert client.post("/auth/mfa/verify", json={"mfa_token": token, "code": code}).status_code == 401


def test_second_login_within_cooldown_reuses_code(client, db_session, mfa_enforced):
    _make_user(db_session, "dupmfa@uepa.br", "dupmfa", tipo=3)
    _login(client, "dupmfa")
    second = _login(client, "dupmfa").json()
    assert len(mfa_enforced) == 1
    resp = client.post("/auth/mfa/verify", json={"mfa_token": second["mfa_token"], "code": mfa_enforced[0][1]})
    assert resp.status_code == 200


def test_mfa_resend_respects_cooldown_and_replaces_code(client, db_session, mfa_enforced):
    from app.models.auth_event import AuthEvent
    user = _make_user(db_session, "resmfa@uepa.br", "resmfa", tipo=3)
    token = _login(client, "resmfa").json()["mfa_token"]
    old_code = mfa_enforced[-1][1]

    too_soon = client.post("/auth/mfa/resend", json={"mfa_token": token})
    assert too_soon.status_code == 429
    assert int(too_soon.headers["Retry-After"]) > 0

    db_session.query(AuthEvent).filter(
        AuthEvent.event_type == "mfa_send", AuthEvent.user_id == user.id
    ).update({AuthEvent.created_at: datetime.now(tz=timezone.utc) - timedelta(minutes=2)})
    db_session.commit()

    resent = client.post("/auth/mfa/resend", json={"mfa_token": token})
    assert resent.status_code == 200
    assert resent.json()["email_hint"] == "re***@uepa.br"
    new_code = mfa_enforced[-1][1]
    if new_code != old_code:
        assert client.post("/auth/mfa/verify", json={"mfa_token": token, "code": old_code}).status_code == 401
    assert client.post("/auth/mfa/verify", json={"mfa_token": token, "code": new_code}).status_code == 200


def test_mfa_send_limit_per_window(client, db_session, mfa_enforced, monkeypatch):
    monkeypatch.setattr(settings, "MFA_RESEND_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(settings, "MFA_MAX_SENDS_PER_WINDOW", 2)
    _make_user(db_session, "bombmfa@uepa.br", "bombmfa", tipo=3)
    token = _login(client, "bombmfa").json()["mfa_token"]
    assert client.post("/auth/mfa/resend", json={"mfa_token": token}).status_code == 200
    assert client.post("/auth/mfa/resend", json={"mfa_token": token}).status_code == 429
    assert len(mfa_enforced) == 2


def test_mfa_email_failure_returns_503(client, db_session, monkeypatch):
    from app.services.infra.email import EmailDeliveryError
    monkeypatch.setattr(settings, "MFA_REQUIRED_ROLES", [3, 4])

    def fail(user, code):
        raise EmailDeliveryError("smtp fora do ar")
    monkeypatch.setattr("app.services.auth.mfa.send_code_email", fail)
    user = _make_user(db_session, "failmfa@uepa.br", "failmfa", tipo=3)
    assert _login(client, "failmfa").status_code == 503
    assert _mfa_record(db_session, user) is None


def test_mfa_token_cannot_resend_for_deleted_user(client, db_session, mfa_enforced):
    user = _make_user(db_session, "delmfa@uepa.br", "delmfa", tipo=4)
    token = create_mfa_token(user.id)
    user.deleted_at = datetime.now(tz=timezone.utc)
    db_session.commit()
    assert client.post("/auth/mfa/resend", json={"mfa_token": token}).status_code == 401


def test_mfa_roles_cannot_use_password_only_token_endpoint(client, db_session, mfa_enforced):
    _make_user(db_session, "admmfa@uepa.br", "admmfa", tipo=3)
    resp = client.post("/auth/token", data={"username": "admmfa", "password": PASSWORD})
    assert resp.status_code == 403


def test_mfa_verify_is_rate_limited(client, db_session, mfa_enforced):
    _make_user(db_session, "mfabrute@uepa.br", "mfabrute", tipo=4)
    token = _login(client, "mfabrute").json()["mfa_token"]
    for _ in range(settings.LOGIN_MAX_FAILURES):
        client.post("/auth/mfa/verify", json={"mfa_token": token, "code": "000000"})
    assert client.post("/auth/mfa/verify", json={"mfa_token": token, "code": "000000"}).status_code == 429


def test_send_email_uses_starttls_and_login(monkeypatch):
    from app.services.infra import email as email_mod
    monkeypatch.setattr(email_mod.settings, "SMTP_HOST", "smtp.uepa.br")
    monkeypatch.setattr(email_mod.settings, "SMTP_USER", "sigra")
    monkeypatch.setattr(email_mod.settings, "SMTP_PASSWORD", "x")
    server = MagicMock()
    server.__enter__.return_value = server
    with patch.object(email_mod.smtplib, "SMTP", return_value=server) as smtp:
        email_mod.send_email("a@uepa.br", "assunto", "corpo")
    smtp.assert_called_once()
    server.starttls.assert_called_once()
    server.login.assert_called_once_with("sigra", "x")
    server.send_message.assert_called_once()


# ---------- Cabeçalhos e configuração ----------

def test_security_headers_present(client):
    headers = client.get("/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["Referrer-Policy"] == "no-referrer"


@pytest.mark.parametrize("origin", [
    "https://evil.example", "null", "http://localhost:8080.evil.com",
    "http://localhost:8081", "https://localhost:8080", "http://localhost:8080/",
])
def test_cors_rejects_unknown_origin(client, origin):
    resp = client.options("/auth/login", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
    })
    assert resp.status_code == 400
    # Nenhum cabeçalho CORS para origem recusada (nem Allow-Credentials)
    assert not [h for h in resp.headers if h.lower().startswith("access-control-")]
    simple = client.get("/health", headers={"Origin": origin})
    assert simple.headers.get("access-control-allow-origin") is None
    assert "Origin" in simple.headers.get("vary", "")


def test_cors_allows_configured_origin_with_credentials(client):
    origin = settings.allowed_origins[0]
    resp = client.options("/auth/login", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
    })
    assert resp.headers["access-control-allow-origin"] == origin
    assert resp.headers["access-control-allow-credentials"] == "true"
    assert resp.headers.get("vary") == "Origin"


def test_production_requires_secure_cookies():
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        _hardened(COOKIE_SECURE=False).validate_for_production()


def test_production_rejects_default_secrets():
    with pytest.raises(RuntimeError):
        Settings(ENV="production").validate_for_production()


def test_production_accepts_hardened_config():
    Settings(
        ENV="production",
        DATABASE_URL="postgresql://sigra:" + "c" * 48 + "@db:5432/alocacoes",
        PROFESSOR_DEFAULT_PASSWORD="",
        JWT_SECRET="a" * 64,
        SESSION_SECRET="b" * 64,
        SMTP_HOST="smtp.uepa.br",
        TURNSTILE_SECRET_KEY="segredo",
        CORS_ORIGINS=["https://sigra.uepa.br"],
    ).validate_for_production()


def _hardened(**overrides):
    values = dict(
        ENV="production",
        DATABASE_URL="postgresql://sigra:" + "c" * 48 + "@db:5432/alocacoes",
        PROFESSOR_DEFAULT_PASSWORD="",
        JWT_SECRET="a" * 64,
        SESSION_SECRET="b" * 64,
        SMTP_HOST="smtp.uepa.br",
        MFA_REQUIRED_ROLES=[3, 4],
        TURNSTILE_SECRET_KEY="segredo",
        CORS_ORIGINS=["https://sigra.uepa.br"],
    )
    values.update(overrides)
    return Settings(**values)


@pytest.mark.parametrize("db_url", [
    "postgresql://user:password@db:5432/alocacoes",
    "postgresql://sigra:<GERAR_SENHA_DO_BANCO>@db:5432/alocacoes",
    "postgresql://sigra:curta@db:5432/alocacoes",
])
def test_production_rejects_weak_database_password(db_url):
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _hardened(DATABASE_URL=db_url).validate_for_production()


def test_production_rejects_weak_professor_default_password():
    with pytest.raises(RuntimeError, match="PROFESSOR_DEFAULT_PASSWORD"):
        _hardened(PROFESSOR_DEFAULT_PASSWORD="professor123").validate_for_production()


# ---------- Sessões: refresh token, status e troca de senha ----------

def test_refresh_token_is_stored_hashed(client, db_session):
    from app.models.refresh_token import RefreshToken
    user = _make_user(db_session, "hashrt@aluno.uepa.br", "hashrt")
    _login(client, "hashrt")
    plain = client.cookies.get("refresh_token")
    stored = [r.token for r in db_session.query(RefreshToken).filter(RefreshToken.user_id == user.id)]
    assert plain and plain not in stored


def test_reused_refresh_token_revokes_all_sessions(client, db_session):
    from app.models.refresh_token import RefreshToken
    user = _make_user(db_session, "reuse@aluno.uepa.br", "reuseuser")
    _login(client, "reuseuser")
    stolen = client.cookies.get("refresh_token")
    assert client.post("/auth/refresh").status_code == 200
    current = client.cookies.get("refresh_token")

    # Fora da janela de tolerância entre abas
    old = datetime.now(tz=timezone.utc) - timedelta(minutes=5)
    db_session.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.isnot(None)
    ).update({RefreshToken.revoked_at: old})
    db_session.commit()

    client.cookies.clear()
    client.cookies.set("refresh_token", stolen, path="/auth")
    assert client.post("/auth/refresh").status_code == 401

    client.cookies.clear()
    client.cookies.set("refresh_token", current, path="/auth")
    assert client.post("/auth/refresh").status_code == 401


def test_concurrent_refresh_within_grace_does_not_revoke_all(client, db_session):
    _make_user(db_session, "grace@aluno.uepa.br", "graceuser")
    _login(client, "graceuser")
    first = client.cookies.get("refresh_token")
    assert client.post("/auth/refresh").status_code == 200
    current = client.cookies.get("refresh_token")

    client.cookies.clear()
    client.cookies.set("refresh_token", first, path="/auth")
    assert client.post("/auth/refresh").status_code == 401

    client.cookies.clear()
    client.cookies.set("refresh_token", current, path="/auth")
    assert client.post("/auth/refresh").status_code == 200


def test_refused_user_loses_access_immediately(client, db_session):
    user = _make_user(db_session, "cut@aluno.uepa.br", "cutuser")
    headers = {"Authorization": f"Bearer {create_access_token(user.email, user.id, 1)}"}
    assert client.get("/users/me", headers=headers).status_code == 200
    user.status = "recusado"
    db_session.commit()
    assert client.get("/users/me", headers=headers).status_code == 401


def test_password_change_revokes_other_sessions(client, db_session):
    from app.services.auth.security import create_refresh_token, validate_refresh_token
    user = _make_user(db_session, "pwchange@aluno.uepa.br", "pwchange")
    other_device = create_refresh_token(db_session, user.id)
    csrf = _login(client, "pwchange").json()["csrf_token"]

    resp = client.patch(
        f"/users/{user.id}",
        json={"senha_atual": PASSWORD, "senha": "Outro#Segredo2027y"},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200
    assert validate_refresh_token(db_session, other_device) is None
    # A sessão atual recebe um refresh token novo e continua funcionando
    assert client.post("/auth/refresh").status_code == 200


# ---------- Autorização ----------

def test_regular_user_cannot_list_users(client, db_session):
    user = _make_user(db_session, "lister@aluno.uepa.br", "lister")
    headers = {"Authorization": f"Bearer {create_access_token(user.email, user.id, 1)}"}
    assert client.get("/users/", headers=headers).status_code == 403


@pytest.mark.parametrize("field,value", [
    ("email", "outro@gmail.com"),
    ("username", "novo_nome"),
])
def test_user_cannot_change_own_email_or_username(client, db_session, field, value):
    user = _make_user(db_session, "selfedit@aluno.uepa.br", "selfedit")
    headers = {"Authorization": f"Bearer {create_access_token(user.email, user.id, 1)}"}
    resp = client.patch(f"/users/{user.id}", json={field: value}, headers=headers)
    assert resp.status_code == 403


def test_production_requires_smtp_with_tls():
    with pytest.raises(RuntimeError, match="SMTP_HOST"):
        _hardened(SMTP_HOST="").validate_for_production()
    with pytest.raises(RuntimeError, match="SMTP_STARTTLS"):
        _hardened(SMTP_STARTTLS=False, SMTP_SSL=False).validate_for_production()
