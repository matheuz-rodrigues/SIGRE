from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.services.rbac import require_role
from app.services.google_calendar import list_events, create_event, update_event, delete_event
from pydantic import BaseModel

router = APIRouter(prefix="/calendar", tags=["calendar"])
PLATFORM_EVENT_SOURCE = "alocacoes"


def _is_platform_event(event: dict) -> bool:
	priv = (event.get("extendedProperties") or {}).get("private") or {}
	if priv.get("platform_source") == PLATFORM_EVENT_SOURCE:
		return True
	return bool(priv.get("fk_sala") and priv.get("fk_usuario"))


@router.get("/events")
def get_calendar_events(
	db: Session = Depends(get_db),
	_u=Depends(require_role(1)),
	view: str = Query("month", pattern="^(day|week|month|semester)$"),
	anchor: Optional[datetime] = Query(None),
	room_id: Optional[int] = Query(None),
	user_id: Optional[int] = Query(None),
):
	center = anchor or datetime.utcnow()
	if view == "day":
		start = center.replace(hour=0, minute=0, second=0, microsecond=0)
		end = start + timedelta(days=1)
	elif view == "week":
		start = center - timedelta(days=center.weekday())
		start = start.replace(hour=0, minute=0, second=0, microsecond=0)
		end = start + timedelta(days=7)
	elif view == "semester":
		start = center - timedelta(days=90)
		end = center + timedelta(days=90)
	else:
		start = center.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
		next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
		end = next_month
	# 1. Busca eventos do Google
	google_items = list_events(db=db, user_id=_u.id, time_min_utc=start, time_max_utc=end)
	
	# 2. Busca alocações locais
	from app.services.reservation_service import allocation_service
	local_res = allocation_service.list_reservations(
		db=db,
		current_user=_u,
		room_id=room_id,
		user_id=user_id,
		date_from=start,
		date_to=end
	)
	local_items = local_res.get("items", [])

	result = []
	# Inclui locais (formatados como o front espera)
	for aloc in local_items:
		result.append({
			"id": f"local_{aloc['id']}",
			"summary": aloc.get("uso") or "Reserva",
			"start": {"dateTime": aloc.get("dia_horario_inicio")},
			"end": {"dateTime": aloc.get("dia_horario_saida")},
			"extendedProperties": {
				"private": {
					"fk_sala": str(aloc.get("salaId")),
					"fk_usuario": str(aloc.get("fk_usuario")),
					"local_reservation_id": str(aloc["id"]),
					"platform_source": PLATFORM_EVENT_SOURCE
				}
			}
		})

	# Inclui Google (se não for duplicado)
	if google_items:
		local_ids = {str(aloc["id"]) for aloc in local_items}
		for ev in google_items:
			if not _is_platform_event(ev):
				continue
			priv = (ev.get("extendedProperties") or {}).get("private") or {}
			
			# Se já temos o id local na lista de alocações, ignoramos o do Google para não duplicar na visualização
			loc_id = priv.get("local_reservation_id")
			if loc_id in local_ids:
				continue

			if room_id is not None and str(priv.get("fk_sala")) != str(room_id):
				continue
			if user_id is not None and str(priv.get("fk_usuario")) != str(user_id):
				continue
			result.append(ev)

	return {"items": result}


class GoogleEventCreate(BaseModel):
	summary: str
	description: Optional[str] = None
	start_dt_utc: datetime
	end_dt_utc: datetime
	location: Optional[str] = None
	calendar_id: Optional[str] = None


class GoogleEventUpdate(BaseModel):
	summary: Optional[str] = None
	description: Optional[str] = None
	start_dt_utc: Optional[datetime] = None
	end_dt_utc: Optional[datetime] = None
	location: Optional[str] = None
	calendar_id: Optional[str] = None


@router.get("/google/events")
def google_list_events(
	db: Session = Depends(get_db),
	_u=Depends(require_role(1)),
	start: datetime = Query(...),
	end: datetime = Query(...),
	calendar_id: Optional[str] = Query(None),
):
	items = list_events(db=db, user_id=_u.id, time_min_utc=start, time_max_utc=end, calendar_id=calendar_id)
	if items is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google credentials not connected")
	return {"items": [item for item in items if _is_platform_event(item)]}


@router.post("/google/events", status_code=status.HTTP_201_CREATED)
def google_create_event(payload: GoogleEventCreate, db: Session = Depends(get_db), _u=Depends(require_role(1))):
	evt = create_event(
		db=db,
		user_id=_u.id,
		summary=payload.summary,
		description=payload.description,
		start_dt_utc=payload.start_dt_utc,
		end_dt_utc=payload.end_dt_utc,
		location=payload.location,
		calendar_id=payload.calendar_id,
	)
	if evt is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google credentials not connected")
	return evt


@router.patch("/google/events/{event_id}")
def google_update_event(event_id: str, payload: GoogleEventUpdate, db: Session = Depends(get_db), _u=Depends(require_role(1))):
	patch = {}
	if payload.summary is not None:
		patch["summary"] = payload.summary
	if payload.description is not None:
		patch["description"] = payload.description
	if payload.start_dt_utc is not None or payload.end_dt_utc is not None:
		if payload.start_dt_utc is not None:
			patch.setdefault("start", {})["dateTime"] = payload.start_dt_utc.isoformat()
			patch["start"]["timeZone"] = "UTC"
		if payload.end_dt_utc is not None:
			patch.setdefault("end", {})["dateTime"] = payload.end_dt_utc.isoformat()
			patch["end"]["timeZone"] = "UTC"
	evt = update_event(db=db, user_id=_u.id, event_id=event_id, patch=patch, calendar_id=payload.calendar_id)
	if evt is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google credentials not connected or update failed")
	return evt


@router.delete("/google/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def google_delete_event(event_id: str, db: Session = Depends(get_db), _u=Depends(require_role(1)), calendar_id: Optional[str] = Query(None)):
	ok = delete_event(db=db, user_id=_u.id, event_id=event_id, calendar_id=calendar_id)
	if not ok:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google credentials not connected or delete failed")
	return

