from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from google_auth_oauthlib.flow import Flow

from app.config import Settings, get_settings
from app.try_database import get_db
from app.models import GoogleCredential
from app.services.rbac import get_current_user

router = APIRouter(prefix="/google", tags=["google"])

SCOPES = ["https://www.googleapis.com/auth/calendar"]

@router.get("/connect")
def google_connect(
    request: Request, 
    current=Depends(get_current_user),
    settings: Settings = Depends(get_settings) 
):
    """
    Inicia o fluxo OAuth2 com o Google.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": settings.GOOGLE_TOKEN_URI,
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    auth_url, state = flow.authorization_url(
        prompt="consent", 
        access_type="offline", 
        include_granted_scopes="true"
    )
    
    request.session["oauth_state"] = state
    request.session["oauth_user_id"] = current.id  
    
    print(f"DEBUG: Session set in /connect - state: {state}, user_id: {current.id}")
    
    return {
        "auth_url": auth_url
    }


@router.get("/callback")
def google_callback(
    request: Request, 
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
):
    """
    Recebe o callback do Google, troca o código pelo token e salva no banco.
    """
    state_from_google = request.query_params.get("state")
    
    state_from_session = request.session.get("oauth_state")
    user_id_from_session = request.session.get("oauth_user_id")

    print(f"DEBUG: Session in /callback - state_session: {state_from_session}, state_google: {state_from_google}, user_id: {user_id_from_session}")

    if not state_from_session or not user_id_from_session:
        raise HTTPException(status_code=400, detail="Sessão inválida ou ID de usuário faltando")
        
    if state_from_google != state_from_session:
        raise HTTPException(status_code=400, detail="State do OAuth inválido")

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": settings.GOOGLE_TOKEN_URI,
            }
        },
        scopes=SCOPES,
        state=state_from_session, 
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    authorization_response = str(request.url)
    try:
        flow.fetch_token(authorization_response=authorization_response)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao obter token do Google: {str(e)}")
    
    creds = flow.credentials
    
    row = db.query(GoogleCredential).filter(GoogleCredential.user_id == user_id_from_session).first()
    if not row:
        row = GoogleCredential(user_id=user_id_from_session)
        db.add(row)
        
    row.access_token = creds.token
    if getattr(creds, "refresh_token", None):
        row.refresh_token = creds.refresh_token
        
    row.client_id = settings.GOOGLE_CLIENT_ID
    row.client_secret = settings.GOOGLE_CLIENT_SECRET
    row.scopes = " ".join(SCOPES)
    row.updated_at = datetime.now(tz=timezone.utc)
    
    db.commit()
    
    frontend_url = f"{settings.FRONTEND_URL}?tab=configuracoes"
    return RedirectResponse(url=frontend_url)


@router.get("/status")
def google_status(db: Session = Depends(get_db), current=Depends(get_current_user)):
    """
    Verifica se o usuário atual já conectou o Google Calendar.
    """
    row: Optional[GoogleCredential] = db.query(GoogleCredential).filter(GoogleCredential.user_id == current.id).first()
    return {"connected": bool(row and row.access_token)}


@router.delete("/disconnect")
def google_disconnect(db: Session = Depends(get_db), current=Depends(get_current_user)):
    """
    Remove a conexão com o Google Calendar do usuário.
    """
    db.query(GoogleCredential).filter(GoogleCredential.user_id == current.id).delete()
    db.commit()
    return {"status": "Disconnected successfully"}