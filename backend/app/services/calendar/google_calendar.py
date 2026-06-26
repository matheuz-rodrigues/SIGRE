from typing import Optional, Dict, Any, List, Union
from datetime import datetime

from sqlalchemy.orm import Session
from google.oauth2.credentials import Credentials
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import get_settings
from app.services.infra.datetime_utils import ensure_utc
from app.models import GoogleCredential

settings = get_settings()

def _get_credentials(db: Session, user_id: int) -> Optional[Credentials]:
	creds_row: Optional[GoogleCredential] = db.query(GoogleCredential).filter(GoogleCredential.user_id == user_id).first()
	if not creds_row or not creds_row.access_token:
		return None
	creds = Credentials(
		token=creds_row.access_token,
		refresh_token=creds_row.refresh_token,
		token_uri=settings.GOOGLE_TOKEN_URI,
		client_id=creds_row.client_id or settings.GOOGLE_CLIENT_ID,
		client_secret=creds_row.client_secret or settings.GOOGLE_CLIENT_SECRET,
		scopes=(creds_row.scopes or "").split(),
		expiry=creds_row.expiry,
	)
	if not creds.valid and creds.refresh_token:
		try:
			creds.refresh(GoogleRequest())
			creds_row.access_token = creds.token
			if creds.refresh_token:
				creds_row.refresh_token = creds.refresh_token
			creds_row.expiry = creds.expiry
			db.commit()
		except Exception:
			return None
	return creds


def list_events(
	db: Session,
	user_id: int,
	time_min_utc: datetime,
	time_max_utc: datetime,
	calendar_id: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
	creds = _get_credentials(db, user_id)
	if not creds:
		return None
	service = build("calendar", "v3", credentials=creds, cache_discovery=False)
	time_min_utc = ensure_utc(time_min_utc)
	time_max_utc = ensure_utc(time_max_utc)
	try:
		events_result = (
			service.events()
			.list(
				calendarId=calendar_id or settings.GOOGLE_CALENDAR_ID,
				timeMin=time_min_utc.isoformat(),
				timeMax=time_max_utc.isoformat(),
				singleEvents=True,
				orderBy="startTime",
			)
			.execute()
		)
		return events_result.get("items", [])
	except RefreshError:
		print(f"Token expirado ou revogado para o usuário {user_id}. Reautenticação necessária.")
		return None
	except Exception as e:
		print(f"Erro ao listar eventos no Google: {e}")
		return None


def create_event(
	db: Session,
	user_id: int,
	summary: str,
	description: Optional[str],
	start_dt_utc: datetime,
	end_dt_utc: datetime,
	location: Optional[str] = None,
	calendar_id: Optional[str] = None,
	extended_private: Optional[Dict[str, Any]] = None,
	recurrence_rule: str = None,
	attendees: Optional[List[str]] = None
) -> Optional[Union[Dict[str, Any], List[Dict[str, Any]]]]:
	creds = _get_credentials(db, user_id)
	if not creds:
		return None
	service = build("calendar", "v3", credentials=creds, cache_discovery=False)
	start_dt_utc = ensure_utc(start_dt_utc)
	end_dt_utc = ensure_utc(end_dt_utc)
	event_body = {
		"summary": summary,
		"description": description or "",
		"start": {"dateTime": start_dt_utc.isoformat(), "timeZone": "UTC"},
		"end": {"dateTime": end_dt_utc.isoformat(), "timeZone": "UTC"},
	}
	if location:
		event_body["location"] = location
	if attendees:
		event_body["attendees"] = [{"email": email} for email in attendees]
	if extended_private:
		event_body["extendedProperties"] = {"private": {k: str(v) for k, v in extended_private.items()}}
	
	if recurrence_rule:
		event_body["recurrence"] = [recurrence_rule]

	try:
		created = service.events().insert(calendarId=calendar_id or settings.GOOGLE_CALENDAR_ID, body=event_body).execute()
	except RefreshError:
		print(f"Token expirado ou revogado para o usuário {user_id}. Reautenticação necessária.")
		return None
	except Exception as e:
		print(f"Erro ao criar evento no Google: {e}")
		return None
	
	# If it's a recurrent event, 'created' is the parent event.
	# We might want to expand it to return the instances if needed, but for now returning the created event is fine.
	# If the caller expects a list (as implied by some usage in router), we should handle that.
	return created


def update_event(
	db: Session,
	user_id: int,
	event_id: str,
	patch: Dict[str, Any],
	calendar_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
	creds = _get_credentials(db, user_id)
	if not creds:
		return None
	service = build("calendar", "v3", credentials=creds, cache_discovery=False)
	if "start" in patch and "dateTime" in patch["start"]:
		patch["start"] = {
			**patch["start"],
			"dateTime": ensure_utc(datetime.fromisoformat(patch["start"]["dateTime"])).isoformat(),
			"timeZone": "UTC",
		}
	if "end" in patch and "dateTime" in patch["end"]:
		patch["end"] = {
			**patch["end"],
			"dateTime": ensure_utc(datetime.fromisoformat(patch["end"]["dateTime"])).isoformat(),
			"timeZone": "UTC",
		}
	try:
		updated = service.events().patch(calendarId=calendar_id or settings.GOOGLE_CALENDAR_ID, eventId=event_id, body=patch).execute()
		return updated
	except RefreshError:
		print(f"Token expirado ou revogado para o usuário {user_id}. Reautenticação necessária.")
		return None
	except Exception as e:
		print(f"Erro ao atualizar evento no Google: {e}")
		return None


def delete_event(
	db: Session,
	user_id: int,
	event_id: str,
	calendar_id: Optional[str] = None,
) -> bool:
	creds = _get_credentials(db, user_id)
	if not creds:
		return False
	service = build("calendar", "v3", credentials=creds, cache_discovery=False)
	try:
		service.events().delete(calendarId=calendar_id or settings.GOOGLE_CALENDAR_ID, eventId=event_id).execute()
		return True
	except HttpError as e:
		if e.resp.status == 404:
			print(f"Evento {event_id} já não existia no Google Calendar.")
			return True
		print(f"Erro ao excluir evento no Google: {e}")
		return False
	except Exception as e:
		print(f"Erro inesperado ao excluir no Google: {e}")
		return False

def get_event_by_id(db: Session, user_id: int, event_id: str):
    """
    Busca os detalhes de um evento específico no Google Calendar.
    """
    creds = _get_credentials(db, user_id)
    if not creds:
        return None
        
    try:
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        event = service.events().get(
            calendarId=settings.GOOGLE_CALENDAR_ID, 
            eventId=event_id
        ).execute()
        
        return event
    except HttpError as e:
        if e.resp.status == 404:
            print(f"Evento {event_id} não encontrado no Google.")
        else:
            print(f"Erro de API ao buscar evento no Google: {e}")
        return None
    except Exception as e:
        print(f"Erro inesperado ao buscar evento no Google: {e}")
        return None
