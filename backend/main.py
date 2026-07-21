import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

from backend.routes.status import router as status_router
from backend.routes.fbi import router as fbi_router
from backend.routes.calendar import router as calendar_router
from backend.routes.workouts import router as workouts_router
from backend.routes.voice import router as voice_router
from backend.routes.briefing import router as briefing_router
from backend.routes.recipies import router as recipies_router
from backend.routes.meal_planner import router as meal_planner_router
from backend.routes.shopping import router as shopping_router
from backend.routes.preferences import router as preferences_router
from backend.routes.dashboard import router as dashboard_router
from backend.routes.goals import router as goals_router
from backend.routes.debrief import router as debrief_router
from backend.routes.finance import router as finance_router
from backend.routes.health import router as health_router
from backend.routes.food_vault import router as food_vault_router
from backend.routes.archive import router as archive_router
from backend.routes.forge import router as forge_router
from backend.routes.assistant import router as assistant_router
from backend.routes.weather import router as weather_router
from backend.routes.gmail import router as gmail_router




app = FastAPI()
FORGE_MEDIA_ROOT = Path(os.getenv("FORGE_MEDIA_ROOT", Path(__file__).resolve().parents[1] / ".local" / "forge-media"))
FORGE_MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/forge-media", StaticFiles(directory=FORGE_MEDIA_ROOT), name="forge-media")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://jarvis.schoolyardshowdown.com",
        "https://jarvis-git-master-johnfsummers-9948s-projects.vercel.app",
    ],
    allow_origin_regex=r"^http://(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):3000$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(status_router)
app.include_router(fbi_router)
app.include_router(calendar_router)
app.include_router(workouts_router)
app.include_router(voice_router)
app.include_router(briefing_router)
app.include_router(recipies_router)
app.include_router(meal_planner_router)
app.include_router(shopping_router)
app.include_router(preferences_router)
app.include_router(dashboard_router)
app.include_router(goals_router)
app.include_router(debrief_router)
app.include_router(finance_router)
app.include_router(health_router)
app.include_router(food_vault_router)
app.include_router(archive_router)
app.include_router(forge_router)
app.include_router(assistant_router)
app.include_router(weather_router)
app.include_router(gmail_router)
