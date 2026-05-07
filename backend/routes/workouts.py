from fastapi import APIRouter, HTTPException, Depends

from datetime import datetime
from backend.core.config import LOCAL_TZ

from backend.core.security import verify_api_key
from backend.db.supabase_client import supabase
from backend.logic.five_three_one_logic import PowerliftingEngine
from backend.schemas.workout import CompleteWorkoutLog
from backend.services.workout_service import (
    build_warmup_sets,
    build_work_sets,
    check_for_pr,
    did_workout_today,
    get_next_workout_logic,
    get_pr_prediction,
    get_scheduled_lift_for_date,
    minimum_required_reps_for_week,
)
from backend.utils.formatters import format_lift_name, round_to_nearest_5

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/lifts")
def get_lifts():
    response = supabase.table("lift_profiles").select("*").execute()
    return response.data


@router.get("/calculate/531/{weight}")
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


@router.get("/workout/today/{lift}")
def get_today_workout(lift: str, user_id: str):
    profile_response = (
        supabase.table("lift_profiles")
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


@router.post("/log/workout/complete")
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

    top_set = next((item for item in workout.sets if item.set_name == "Set 3"), workout.sets[-1])

    pr_result = check_for_pr(
        user_id=workout.user_id,
        lift=workout.lift,
        weight=top_set.weight,
        reps=top_set.reps
    )

    insert_response = supabase.table("workouts").insert(rows).execute()

    required_reps = minimum_required_reps_for_week(workout.week)
    hit_minimum = top_set.reps >= required_reps

    next_week = workout.week
    next_cycle = workout.cycle
    new_training_max = None
    progression_note = ""

    if workout.week == 4:
        next_week = 1
        next_cycle = workout.cycle + 1

        profile_response = (
            supabase.table("lift_profiles")
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

            progression_note = f"Deload complete. Next cycle starts at training max {round(new_training_max)}."
        else:
            progression_note = "Deload complete. I could not find the lift profile to update training max."
    else:
        if hit_minimum:
            next_week = workout.week + 1
            supabase.table("lift_profiles").update({
                "week": next_week,
                "cycle": next_cycle
            }).eq("user_id", workout.user_id).eq("lift", workout.lift).execute()

            progression_note = f"You hit the minimum reps. Advancing to week {next_week}."
        else:
            supabase.table("lift_profiles").update({
                "week": workout.week,
                "cycle": next_cycle
            }).eq("user_id", workout.user_id).eq("lift", workout.lift).execute()

            progression_note = f"You missed the minimum reps for week {workout.week}. Repeat this week, knucklehead."

    spoken_response = f"Workout logged for {format_lift_name(workout.lift)}. {progression_note}"

    if pr_result["is_weight_pr"] and pr_result["is_est_1rm_pr"]:
        spoken_response += " New weight PR and estimated one rep max PR."
    elif pr_result["is_weight_pr"]:
        spoken_response += " New weight PR."
    elif pr_result["is_est_1rm_pr"]:
        spoken_response += f" New estimated one rep max PR. Estimated max {pr_result['current_est_1rm']} pounds."

    return {
        "message": "Workout logged successfully",
        "logged_sets": insert_response.data,
        "next_week": next_week,
        "next_cycle": next_cycle,
        "new_training_max": new_training_max,
        "required_reps": required_reps,
        "hit_minimum": hit_minimum,
        "pr_result": pr_result,
        "spoken_response": spoken_response
    }


@router.get("/history/{lift}")
def get_history(lift: str, user_id: str):
    response = (
        supabase.table("workouts")
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


@router.get("/nextworkout")
def next_workout(user_id: str = "john"):
    try:
        result = get_next_workout_logic(user_id)
        return {
            "status": "ok",
            **result
        }
    except Exception as e:
        return {
            "status": "error",
            "spoken_response": "Sorry Daddy! I had trouble determining your next workout.",
            "error": str(e)
        }

@router.post("/apple/workout")
def log_apple_workout(payload:dict):
    workout_type = payload.get("workout_type")

    if workout_type == "strength":
        supabase.table("apple_strength_workouts").insert({
            "user_id": payload.get("user_id"),
            "duration_minutes": payload.get("duration_minutes", payload.get("duration")),
            "calories": payload.get("calories"),
            "avg_heart_rate": payload.get("heart_rate"),
        }).execute()

    return {"status": "logged"} 

@router.get("/workouts/today/recap")
def workout_recap(user_id: str = "john"):
    today = datetime.now(LOCAL_TZ).date()

    # 5/3/1 workouts
    strength_logs = (
        supabase.table("workouts")
        .select("*")
        .eq("user_id", user_id)
        .gte("created_at", str(today))
        .execute()
    )

    # apple strength
    apple_strength = (
        supabase.table("apple_strength_workouts")
        .select("*")
        .eq("user_id", user_id)
        .gte("created_at", str(today))
        .execute()
    )

    # runs
    runs = (
        supabase.table("apple_run_workouts")
        .select("*")
        .eq("user_id", user_id)
        .gte("created_at", str(today))
        .execute()
    )

    spoken = "Here's your workout summary. "

    if strength_logs.data:
        spoken += "You completed your strength training workout. "

    if apple_strength.data:
        duration_minutes = apple_strength.data[0].get("duration_minutes") or apple_strength.data[0].get("duration")
        spoken += f"You also did a strength session for {duration_minutes} minutes. "

    if runs.data:
        run = runs.data[0]
        spoken += f"You ran {run['distance_miles']} miles at {run['avg_pace']} pace. "

    if not (strength_logs.data or apple_strength.data or runs.data):
        spoken += "No workouts logged today. Get moving, knucklehead."

    return {
        "status": "ok",
        "spoken_response": spoken
    } 

@router.get("/today-status")
def today_status(user_id: str = "john"):
    try:
        today = datetime.now(LOCAL_TZ).date()
        scheduled_today = get_scheduled_lift_for_date(today)
        worked_out_today = did_workout_today(user_id)

        if worked_out_today:
            day_type = "completed"
            spoken_response = "You already trained today."
        elif scheduled_today:
            day_type = scheduled_today
            spoken_response = f"Today is {format_lift_name(scheduled_today)} day."
        else:
            day_type = "rest"
            spoken_response = "Today is a rest day."

        return {
            "status": "ok",
            "day_type": day_type,
            "scheduled_today": scheduled_today,
            "worked_out_today": worked_out_today,
            "spoken_response": spoken_response,
        }

    except Exception as e:
        return {
            "status": "error",
            "day_type": "rest",
            "scheduled_today": None,
            "worked_out_today": False,
            "spoken_response": "I had trouble checking today's workout status.",
            "error": str(e),
        }
