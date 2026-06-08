from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timedelta

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.services.calendar_service import (
    get_calendar_events_for_date,
    get_calendar_summary_for_date,
)
from backend.services.goal_service import list_goals
from backend.services.meal_planner_service import list_meal_plan_entries
from backend.services.workout_service import (
    get_scheduled_lift_for_date,
    get_next_scheduled_lift_after,
    get_todays_workout_summary,
)
from backend.utils.formatters import format_lift_name
from backend.utils.local_store import read_json, write_json


DEBRIEF_FILE = "daily_debriefs.json"
MONTHLY_BUDGET_FILE = "finance_monthly_budgets.json"
TRANSACTIONS_FILE = "finance_transactions.json"


def _today_str() -> str:
    return datetime.now(LOCAL_TZ).date().isoformat()


def _month_key(date_str: str | None = None) -> str:
    if date_str:
        return date_str[:7]
    return _today_str()[:7]


def _debrief_entries() -> list[dict]:
    return read_json(DEBRIEF_FILE, [])


def _save_debrief_entries(entries: list[dict]):
    return write_json(DEBRIEF_FILE, entries)


def _budget_entries() -> list[dict]:
    return read_json(MONTHLY_BUDGET_FILE, [])


def _save_budget_entries(entries: list[dict]):
    return write_json(MONTHLY_BUDGET_FILE, entries)


def _transactions() -> list[dict]:
    return read_json(TRANSACTIONS_FILE, [])


def _save_transactions(transactions: list[dict]):
    return write_json(TRANSACTIONS_FILE, transactions)


def _lookup_latest_debrief(user_id: str, date_str: str) -> dict | None:
    matches = [
        entry
        for entry in _debrief_entries()
        if entry.get("user_id") == user_id and entry.get("date") == date_str
    ]
    if not matches:
        return None
    return sorted(matches, key=lambda entry: entry.get("updated_at") or entry.get("created_at") or "", reverse=True)[0]


def _goals_as_objectives(user_id: str) -> list[dict]:
    goals = list_goals(user_id, active_only=True)
    objectives = []
    for goal in goals[:4]:
        target = float(goal.get("target_value") or 0)
        current = float(goal.get("current_value") or 0)
        progress = goal.get("progress") or {}
        completed = bool(progress.get("is_complete")) or (target > 0 and current >= target)
        note = _goal_objective_note(goal, current, target)
        objectives.append({
            "id": goal.get("id"),
            "title": goal.get("title", "Untitled goal"),
            "completed": completed,
            "notes": note,
            "blocker": None if completed else _goal_blocker(goal, current, target),
            "current_value": current,
            "target_value": target,
            "unit": goal.get("unit"),
            "category": goal.get("category"),
            "progress_percent": progress.get("percent"),
        })
    return objectives


def _goal_objective_note(goal: dict, current: float, target: float) -> str:
    title = (goal.get("title") or "").lower()
    unit = goal.get("unit") or ""
    eta_summary = goal.get("eta", {}).get("summary")

    if target > 0 and "feature" in title:
        return f"{int(current)} Jarvis features shipped toward {int(target)} this week."

    if target > 0 and unit:
        return f"{format_number(current)} of {format_number(target)} {unit} toward the target."

    return goal.get("description") or eta_summary or "Progress logged from the goals board."


def _goal_blocker(goal: dict, current: float, target: float) -> str:
    if target > 0 and current < target:
        remaining = round(target - current, 2)
        unit = goal.get("unit") or "units"
        return f"{format_number(remaining)} {unit} remaining to hit the target."

    return goal.get("eta", {}).get("summary") or "No blocker recorded."


def _today_meals(user_id: str, date_str: str) -> list[dict]:
    entries = list_meal_plan_entries(user_id=user_id, start_date=date_str, end_date=date_str)
    meals = []
    for entry in entries:
        recipe = entry.get("recipes") or {}
        meals.append({
            "id": entry.get("id"),
            "meal_type": entry.get("meal_type"),
            "name": recipe.get("title") or entry.get("custom_meal_name") or "Unnamed meal",
            "notes": entry.get("notes"),
        })
    return meals


