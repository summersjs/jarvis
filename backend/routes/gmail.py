from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from backend.core.security import verify_api_key
from backend.integrations.google_gmail import create_gmail_draft, read_gmail_message, search_gmail

router = APIRouter(prefix="/gmail", dependencies=[Depends(verify_api_key)])


class GmailDraftRequest(BaseModel):
    to: str = Field(min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=12000)


@router.get("/search")
def gmail_search(q: str = Query(min_length=1, max_length=500), max_results: int = Query(default=8, ge=1, le=20)):
    return {"messages": search_gmail(q, max_results), "verified": True}


@router.get("/messages/{message_id}")
def gmail_message(message_id: str):
    return {"message": read_gmail_message(message_id), "verified": True}


@router.post("/drafts")
def gmail_draft(payload: GmailDraftRequest):
    draft = create_gmail_draft(str(payload.to), payload.subject, payload.body)
    return {"draft": draft, "verified": bool(draft.get("verified")), "sent": False}
