"""
Envia um e-mail de teste com a configuração SMTP do ambiente (SMTP_HOST, SMTP_PORT, ...).

Serve para validar o servidor de e-mail (Amazon SES, DSPD) antes de depender dele no login com MFA.

Uso:
    python scripts/test_smtp.py destino@uepa.br
    docker exec -it sigra_backend python3 scripts/test_smtp.py destino@uepa.br
"""

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.services.infra.email import EmailDeliveryError, send_email


def main() -> int:
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        print("Uso: python scripts/test_smtp.py destino@exemplo.com")
        return 2
    settings = get_settings()
    if not settings.SMTP_HOST:
        print("Erro: SMTP_HOST não definido.")
        return 1

    modo = "SSL" if settings.SMTP_SSL else ("STARTTLS" if settings.SMTP_STARTTLS else "sem TLS")
    print(f"Servidor: {settings.SMTP_HOST}:{settings.SMTP_PORT} ({modo}) | "
          f"usuário: {settings.SMTP_USER or '(sem autenticação)'} | remetente: {settings.SMTP_FROM}")
    try:
        send_email(
            sys.argv[1],
            "Teste de envio do SIGRA",
            "Este é um e-mail de teste do SIGRA.\n\n"
            "Se você o recebeu, o servidor de e-mail está pronto para enviar os códigos de acesso.\n",
        )
    except EmailDeliveryError as exc:
        print(f"Falha no envio: {exc}")
        return 1
    print(f"Enviado para {sys.argv[1]}. Confira a caixa de entrada e o spam.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
