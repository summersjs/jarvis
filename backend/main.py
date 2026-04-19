import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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




app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://jarvis.schoolyardshowdown.com",
        "https://jarvis-git-master-johnfsummers-9948s-projects.vercel.app",
    ],
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