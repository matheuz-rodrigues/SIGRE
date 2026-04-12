"""Rotas /calendar/* — mocks em app.routers.calendar (imports diretos de google_calendar)."""
from datetime import datetime, timezone
from unittest.mock import patch

import pytest


def test_calendar_events_unauthorized(client):
    r = client.get("/calendar/events")
    assert r.status_code == 401


@patch("app.routers.calendar.list_events", return_value=[])
def test_calendar_events_month(_mock_list, client, admin_token_headers):
    r = client.get("/calendar/events", headers=admin_token_headers)
    assert r.status_code == 200
    assert r.json() == {"items": []}


@patch("app.routers.calendar.list_events", return_value=None)
def test_calendar_events_google_not_connected(_mock_list, client, admin_token_headers):
    r = client.get("/calendar/events", headers=admin_token_headers)
    assert r.status_code == 400
    assert "credentials" in (r.json().get("detail") or "").lower()


@patch("app.routers.calendar.list_events", return_value=[])
def test_calendar_google_list_events(_mock_list, client, admin_token_headers):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc).isoformat()
    end = datetime(2026, 1, 31, tzinfo=timezone.utc).isoformat()
    r = client.get(
        "/calendar/google/events",
        params={"start": start, "end": end},
        headers=admin_token_headers,
    )
    assert r.status_code == 200
    assert r.json() == {"items": []}


def test_calendar_google_list_missing_params(client, admin_token_headers):
    r = client.get("/calendar/google/events", headers=admin_token_headers)
    assert r.status_code == 422


@patch("app.routers.calendar.create_event", return_value={"id": "evt_test_1"})
def test_calendar_google_create_event(_mock_create, client, admin_token_headers):
    payload = {
        "summary": "Teste",
        "start_dt_utc": "2026-06-01T14:00:00Z",
        "end_dt_utc": "2026-06-01T15:00:00Z",
    }
    r = client.post("/calendar/google/events", json=payload, headers=admin_token_headers)
    assert r.status_code == 201
    assert r.json().get("id") == "evt_test_1"


@patch("app.routers.calendar.create_event", return_value=None)
def test_calendar_google_create_fails_without_credentials(_mock_create, client, admin_token_headers):
    payload = {
        "summary": "X",
        "start_dt_utc": "2026-06-01T14:00:00Z",
        "end_dt_utc": "2026-06-01T15:00:00Z",
    }
    r = client.post("/calendar/google/events", json=payload, headers=admin_token_headers)
    assert r.status_code == 400


@patch("app.routers.calendar.update_event", return_value={"id": "evt_patched"})
def test_calendar_google_update_event(_mock_update, client, admin_token_headers):
    r = client.patch(
        "/calendar/google/events/abc123",
        json={"summary": "Atualizado"},
        headers=admin_token_headers,
    )
    assert r.status_code == 200
    assert r.json().get("id") == "evt_patched"


@patch("app.routers.calendar.update_event", return_value=None)
def test_calendar_google_update_fails(_mock_update, client, admin_token_headers):
    r = client.patch(
        "/calendar/google/events/missing",
        json={"summary": "X"},
        headers=admin_token_headers,
    )
    assert r.status_code == 400


@patch("app.routers.calendar.delete_event", return_value=True)
def test_calendar_google_delete_event(_mock_delete, client, admin_token_headers):
    r = client.delete("/calendar/google/events/abc123", headers=admin_token_headers)
    assert r.status_code == 204


@patch("app.routers.calendar.delete_event", return_value=False)
def test_calendar_google_delete_fails(_mock_delete, client, admin_token_headers):
    r = client.delete("/calendar/google/events/bad", headers=admin_token_headers)
    assert r.status_code == 400
