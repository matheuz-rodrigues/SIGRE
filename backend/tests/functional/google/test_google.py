"""Rotas /google/* (OAuth e status) e unit tests de _get_credentials."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import pytest

# Capture the real _get_credentials before the autouse fixture mocks it at test-run time.
import app.services.calendar.google_calendar as _gc_module
_real_get_credentials = _gc_module._get_credentials


def test_google_status_unauthorized(client):
    r = client.get("/google/status")
    assert r.status_code == 401


def test_google_status_not_connected(client, admin_token_headers):
    r = client.get("/google/status", headers=admin_token_headers)
    assert r.status_code == 200
    assert r.json() == {"connected": False}


def test_google_connect_unauthorized(client):
    r = client.get("/google/connect")
    assert r.status_code == 401


def test_google_connect_depends_on_env(client, admin_token_headers):
    """Com credenciais no .env retorna JSON com auth_url; sem credenciais retorna 500."""
    r = client.get("/google/connect", headers=admin_token_headers)
    assert r.status_code in (200, 500)
    if r.status_code == 200:
        assert "auth_url" in r.json()
    else:
        assert "configured" in (r.json().get("detail") or "").lower()


@patch("app.routers.google.Flow")
def test_google_connect_returns_auth_url(mock_flow_cls, client, admin_token_headers, monkeypatch):
    """Ensure OAuth config exists: get_settings is lru_cached and Depends() keeps the real callable, so env + cache_clear is reliable in CI."""
    from app.config import get_settings

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/google/callback")
    get_settings.cache_clear()

    flow = MagicMock()
    flow.authorization_url.return_value = ("https://accounts.google.com/o/oauth2/auth?test=1", "state-xyz")
    mock_flow_cls.from_client_config.return_value = flow

    r = client.get("/google/connect", headers=admin_token_headers)
    assert r.status_code == 200
    data = r.json()
    assert "auth_url" in data
    assert "accounts.google.com" in data["auth_url"]


def test_google_callback_invalid_session(client):
    r = client.get("/google/callback?state=x&code=y")
    assert r.status_code == 400


# ── Unit tests for _get_credentials (called directly, bypassing autouse mock) ─

def test_get_credentials_returns_none_when_no_row(db_session):
    result = _real_get_credentials(db_session, user_id=99999)
    assert result is None


def test_get_credentials_returns_none_when_no_access_token(db_session):
    from app.models.google import GoogleCredential
    row = GoogleCredential(user_id=66661, refresh_token="r", scopes="s")
    db_session.add(row)
    db_session.commit()
    result = _real_get_credentials(db_session, user_id=66661)
    assert result is None


def test_get_credentials_refreshes_expired_token_and_persists(db_session):
    """Expired access_token → refresh() called → new token and expiry saved to DB."""
    from app.models.google import GoogleCredential

    new_expiry = datetime.now(tz=timezone.utc) + timedelta(hours=1)

    row = GoogleCredential(
        user_id=66662,
        access_token="stale_token",
        refresh_token="valid_refresh",
        scopes="https://www.googleapis.com/auth/calendar",
        expiry=datetime.now(tz=timezone.utc) - timedelta(hours=2),
        client_id="cid",
        client_secret="csecret",
    )
    db_session.add(row)
    db_session.commit()

    mock_creds = MagicMock()
    mock_creds.valid = False
    mock_creds.refresh_token = "valid_refresh"
    mock_creds.token = "fresh_token"
    mock_creds.expiry = new_expiry

    with patch.object(_gc_module, "Credentials", return_value=mock_creds), \
         patch.object(_gc_module, "GoogleRequest"):
        result = _real_get_credentials(db_session, user_id=66662)

    assert result is mock_creds
    mock_creds.refresh.assert_called_once()
    db_session.refresh(row)
    assert row.access_token == "fresh_token"
    assert row.expiry == new_expiry.replace(tzinfo=None)


def test_get_credentials_returns_none_when_refresh_fails(db_session):
    """If refresh raises, _get_credentials returns None instead of propagating."""
    from app.models.google import GoogleCredential

    row = GoogleCredential(
        user_id=66663,
        access_token="stale",
        refresh_token="bad_refresh",
        scopes="https://www.googleapis.com/auth/calendar",
        expiry=datetime.now(tz=timezone.utc) - timedelta(hours=1),
        client_id="cid",
        client_secret="csecret",
    )
    db_session.add(row)
    db_session.commit()

    mock_creds = MagicMock()
    mock_creds.valid = False
    mock_creds.refresh_token = "bad_refresh"
    mock_creds.refresh.side_effect = Exception("invalid_grant")

    with patch.object(_gc_module, "Credentials", return_value=mock_creds), \
         patch.object(_gc_module, "GoogleRequest"):
        result = _real_get_credentials(db_session, user_id=66663)

    assert result is None
