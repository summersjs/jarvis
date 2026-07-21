from __future__ import annotations

import base64
import re
from email.message import EmailMessage

from googleapiclient.discovery import build

from backend.integrations.google_calendar import GMAIL_SCOPES, get_google_credentials

GMAIL_API_ENABLE_URL = "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=836526312487"


def gmail_error_guidance(error: Exception) -> str | None:
    message = str(error).lower()
    if "gmail api has not been used" in message or ("gmail api" in message and "disabled" in message):
        return f"The Gmail API is disabled in Google Cloud project 836526312487. Enable it here, wait a minute, then retry: {GMAIL_API_ENABLE_URL}"
    if "insufficient" in message or "permission" in message or "scope" in message:
        return "Gmail needs the new read and draft permissions. Reconnect Google from the Jarvis dashboard, then try again."
    return None


def get_gmail_service():
    return build("gmail", "v1", credentials=get_google_credentials(GMAIL_SCOPES), cache_discovery=False)


def search_gmail(query: str, max_results: int = 8) -> list[dict]:
    service = get_gmail_service()
    rows = service.users().messages().list(userId="me", q=query[:500], maxResults=max(1, min(max_results, 20))).execute().get("messages", [])
    return [_message_summary(service.users().messages().get(userId="me", id=row["id"], format="metadata", metadataHeaders=["From", "To", "Subject", "Date"]).execute()) for row in rows]


def read_gmail_message(message_id: str) -> dict:
    message = get_gmail_service().users().messages().get(userId="me", id=message_id, format="full").execute()
    result = _message_summary(message)
    result["body"] = _extract_body(message.get("payload") or {})[:12000]
    return result


def create_gmail_draft(to: str, subject: str, body: str) -> dict:
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    service = get_gmail_service()
    created = service.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    verified = service.users().drafts().get(userId="me", id=created["id"], format="metadata").execute()
    return {"id": verified.get("id"), "message_id": (verified.get("message") or {}).get("id"), "to": to, "subject": subject, "verified": verified.get("id") == created.get("id")}


def _message_summary(message: dict) -> dict:
    headers = {str(item.get("name") or "").lower(): str(item.get("value") or "") for item in (message.get("payload") or {}).get("headers", [])}
    return {"id": message.get("id"), "thread_id": message.get("threadId"), "from": headers.get("from"), "to": headers.get("to"), "subject": headers.get("subject") or "(no subject)", "date": headers.get("date"), "snippet": message.get("snippet") or ""}


def _extract_body(payload: dict) -> str:
    mime = payload.get("mimeType")
    data = (payload.get("body") or {}).get("data")
    if data and mime in {"text/plain", "text/html"}:
        decoded = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")
        return re.sub(r"<[^>]+>", " ", decoded) if mime == "text/html" else decoded
    texts = [_extract_body(part) for part in payload.get("parts") or []]
    return "\n".join(text for text in texts if text).strip()
