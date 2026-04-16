from fastapi import APIRouter, Depends
from backend.logic.fbi_logic import FBIPFTScorer
from backend.core.security import verify_api_key

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/score/fbi/pullups/{reps}")
def score_pullups(reps: int):
    score = FBIPFTScorer.get_pullup_points(reps)
    return {"reps": reps, "points": score}


@router.get("/fbi-score")
def fbi_score(pullups: int, run_seconds: int, sprint_seconds: float, pushups: int):
    return {
        "pullups": FBIPFTScorer.get_pullup_points(pullups),
        "run": FBIPFTScorer.get_run_points(run_seconds),
        "sprint": FBIPFTScorer.get_sprint_points(sprint_seconds),
        "pushups": FBIPFTScorer.get_push_up_points(pushups)
    }