import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from backend.core.security import verify_api_key
from backend.db.supabase_client import supabase
from backend.integrations.google_calendar import CREDS_PATH, TOKEN_PATH, refresh_calendar_auth

router = APIRouter()
STARTED_AT = datetime.now(timezone.utc)


def _run_check(label: str, probe):
    started = time.perf_counter()
    try:
        detail = probe()
        state = "online"
    except Exception as exc:
        detail = str(exc)
        state = "offline"

    return {
        "label": label,
        "state": state,
        "detail": detail,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
    }


def _env_check():
    required = {
        "Supabase URL": os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL"),
        "Supabase key": os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY"),
        "Jarvis API key": os.getenv("JARVIS_API_KEY"),
    }
    missing = [label for label, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing: {', '.join(missing)}")
    return "Required runtime variables loaded"


def _table_check(table_name: str):
    def probe():
        supabase.table(table_name).select("id", count="exact").limit(1).execute()
        return f"{table_name} reachable"

    return probe


def _optional_table_check(table_name: str):
    def probe():
        try:
            supabase.table(table_name).select("id", count="exact").limit(1).execute()
            return f"{table_name} reachable"
        except Exception as exc:
            return f"{table_name} pending migration: {exc}"

    return probe


def _calendar_credentials_check():
    if not CREDS_PATH.exists():
        raise RuntimeError("credentials.json missing")
    if not TOKEN_PATH.exists():
        raise RuntimeError("token.json missing")
    auth = refresh_calendar_auth()
    return f"Google Calendar auth verified · {auth.get('calendar_summary', 'Primary calendar')}"


@router.get("/status", dependencies=[Depends(verify_api_key)])
def get_status():
    uptime_seconds = int((datetime.now(timezone.utc) - STARTED_AT).total_seconds())
    checks = [
        _run_check("Local API", lambda: f"FastAPI online · uptime {uptime_seconds}s"),
        _run_check("Environment", _env_check),
        _run_check("Google Calendar Auth", _calendar_credentials_check),
        _run_check("Supabase Database", _table_check("goals")),
        _run_check("Goals", _table_check("goal_milestones")),
        _run_check("Forge Projects", _table_check("forge_projects")),
        _run_check("Forge Tasks", _optional_table_check("forge_tasks")),
        _run_check("Forge Sessions", _optional_table_check("forge_sessions")),
        _run_check("Meal Planner", _table_check("meal_plan_entries")),
        _run_check("Health Ops", _table_check("health_events")),
        _run_check("Food Vault", _table_check("food_vault_items")),
        _run_check("Shopping Lists", _table_check("shopping_lists")),
    ]
    offline_count = sum(1 for check in checks if check["state"] == "offline")
    overall = "Online" if offline_count == 0 else "Degraded"

    return {
        "systems": overall,
        "brain": "LLM pending · planned 07/20/2026",
        "user": "John Summers Sr",
        "clearance": "Active",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime_seconds,
        "checks": checks,
    }
