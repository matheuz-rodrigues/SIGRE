import logging
import secrets
from typing import Optional, Any

import httpx
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.config import get_settings
from app.models.user import Usuario
from app.schemas.user import UserCreate
from app.services.auth import mfa, rate_limit
from app.services.auth.security import (
    verify_password, verify_password_dummy, hash_password,
    create_access_token, create_refresh_token, create_mfa_token,
)

settings = get_settings()
logger = logging.getLogger(__name__)

# Mapeamento de Papéis
ROLE_MAP = {
    "aluno": 1,
    "professor": 2,
    "admin": 3,
    "tecnico_adm": 4,
}

REVERSE_ROLE_MAP = {v: k for k, v in ROLE_MAP.items()}

# Papéis que podem ser escolhidos no cadastro público (admin só é criado por outro admin)
PUBLIC_ROLES = {"aluno", "professor", "tecnico_adm"}


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


class AuthService:
    def authenticate(self, db: Session, username: str, senha: str, ip: Optional[str]) -> Usuario:
        """Valida usuário e senha com limitação progressiva de tentativas."""
        identifier = rate_limit.normalize_identifier(username)
        rate_limit.ensure_not_locked(db, rate_limit.EVENT_LOGIN, identifier, ip)

        # Busca por username ou email
        user = db.query(Usuario).filter(
            (Usuario.username == username) | (Usuario.email == username)
        ).filter(Usuario.deleted_at.is_(None)).first()

        if not user:
            verify_password_dummy(senha)
        if not user or not verify_password(senha, user.senha):
            rate_limit.record_event(db, rate_limit.EVENT_LOGIN, identifier, ip, success=False, user_id=user.id if user else None)
            raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

        if user.tipo_usuario != 3:
            if user.status == "pendente":
                raise HTTPException(status_code=401, detail="Sua conta aguarda aprovação do administrador")
            elif user.status == "recusado":
                raise HTTPException(status_code=401, detail="Sua conta foi recusada pelo administrador")
            elif user.status != "aprovado":
                raise HTTPException(status_code=401, detail="Sua conta ainda não está habilitada")

        rate_limit.record_event(db, rate_limit.EVENT_LOGIN, identifier, ip, success=True, user_id=user.id)
        return user

    def login(self, db: Session, login_data: Any, ip: Optional[str] = None) -> dict:
        """Primeira etapa do login. Perfis com MFA recebem um desafio em vez da sessão."""
        user = self.authenticate(db, login_data.username, login_data.senha, ip)

        if mfa.mfa_required_for(user):
            challenge = "mfa_required" if mfa.is_enabled(db, user.id) else "mfa_setup_required"
            return {challenge: True, "mfa_token": create_mfa_token(user.id)}

        return self.issue_session(db, user)

    def issue_session(self, db: Session, user: Usuario) -> dict:
        papel = REVERSE_ROLE_MAP.get(user.tipo_usuario, "aluno")
        access_token = create_access_token(subject=user.email, user_id=user.id, role=user.tipo_usuario)
        refresh_token = create_refresh_token(db, user.id)

        return {
            "id": user.id,
            "nome": user.nome,
            "email": user.email,
            "username": user.username,
            "papel": papel,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "csrf_token": new_csrf_token(),
            "token_type": "bearer"
        }

    def verify_turnstile(self, token: Optional[str], ip: Optional[str]) -> None:
        if not settings.TURNSTILE_SECRET_KEY:
            # Sem chave só fora de produção (a validação de startup impede o contrário)
            return
        if not token:
            raise HTTPException(status_code=400, detail="Confirme que você não é um robô")
        try:
            resp = httpx.post(
                settings.TURNSTILE_VERIFY_URL,
                data={"secret": settings.TURNSTILE_SECRET_KEY, "response": token, "remoteip": ip or ""},
                timeout=5,
            )
            ok = resp.status_code == 200 and resp.json().get("success") is True
        except (httpx.HTTPError, ValueError):
            logger.exception("Falha ao consultar o Turnstile")
            ok = False
        if not ok:
            raise HTTPException(status_code=400, detail="Falha na verificação anti-robô. Tente novamente.")

    def _resolve_public_role(self, data: UserCreate) -> int:
        if data.papel:
            if data.papel not in PUBLIC_ROLES:
                raise HTTPException(status_code=422, detail="Papel não permitido no cadastro")
            return ROLE_MAP[data.papel]
        if data.tipo_usuario not in {ROLE_MAP[p] for p in PUBLIC_ROLES}:
            raise HTTPException(status_code=422, detail="Papel não permitido no cadastro")
        return data.tipo_usuario

    def _check_email_domain(self, email: str, tipo: int) -> None:
        domain = email.rsplit("@", 1)[-1].lower()
        allowed = {d.lower().lstrip("@") for d in settings.ALLOWED_EMAIL_DOMAINS}
        if domain not in allowed:
            raise HTTPException(status_code=422, detail="Use seu e-mail institucional da UEPA")
        if tipo == ROLE_MAP["aluno"] and domain != settings.STUDENT_EMAIL_DOMAIN.lower():
            raise HTTPException(status_code=422, detail=f"Alunos devem usar o e-mail @{settings.STUDENT_EMAIL_DOMAIN}")

    def register(self, db: Session, data: UserCreate, ip: Optional[str] = None, turnstile_token: Optional[str] = None) -> Usuario:
        if not settings.PUBLIC_REGISTRATION_ENABLED:
            raise HTTPException(status_code=403, detail="Cadastro público desabilitado")

        rate_limit.ensure_registration_allowed(db, ip)
        identifier = rate_limit.normalize_identifier(data.email)
        try:
            self.verify_turnstile(turnstile_token, ip)
            tipo = self._resolve_public_role(data)
            self._check_email_domain(data.email, tipo)

            # Verificações de duplicidade
            if db.query(Usuario).filter(Usuario.email == data.email).first():
                raise HTTPException(status_code=409, detail="E-mail já cadastrado")
            if db.query(Usuario).filter(Usuario.username == data.username).first():
                raise HTTPException(status_code=409, detail="Nome de usuário já em uso")
        except HTTPException:
            rate_limit.record_event(db, rate_limit.EVENT_REGISTER, identifier, ip, success=False)
            raise

        # Todo cadastro público fica pendente até um admin aprovar
        user_obj = Usuario(
            nome=data.nome,
            email=data.email,
            username=data.username,
            telefone=data.telefone,
            senha=hash_password(data.senha),
            tipo_usuario=tipo,
            fk_curso=data.cursoId,
            departamento=data.departamento,
            status="pendente"
        )

        db.add(user_obj)
        db.commit()
        db.refresh(user_obj)
        rate_limit.record_event(db, rate_limit.EVENT_REGISTER, identifier, ip, success=True, user_id=user_obj.id)
        return user_obj

auth_service = AuthService()
