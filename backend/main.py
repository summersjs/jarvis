from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.logic.five_three_one_logic import PowerliftingEngine
from backend.logic.fbi_logic import FBIPFTScorer
from backend.db.supabase_client import supabase
from pydantic import BaseModel
from datetime import datetime, timezone
from backend.integrations.google_calendar import get_next_event_by_tag, get_next_event, get_calendar_service
from zoneinfo import ZoneInfo

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://jarvis.schoolyardshowdown.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOCAL_TZ = ZoneInfo("America/New_York")


def parse_google_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    # Handle trailing Z
    value = value.replace("Z", "+00:00")
    return datetime.fromisoformat(value)


def format_time_local(dt_str: str | None) -> str:
    dt = parse_google_datetime(dt_str)
    if not dt:
        return "unknown time"

    local_dt = dt.astimezone(LOCAL_TZ)
    return local_dt.strftime("%-I:%M %p")


def format_date_local(dt_str: str | None) -> str:
    dt = parse_google_datetime(dt_str)
    if not dt:
        return "unknown date"

    local_dt = dt.astimezone(LOCAL_TZ)
    return local_dt.strftime("%A, %B %-d")


def format_event_time_range(event: dict) -> str:
    start_info = event.get("start", {})
    end_info = event.get("end", {})

    start_dt = start_info.get("dateTime")
    end_dt = end_info.get("dateTime")

    # All-day event fallback
    if not start_dt:
        start_date = start_info.get("date")
        if start_date:
            return f"all day on {start_date}"
        return "at an unknown time"

    start_text = format_time_local(start_dt)

    if end_dt:
        end_text = format_time_local(end_dt)
        return f"{start_text} to {end_text}"

    return start_text


def format_event_location(event: dict) -> str:
    location = (event.get("location") or "").strip()
    if not location:
        return ""
    return f" at {location}"


def summarize_event_for_speech(event: dict, include_date: bool = False) -> str:
    summary = event.get("summary", "Unnamed event")
    time_range = format_event_time_range(event)
    location_text = format_event_location(event)

    if include_date:
        start_dt = event.get("start", {}).get("dateTime")
        date_text = format_date_local(start_dt)
        return f"{summary} on {date_text} from {time_range}{location_text}"

    return f"{summary} from {time_range}{location_text}"


def format_lift_name(lift: str) -> str:
    if lift == "overhead_press":
        return "overhead press"
    if lift == "deadlift":
        return "deadlift"
    if lift == "bench" or lift == "bench_press":
        return "bench"
    if lift == "squat":
        return "squat"
    return lift.replace("_", " ")

def get_latest_top_set(user_id: str, lift: str) -> dict | None:
    response = (
        supabase
        .table("workouts")
        .select("*")
        .eq("user_id", user_id)
        .eq("lift", lift)
        .order("created_at", desc=True)
        .execute()
    )

    rows = response.data or []

    for row in rows:
        notes = (row.get("notes") or "").lower()
        if "set 3" in notes or "top set" in notes or "pr" in notes or "voice log" in notes:
            return row

    return rows[0] if rows else None

def get_next_lift_profile(user_id: str) -> dict | None:
    response = (
        supabase
        .table("lift_profiles")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=False)
        .execute()
    )

    profiles = response.data or []
    if not profiles:
        return None
    
    ## Very simple V1 rule:
    ## Prefer the lift with the lowest weak number still pending
    ## and if tied return the first one
    profiles_sorted = sorted(
        profiles,
        key=lambda p: (int(p.get("week", 1)), str(p.get("lift", "")))
    )

    return profiles_sorted[0]

def build_business_status() -> str:
    #Placeholder for now until we wire Aegis and Fiverr data
    return "No active Aegis Intake Systems alerts. No Fiverr spike alerts yet."

def round_to_nearest_5(weight: float) -> int:
    return int(round(weight / 5.0) * 5)


