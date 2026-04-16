from fastapi import APIRouter, HTTPException, Depends

from backend.core.security import verify_api_key
from backend.db.supabase_client import supabase
from backend.logic.five_three_one_logic import PowerliftingEngine
from backend.schemas.workout import CompleteWorkoutLog
from backend.services.workout_service import (
    build_warmup_sets,
    build_work_sets,
    check_for_pr,
    get_next_workout_logic,
    get_pr_prediction,
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

    insert_response = supabase.table("workouts").insert(rows).execute()

    top_set = next((item for item in workout.sets if item.set_name == "Set 3"), workout.sets[-1])

    pr_result = check_for_pr(
        user_id=workout.user_id,
        lift=workout.lift,
        weight=top_set.weight,
        reps=top_set.reps
    )

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