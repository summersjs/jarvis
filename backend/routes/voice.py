from fastapi import APIRouter

from backend.db.supabase_client import supabase
from backend.schemas.voice import VoiceLogRequest
from backend.services.voice_service import parse_voice_log_input

router = APIRouter()


@router.post("/voice/log")
def voice_log(payload: VoiceLogRequest):
    try:
        original_text = payload.input.strip().lower()
        lift, weight, reps, text = parse_voice_log_input(original_text)

        if not lift:
            return {
                "status": "error",
                "spoken_response": "I could not determine the lift."
            }

        if weight is None or reps is None:
            return {
                "status": "error",
                "spoken_response": "I could not parse that. Try saying bench 225 reps 5."
            }

        insert_response = supabase.table("workouts").insert({
            "user_id": payload.user_id,
            "lift": lift,
            "weight": weight,
            "reps": reps,
            "notes": f"voice log: {original_text}"
        }).execute()

        return {
            "status": "logged",
            "lift": lift,
            "weight": weight,
            "reps": reps,
            "spoken_response": f"Entry recorded. {lift.replace('_', ' ')} at {weight} pounds for {reps} reps.",
            "data": insert_response.data
        }

    except Exception as e:
        return {
            "status": "error",
            "spoken_response": "Something went wrong while logging that set.",
            "error": str(e)
        }