def _food_transactions_for_date(user_id: str, date_str: str) -> list[dict]:
    return [
        transaction
        for transaction in _transactions()
        if transaction.get("user_id") == user_id and transaction.get("date") == date_str
        and transaction.get("category") in {"Groceries", "Eating Out"}
    ]


def _current_month_budget(user_id: str, month: str) -> dict:
    for budget in _budget_entries():
        if budget.get("user_id") == user_id and budget.get("month") == month:
            return budget
    return {
        "user_id": user_id,
        "month": month,
        "income": 0,
        "fixed_bills": 0,
        "groceries_budget": 0,
        "eating_out_budget": 0,
        "gas_budget": 0,
        "kids_family_budget": 0,
        "debt_budget": 0,
        "miscellaneous_budget": 0,
        "variable_categories": {},
    }


def _food_budget_status(spend_today: float, budget: dict, date_obj: datetime) -> str:
    groceries = float(budget.get("groceries_budget") or 0)
    eating_out = float(budget.get("eating_out_budget") or 0)
    monthly_total = groceries + eating_out
    if monthly_total <= 0:
        return "WATCH" if spend_today > 0 else "UNDER CONTROL"

    days_in_month = monthrange(date_obj.year, date_obj.month)[1]
    daily_target = monthly_total / days_in_month
    if spend_today <= daily_target * 0.9:
        return "UNDER CONTROL"
    if spend_today <= daily_target * 1.1:
        return "WATCH"
    return "OVER"


