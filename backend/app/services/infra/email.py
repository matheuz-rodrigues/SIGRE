"""Envio de e-mail transacional por SMTP."""
import smtplib
import ssl
from email.message import EmailMessage

from app.config import get_settings

settings = get_settings()


class EmailDeliveryError(Exception):
    pass


def send_email(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    context = ssl.create_default_context()
    try:
        if settings.SMTP_SSL:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS, context=context)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS)
        with server:
            if settings.SMTP_STARTTLS and not settings.SMTP_SSL:
                server.starttls(context=context)
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailDeliveryError(str(exc)) from exc