def build_plate_breakdown(total_weight: float) -> dict:
    rounded_weight = round_to_nearest_5(total_weight)
    bar_weight = 45

    if rounded_weight < bar_weight:
        return {
            "total_weight": rounded_weight,
            "bar_weight": bar_weight,
            "per_side": {},
            "note": "Weight is below bar weight."
        }

    remaining = rounded_weight - bar_weight
    per_side_weight = remaining / 2
    plate_sizes = [45, 35, 25, 10, 5, 2.5]
    per_side = {}

    for plate in plate_sizes:
        count = int(per_side_weight // plate)
        if count > 0:
            per_side[str(plate)] = count
            per_side_weight -= count * plate

    return {
        "total_weight": rounded_weight,
        "bar_weight": bar_weight,
        "per_side": per_side
    }


def build_warmup_sets(training_max: float) -> list[dict]:
    warmup_percentages = [
        ("Warm-up 1", 0.40, 5),
        ("Warm-up 2", 0.50, 5),
        ("Warm-up 3", 0.60, 3),
    ]

    warmups = []
    for label, pct, reps in warmup_percentages:
        weight = round_to_nearest_5(training_max * pct)
        warmups.append({
            "label": label,
            "percent": int(pct * 100),
            "reps": reps,
            "weight": weight,
            "plates": build_plate_breakdown(weight)
        })

    return warmups


def format_work_set(weight: float, reps_label: str) -> dict:
    rounded_weight = round_to_nearest_5(weight)
    return {
        "reps": reps_label,
        "weight": rounded_weight,
        "plates": build_plate_breakdown(rounded_weight)
    }


def build_work_sets(training_max: float, week: int) -> dict:
    if week == 1:
        return {
            "Set 1": format_work_set(training_max * 0.65, "5"),
            "Set 2": format_work_set(training_max * 0.75, "5"),
            "Set 3": format_work_set(training_max * 0.85, "5+"),
        }
    if week == 2:
        return {
            "Set 1": format_work_set(training_max * 0.70, "3"),
            "Set 2": format_work_set(training_max * 0.80, "3"),
            "Set 3": format_work_set(training_max * 0.90, "3+"),
        }
    if week == 3:
        return {
            "Set 1": format_work_set(training_max * 0.75, "5"),
            "Set 2": format_work_set(training_max * 0.85, "3"),
            "Set 3": format_work_set(training_max * 0.95, "1+"),
        }
    if week == 4:
        return {
            "Set 1": format_work_set(training_max * 0.40, "5"),
            "Set 2": format_work_set(training_max * 0.50, "5"),
            "Set 3": format_work_set(training_max * 0.60, "5"),
        }

    raise ValueError("Week must be 1, 2, 3, or 4.")


def estimate_one_rep_max(weight: float, reps: int) -> float:
    return weight * (1 + reps / 30)

def get_shift_brief() -> str:
    # Placeholder until we connect actual shift data
    now = datetime.now()
    weekday = now.weekday()

    if weekday in [0,1]:
        return "You have a 12 hour night shift starting at 6 PM."
    if weekday in [5,6]:
        return "You have a 12 hour day shift starting at 6 AM."
    return "You have no shifts scheduled for today."

def get_pr_prediction(lift: str, set_3_weight: float, target_reps: str, training_max: float) -> str:
    if target_reps == "1+":
        predicted_pr = estimate_one_rep_max(set_3_weight, 3)
        return f"3 reps on Set 3 projects about a {round(predicted_pr)} lb estimated 1RM."
    if target_reps == "3+":
        predicted_pr = estimate_one_rep_max(set_3_weight, 5)
        return f"5 reps on Set 3 projects about a {round(predicted_pr)} lb estimated 1RM."
    if target_reps == "5+":
        predicted_pr = estimate_one_rep_max(set_3_weight, 8)
        return f"8 reps on Set 3 projects about a {round(predicted_pr)} lb estimated 1RM."
    return f"Push the final set hard. TM is {round(training_max)}."


class WorkoutSetLog(BaseModel):
    set_name: str
    weight: float
    reps: int


class CompleteWorkoutLog(BaseModel):
    user_id: str
    lift: str
    cycle: int
    week: int
    sets: list[WorkoutSetLog]


@app.get("/status")
def get_status():
    return {
        "systems": "Online",
        "brain": "Gemini 1.5 Flash",
        "user": "John Summers Sr",
        "clearance": "Active"
    }


@app.get("/calculate/531/{weight}")
def get_531_workout(weight: int):
    engine = PowerliftingEngine(weight)
    tm = float(engine.training_max)

    return {
        "training_max": round_to_nearest_5(tm),
        "warmups": build_warmup_sets(tm),
        "week_1": build_work_sets(tm, 1),
        "week_2": build_work_sets(tm, 2),
        "week_3": build_work_sets(tm, 3),
        "week_4": build_work_sets(tm, 4),
    }


@app.get("/score/fbi/pullups/{reps}")
def score_pullups(reps: int):
    score = FBIPFTScorer.get_pullup_points(reps)
    return {"reps": reps, "points": score}


@app.get("/fbi-score")
def fbi_score(pullups: int, run_seconds: int, sprint_seconds: float, pushups: int):
    return {
        "pullups": FBIPFTScorer.get_pullup_points(pullups),
        "run": FBIPFTScorer.get_run_points(run_seconds),
        "sprint": FBIPFTScorer.get_sprint_points(sprint_seconds),
        "pushups": FBIPFTScorer.get_push_up_points(pushups)
    }


@app.get("/lifts")
def get_lifts():
    response = supabase.table("lift_profiles").select("*").execute()
    return response.data


@app.get("/workout/today/{lift}")
def get_today_workout(lift: str, user_id: str):
    profile_response = (
        supabase
        .table("lift_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("lift", lift)
        .limit(1)
        .execute()
    )

    if not profile_response.data:
        raise HTTPException(status_code=404, detail="No lift profile found")

    profile = profile_response.data[0]
    training_max = float(profile["training_max"])
    cycle = int(profile.get("cycle", 1))
    week = int(profile.get("week", 1)) if profile.get("week") else 1

    today_sets = build_work_sets(training_max, week)
    set_3 = today_sets["Set 3"]

    return {
        "lift": lift,
        "user_id": user_id,
        "cycle": cycle,
        "week": week,
        "training_max": round_to_nearest_5(training_max),
        "warmups": build_warmup_sets(training_max),
        "today": today_sets,
        "pr_prediction": get_pr_prediction(
            lift=lift,
            set_3_weight=set_3["weight"],
            target_reps=set_3["reps"],
            training_max=training_max
        ),
        "all_weeks": {
            "week_1": build_work_sets(training_max, 1),
            "week_2": build_work_sets(training_max, 2),
            "week_3": build_work_sets(training_max, 3),
            "week_4": build_work_sets(training_max, 4),
        }
    }


@app.post("/log/workout/complete")
def log_complete_workout(workout: CompleteWorkoutLog):
    rows = []
    for item in workout.sets:
        rows.append({
            "user_id": workout.user_id,
            "lift": workout.lift,
            "weight": round_to_nearest_5(item.weight),
            "reps": item.reps,
            "notes": f"{item.set_name} - cycle {workout.cycle}, week {workout.week}"
        })

    insert_response = supabase.table("workouts").insert(rows).execute()

    next_week = workout.week + 1
    next_cycle = workout.cycle
    new_training_max = None

    if workout.week == 4:
        next_week = 1
        next_cycle = workout.cycle + 1

        profile_response = (
            supabase
            .table("lift_profiles")
            .select("*")
            .eq("user_id", workout.user_id)
            .eq("lift", workout.lift)
            .limit(1)
            .execute()
        )

        if profile_response.data:
            current_tm = float(profile_response.data[0]["training_max"])
            increment = 5 if workout.lift in ["bench", "overhead_press"] else 10
            new_training_max = current_tm + increment

            supabase.table("lift_profiles").update({
                "week": next_week,
                "cycle": next_cycle,
                "training_max": new_training_max
            }).eq("user_id", workout.user_id).eq("lift", workout.lift).execute()
    else:
        supabase.table("lift_profiles").update({
            "week": next_week,
            "cycle": next_cycle
        }).eq("user_id", workout.user_id).eq("lift", workout.lift).execute()

    return {
        "message": "Workout logged successfully",
        "logged_sets": insert_response.data,
        "next_week": next_week,
        "next_cycle": next_cycle,
        "new_training_max": new_training_max
    }


@app.get("/history/{lift}")
def get_history(lift: str, user_id: str):
    response = (
        supabase
        .table("workouts")
        .select("*")
        .eq("user_id", user_id)
        .eq("lift", lift)
        .order("created_at", desc=True)
        .execute()
    )

    filtered = []
    for row in response.data:
        notes = (row.get("notes") or "").lower()

        if "set 3" in notes or "top set" in notes or "pr" in notes:
            filtered.append(row)

    return filtered

import re
from fastapi import HTTPException
from pydantic import BaseModel


class VoiceLogRequest(BaseModel):
    input: str
    user_id: str = "john"


def normalize_number_words(text: str) -> str:
    number_map = {
        "zero": "0",
        "one": "1",
        "two": "2",
        "three": "3",
        "four": "4",
        "five": "5",
        "six": "6",
        "seven": "7",
        "eight": "8",
        "nine": "9",
        "ten": "10",
        "eleven": "11",
        "twelve": "12",
        "thirteen": "13",
        "fourteen": "14",
        "fifteen": "15",
        "sixteen": "16",
        "seventeen": "17",
        "eighteen": "18",
        "nineteen": "19",
        "twenty": "20",
    }

    words = text.lower().split()
    normalized = [number_map.get(word, word) for word in words]
    return " ".join(normalized)

def normalize_lift(text: str) -> str | None:
    text = text.lower()

    if "bench press" in text or text.startswith("bench"):
        return "bench"
    if "overhead press" in text or "ohp" in text:
        return "overhead_press"
    if "deadlift" in text or "dead lift" in text:
        return "deadlift"
    if "squat" in text:
        return "squat"

    return None


@app.post("/voice/log")
def voice_log(payload: VoiceLogRequest):
    try:
        original_text = payload.input.strip().lower()
        text = normalize_number_words(original_text)

        lift = normalize_lift(text)
        if not lift:
            return {
                "status": "error",
                "spoken_response": "I could not determine the lift."
            }

        match = re.search(r"(\d+(?:\.\d+)?)\s+reps\s+(\d+)", text)
        if not match:
            return {
                "status": "error",
                "spoken_response": "I could not parse that. Try saying bench 225 reps 5."
            }

        weight = int(float(match.group(1)))
        reps = int(match.group(2))

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
    
@app.get("/briefing/morning")
def morning_brief(user_id: str = "john"):
    next_lift = get_next_lift_profile(user_id)

    if not next_lift:
        return {
            "status": "error",
            "spoken_response": "Good morning, Daddy. I cound not find your workout data."
        }
    
    lift = next_lift["lift"]
    cycle = int(next_lift.get("cycle", 1))
    week = int(next_lift.get("week", 1))
    training_max = round_to_nearest_5(float(next_lift.get("training_max", 0)))

    latest_top_set = get_latest_top_set(user_id, lift)

    if latest_top_set:
        latest_weight = latest_top_set.get("weight")
        latest_reps = latest_top_set.get("reps")
        latest_line = (
            f"Latest top {format_lift_name(lift)} set was "
            f"{latest_weight} for {latest_reps}."
        )
    else:
        latest_line = f"No recent {format_lift_name(lift)} history found."

    #Placeholder shift logic for now
    shift_line = get_shift_brief()

    business_line = build_business_status()

    now = datetime.now().hour

    if now < 12:
        greeting = "Good morning"
    elif now < 18:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"

    spoken_response = (
        f"{greeting}, Sexy Daddy. All systems Operational. "
        f"{shift_line} "
        f"Today is {format_lift_name(lift)}, cycle {cycle} week {week}. "
        f"Training max {training_max} pounds. "
        f"{latest_line} "
        f"{business_line}"
    )

    return {
        "status": "ok",
        "user_id": user_id,
        "next_lift": lift,
        "cycle": cycle,
        "week": week,
        "training_max": training_max,
        "latest_top_set": latest_top_set,
        "business_status": business_line,
        "spoken_response": spoken_response
    }

@app.get("/calendar/next")
def get_next_calendar_event():
    try:
        event = get_next_event()

        if not event:
            return {
                "status": "ok",
                "spoken_response": "You have no upcoming calendar events."
            }

        spoken = summarize_event_for_speech(event, include_date=True)

        return {
            "status": "ok",
            "spoken_response": f"Your next event is {spoken}."
        }
    except Exception as e:
        return {
            "status": "error",
            "spoken_response": "Sorry Daddy! I had trouble fetching your calendar events.",
            "error": str(e)
        }
    
@app.get("/calendar/next/work")
def next_work():
    event = get_next_event_by_tag("scheduled to work")

    if not event:
        return {
            "status": "ok",
            "spoken_response": "You have no upcoming work events on your calendar."
        }

    spoken = summarize_event_for_speech(event, include_date=True)

    return {
        "status": "ok",
        "spoken_response": f"Your next work event is {spoken}."
    }

@app.get("/calendar/today")
def today_events():
    service = get_calendar_service()

    now = datetime.now(LOCAL_TZ)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=0).astimezone(timezone.utc).isoformat()

    event_result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=start_of_day,
            timeMax=end_of_day,
            singleEvents=True,
            orderBy="startTime"
        )
        .execute()
    )

    events = event_result.get("items", [])

    if not events:
        return {
            "status": "ok",
            "spoken_response": "You have no events scheduled for today."
        }

    summary_lines = [summarize_event_for_speech(event, include_date=False) for event in events]
    joined = ". ".join(summary_lines)

    return {
        "status": "ok",
        "spoken_response": f"You have {len(events)} events today. {joined}."
    }