def _safe_float(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def format_number(value: float | int | None) -> str:
    if value is None:
        return "0"
    if float(value).is_integer():
        return str(int(value))
    return f"{round(float(value), 2):g}"


def _today_workout_context(user_id: str, today_date) -> dict:
    scheduled_lift = get_scheduled_lift_for_date(today_date)
    workout_summary = get_todays_workout_summary(user_id, today_date)
    next_protocol = get_next_scheduled_lift_after(today_date)
    tomorrow_date = today_date + timedelta(days=1)
    tomorrow_lift = get_scheduled_lift_for_date(tomorrow_date)
    today_events = get_calendar_events_for_date(today_date)
    tomorrow_events = get_calendar_events_for_date(tomorrow_date)

    workout_completed = bool(workout_summary)
    lift_completed = None
    top_set = None
    sets_completed = 0
    logs = []
    if workout_summary:
        lift_completed = workout_summary.get("lift_label") or format_lift_name(workout_summary.get("lift") or "")
        top_set = workout_summary.get("top_set") or {}
        sets_completed = len(workout_summary.get("logs") or [])
        logs = workout_summary.get("logs") or []

    return {
        "today_day_type": scheduled_lift or "rest",
        "scheduled_lift": scheduled_lift,
        "workout_completed": workout_completed,
        "lift_completed": lift_completed,
        "top_set": top_set,
        "sets_completed": sets_completed,
        "logs": logs,
        "next_protocol": next_protocol,
        "tomorrow_day_type": tomorrow_lift or "rest",
        "tomorrow_scheduled_lift": tomorrow_lift,
        "today_calendar_events": today_events,
        "tomorrow_calendar_events": tomorrow_events,
        "today_calendar_summary": get_calendar_summary_for_date(today_date, "today"),
        "tomorrow_calendar_summary": get_calendar_summary_for_date(tomorrow_date, "tomorrow"),
    }


def _build_objectives(user_id: str, saved_objectives: list[dict] | None = None) -> list[dict]:
    derived = _goals_as_objectives(user_id)
    if not saved_objectives:
        return derived

    saved_by_title = {
        (objective.get("title") or "").lower(): objective
        for objective in saved_objectives
        if objective.get("title")
    }

    merged = []
    for objective in derived:
        saved = saved_by_title.get((objective.get("title") or "").lower())
        if saved:
            merged.append({
                **objective,
                "notes": saved.get("notes") or objective.get("notes"),
                "blocker": saved.get("blocker") if saved.get("blocker") is not None else objective.get("blocker"),
            })
        else:
            merged.append(objective)
    return merged


def _build_victory(saved_victory: dict | None, training: dict, objectives: list[dict]) -> dict:
    if saved_victory and saved_victory.get("win"):
        return saved_victory

    if training.get("workout_completed") and training.get("lift_completed"):
        return {
            "win": f"Finished {training['lift_completed']} and pushed the training chain forward.",
            "category": "Training",
        }

    featured_objective = next((objective for objective in objectives if "feature" in (objective.get("title") or "").lower()), None)
    if featured_objective:
        return {
            "win": featured_objective.get("notes") or f"Moved {featured_objective['title']} forward.",
            "category": "App Build",
        }

    return {
        "win": "Kept the system moving.",
        "category": "Personal",
    }


def _build_lessons(saved_lessons: dict | None, training: dict, daily_status: str, tomorrow_day_type: str) -> dict:
    if saved_lessons and any(saved_lessons.get(key) for key in ("worked", "did_not_work", "adjust_tomorrow")):
        return saved_lessons

    did_workout = bool(training.get("workout_completed"))
    if did_workout:
        worked = f"{training.get('lift_completed') or 'Training'} was logged and the session moved your goals forward."
        did_not_work = "Nothing significant blocked the session."
        adjust_tomorrow = f"Keep {tomorrow_day_type.replace('_', ' ')} day simple and stay on plan."
    else:
        worked = "The schedule and goals were readable."
        did_not_work = "The workout log is missing for today."
        adjust_tomorrow = "Do the first important thing earlier and keep tomorrow simple."

    if daily_status == "OVER":
        adjust_tomorrow = "Tighten spending and stay inside the food budget."

    return {
        "worked": worked,
        "did_not_work": did_not_work,
        "adjust_tomorrow": adjust_tomorrow,
    }


def _build_tomorrow_prep(saved_tomorrow: dict | None, tomorrow_events: list[dict], next_protocol: dict | None, tomorrow_day_type: str) -> dict:
    top_priorities = [event.get("summary") for event in tomorrow_events if event.get("summary")]
    top_priorities = top_priorities[:3]

    if not top_priorities:
        if tomorrow_day_type == "rest":
            top_priorities = ["Recovery day", "Keep the calendar clear", "Protect energy"]
        elif next_protocol and next_protocol.get("lift"):
            top_priorities = [f"Prepare for {format_lift_name(next_protocol['lift'])}", "Clear the morning", "Stay on schedule"]

    return {
        "top_priorities": saved_tomorrow.get("top_priorities") if saved_tomorrow and saved_tomorrow.get("top_priorities") else top_priorities,
        "shopping_items": saved_tomorrow.get("shopping_items") if saved_tomorrow and saved_tomorrow.get("shopping_items") else [],
        "meal_prep": saved_tomorrow.get("meal_prep") if saved_tomorrow else None,
        "reminder": saved_tomorrow.get("reminder") if saved_tomorrow else None,
    }


def save_daily_debrief_entry(payload: dict) -> dict:
    entries = _debrief_entries()
    now = datetime.now(LOCAL_TZ).isoformat()
    payload = dict(payload)
    payload["created_at"] = payload.get("created_at") or now
    payload["updated_at"] = now

    entries = [
        entry
        for entry in entries
        if not (entry.get("user_id") == payload.get("user_id") and entry.get("date") == payload.get("date"))
    ]
    entries.append(payload)
    _save_debrief_entries(entries)
    return payload


def list_daily_debrief_entries(user_id: str) -> list[dict]:
    return [
        entry
        for entry in _debrief_entries()
        if entry.get("user_id") == user_id
    ]


def build_daily_debrief_summary(user_id: str = "john") -> dict:
    now = datetime.now(LOCAL_TZ)
    today = now.date().isoformat()
    month = today[:7]
    saved = _lookup_latest_debrief(user_id, today) or {}
    budget = _current_month_budget(user_id, month)
    transactions = _food_transactions_for_date(user_id, today)
    food_spend_today = round(sum(float(item.get("amount") or 0) for item in transactions), 2)
    workout_context = _today_workout_context(user_id, now.date())
    scheduled_lift = workout_context["scheduled_lift"]
    next_protocol = workout_context["next_protocol"]
    tomorrow_day_type = workout_context["tomorrow_day_type"]
    workout_completed = workout_context["workout_completed"]
    objectives = _build_objectives(user_id, saved.get("objectives"))
    objectives_completed = sum(1 for objective in objectives if objective.get("completed"))
    objectives_total = len(objectives)
    daily_status = _food_budget_status(food_spend_today, budget, now)
    if not workout_context["today_day_type"] or workout_context["today_day_type"] == "rest":
        overall_status = "RECOVERY"
    elif not workout_completed:
        overall_status = "MISSED" if daily_status != "OVER" else "CHAOTIC"
    elif objectives_completed >= objectives_total and daily_status == "UNDER CONTROL":
        overall_status = "COMPLETE"
    elif daily_status == "OVER":
        overall_status = "CHAOTIC"
    else:
        overall_status = "PARTIAL"

    training_defaults = {
        "workout_completed": workout_completed,
        "scheduled_lift": scheduled_lift,
        "lift_completed": workout_context["lift_completed"] if workout_completed else None,
        "top_set_weight": workout_context["top_set"].get("weight") if workout_context["top_set"] else None,
        "top_set_reps": workout_context["top_set"].get("reps") if workout_context["top_set"] else None,
        "sets_completed": workout_context["sets_completed"],
        "goal_impact": None,
        "energy_level": saved.get("training", {}).get("energy_level"),
        "pain_notes": saved.get("training", {}).get("pain_notes"),
        "training_notes": saved.get("training", {}).get("training_notes"),
    }

    if workout_completed and scheduled_lift:
        matching_goal = next(
            (
                objective
                for objective in objectives
                if scheduled_lift.replace("_", " ") in (objective.get("title") or "").lower()
                or "feature" in (objective.get("title") or "").lower()
                or "ship" in (objective.get("title") or "").lower()
            ),
            None,
        )
        if matching_goal:
            training_defaults["goal_impact"] = f"{matching_goal['title']} is now at {format_number(matching_goal.get('current_value'))}/{format_number(matching_goal.get('target_value'))}."
        else:
            training_defaults["goal_impact"] = f"{format_lift_name(scheduled_lift)} pushed the strength plan closer to the next milestone."

    training = {
        **training_defaults,
        **(saved.get("training") or {}),
    }
    training["workout_completed"] = workout_completed
    training["scheduled_lift"] = scheduled_lift
    training["lift_completed"] = training_defaults["lift_completed"]
    training["top_set_weight"] = training_defaults["top_set_weight"]
    training["top_set_reps"] = training_defaults["top_set_reps"]
    training["sets_completed"] = training_defaults["sets_completed"]
    training["goal_impact"] = training_defaults["goal_impact"]

    nutrition_defaults = {
        "meals_planned_today": len(_today_meals(user_id, today)),
        "meals_completed": saved.get("nutrition", {}).get("meals_completed", 0),
        "ate_out_today": any(
            row.get("category") == "Eating Out"
            or "eat out" in (row.get("notes") or "").lower()
            for row in transactions
        ),
        "estimated_food_spend": food_spend_today,
        "notes": saved.get("nutrition", {}).get("notes"),
    }
    nutrition = {
        **nutrition_defaults,
        **(saved.get("nutrition") or {}),
    }
    nutrition["meals_planned_today"] = nutrition_defaults["meals_planned_today"]
    nutrition["estimated_food_spend"] = nutrition_defaults["estimated_food_spend"]
    nutrition["ate_out_today"] = nutrition_defaults["ate_out_today"]

    finance_defaults = {
        "money_spent_today": food_spend_today,
        "category": "Food" if food_spend_today else "None",
        "notes": saved.get("finance", {}).get("notes"),
        "unexpected_expense": saved.get("finance", {}).get("unexpected_expense", False),
        "spending_status": daily_status,
    }
    finance = {
        **finance_defaults,
        **(saved.get("finance") or {}),
    }
    finance["money_spent_today"] = finance_defaults["money_spent_today"]
    finance["spending_status"] = finance_defaults["spending_status"]

    victory = _build_victory(saved.get("victory"), training, objectives)
    lessons = _build_lessons(saved.get("lessons"), training, daily_status, tomorrow_day_type)
    tomorrow = _build_tomorrow_prep(saved.get("tomorrow"), workout_context["tomorrow_calendar_events"], next_protocol, tomorrow_day_type)

    if saved.get("victory", {}).get("win"):
        victory = saved["victory"]
    if saved.get("lessons"):
        lessons = {
            "worked": saved.get("lessons", {}).get("worked") or lessons.get("worked"),
            "did_not_work": saved.get("lessons", {}).get("did_not_work") or lessons.get("did_not_work"),
            "adjust_tomorrow": saved.get("lessons", {}).get("adjust_tomorrow") or lessons.get("adjust_tomorrow"),
        }
    if saved.get("tomorrow"):
        tomorrow = {
            "top_priorities": saved.get("tomorrow", {}).get("top_priorities") or tomorrow.get("top_priorities"),
            "shopping_items": saved.get("tomorrow", {}).get("shopping_items") or tomorrow.get("shopping_items"),
            "meal_prep": saved.get("tomorrow", {}).get("meal_prep") or tomorrow.get("meal_prep"),
            "reminder": saved.get("tomorrow", {}).get("reminder") or tomorrow.get("reminder"),
        }

    spoken_bits = [
        f"Evening debrief, John. Today was {overall_status.lower().replace('_', ' ')}.",
        f"{format_lift_name(scheduled_lift)} was scheduled today." if scheduled_lift else "Today was a recovery day.",
        f"You completed {objectives_completed} of {objectives_total} objectives." if objectives_total else "No active objectives were loaded.",
        f"Workout logged: {training['lift_completed']}." if workout_completed and training.get("lift_completed") else "No workout log was found today.",
        f"That session moved {training['goal_impact']}" if training.get("goal_impact") else None,
        f"Stayed {daily_status.lower()} on spending." if daily_status else None,
        f"Next protocol is {format_lift_name(next_protocol['lift'])} on {next_protocol['weekday']}." if next_protocol else None,
        f"Tomorrow looks like a {tomorrow_day_type.replace('_', ' ')} day." if tomorrow_day_type else None,
        f"Main lesson: {lessons.get('adjust_tomorrow') or lessons.get('worked') or 'keep tomorrow simple.'}",
        f"Top priority tomorrow is {tomorrow.get('top_priorities', ['keeping things simple'])[0]}." if tomorrow.get("top_priorities") else None,
    ]
    spoken_response = " ".join(bit for bit in spoken_bits if bit)

    return {
        "status": "ok",
        "user_id": user_id,
        "date": today,
        "overall_status": overall_status,
        "day_type": workout_context["today_day_type"],
        "scheduled_lift": scheduled_lift,
        "scheduled_lift_label": format_lift_name(scheduled_lift) if scheduled_lift else None,
        "next_protocol": next_protocol,
        "tomorrow_day_type": tomorrow_day_type,
        "tomorrow_scheduled_lift": workout_context["tomorrow_scheduled_lift"],
        "objectives_completed": objectives_completed,
        "objectives_total": objectives_total,
        "workout_completed": workout_completed,
        "food_spend_today": food_spend_today,
        "daily_spending_status": daily_status,
        "victory": victory,
        "lessons": lessons,
        "tomorrow_priorities": tomorrow.get("top_priorities", []),
        "calendar": {
            "today": {
                "summary": workout_context["today_calendar_summary"],
                "events": workout_context["today_calendar_events"],
            },
            "tomorrow": {
                "summary": workout_context["tomorrow_calendar_summary"],
                "events": workout_context["tomorrow_calendar_events"],
            },
        },
        "saved_entry": saved,
        "objectives": objectives,
        "training": training,
        "nutrition": nutrition,
        "finance": finance,
        "spoken_response": spoken_response,
    }


def save_monthly_budget(payload: dict) -> dict:
    budgets = _budget_entries()
    now = datetime.now(LOCAL_TZ).isoformat()
    payload = dict(payload)
    payload["created_at"] = payload.get("created_at") or now
    payload["updated_at"] = now

    budgets = [
        budget
        for budget in budgets
        if not (budget.get("user_id") == payload.get("user_id") and budget.get("month") == payload.get("month"))
    ]
    budgets.append(payload)
    _save_budget_entries(budgets)
    return payload


def list_monthly_budgets(user_id: str) -> list[dict]:
    return [budget for budget in _budget_entries() if budget.get("user_id") == user_id]


def save_transaction(payload: dict) -> dict:
    transactions = _transactions()
    now = datetime.now(LOCAL_TZ).isoformat()
    payload = dict(payload)
    payload["id"] = payload.get("id") or f"txn_{len(transactions) + 1}"
    payload["created_at"] = payload.get("created_at") or now
    transactions.append(payload)
    _save_transactions(transactions)
    return payload


def list_transactions(user_id: str, month: str | None = None) -> list[dict]:
    rows = [transaction for transaction in _transactions() if transaction.get("user_id") == user_id]
    if month:
        rows = [row for row in rows if (row.get("date") or "").startswith(month)]
    return sorted(rows, key=lambda row: row.get("date") or "", reverse=True)


def build_finance_ops_summary(user_id: str = "john", month: str | None = None) -> dict:
    now = datetime.now(LOCAL_TZ)
    month_key = month or now.date().isoformat()[:7]
    budget = _current_month_budget(user_id, month_key)
    transactions = list_transactions(user_id, month_key)
    food_transactions = [row for row in transactions if row.get("category") in {"Groceries", "Eating Out"}]

    month_year = datetime.strptime(month_key + "-01", "%Y-%m-%d")
    days_in_month = monthrange(month_year.year, month_year.month)[1]
    weekly_divisor = 52 / 12

    monthly_groceries = float(budget.get("groceries_budget") or 0)
    monthly_eating_out = float(budget.get("eating_out_budget") or 0)
    weekly_grocery_target = round(monthly_groceries / weekly_divisor, 2)
    weekly_eating_out_target = round(monthly_eating_out / weekly_divisor, 2)
    weekly_total_target = round(weekly_grocery_target + weekly_eating_out_target, 2)

    week_start = now.date() - timedelta(days=now.weekday())
    week_end = week_start + timedelta(days=6)
    week_transactions = [
        row for row in transactions
        if week_start.isoformat() <= (row.get("date") or "") <= week_end.isoformat()
    ]
    actual_grocery_spend = round(sum(float(row.get("amount") or 0) for row in week_transactions if row.get("category") == "Groceries"), 2)
    actual_eating_out_spend = round(sum(float(row.get("amount") or 0) for row in week_transactions if row.get("category") == "Eating Out"), 2)
    total_actual_food_spend = round(actual_grocery_spend + actual_eating_out_spend, 2)
    over_under = round(weekly_total_target - total_actual_food_spend, 2)
    spending_status = "ON TRACK" if over_under >= 25 else "WATCH" if over_under >= 0 else "OVER"

    return {
        "status": "ok",
        "user_id": user_id,
        "month": month_key,
        "budget": budget,
        "transactions": transactions,
        "dashboard_cards": {
            "food_budget_remaining_week": round(weekly_total_target - total_actual_food_spend, 2),
            "eating_out_budget_remaining_week": round(weekly_eating_out_target - actual_eating_out_spend, 2),
            "total_food_over_under": over_under,
            "spending_status": spending_status,
        },
        "weekly_food_budget": {
            "monthly_grocery_budget": monthly_groceries,
            "monthly_eating_out_budget": monthly_eating_out,
            "weekly_grocery_target": weekly_grocery_target,
            "weekly_eating_out_target": weekly_eating_out_target,
            "weekly_total_food_target": weekly_total_target,
            "actual_grocery_spend_this_week": actual_grocery_spend,
            "actual_eating_out_spend_this_week": actual_eating_out_spend,
            "total_actual_food_spend_this_week": total_actual_food_spend,
            "over_under_amount": over_under,
        },
        "summary": {
            "month_income": float(budget.get("income") or 0),
            "fixed_bills": float(budget.get("fixed_bills") or 0),
            "variable_categories": budget.get("variable_categories") or {},
            "days_in_month": days_in_month,
            "food_transactions_count": len(food_transactions),
        },
    }
