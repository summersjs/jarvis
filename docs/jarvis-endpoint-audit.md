# Jarvis Assistant Endpoint Audit

Date: 2026-07-12

Jarvis is a FastAPI backend protected by the shared API key dependency. Jarvis does not receive raw Supabase access, SQL access, shell access, filesystem access, or arbitrary HTTP endpoint access.

## Current Jarvis Tool Exposure

The first assistant tool layer is read-only and gated by feature flags:

- `JARVIS_TOOLS_ENABLED`: defaults to `true`
- `JARVIS_WRITE_TOOLS_ENABLED`: defaults to `true`
- `JARVIS_CONFIRMATION_TOOLS_ENABLED`: defaults to `false`
- `JARVIS_MAX_TOOL_CALLS`: defaults to `5`

Registered read tools:

- `get_morning_brief`
- `get_daily_debrief`
- `get_today_schedule`
- `list_active_goals`
- `get_goal`
- `list_shopping_items`
- `list_active_forge_projects`
- `get_today_workout`
- `get_recent_health_summary`

The chat route injects approved tool results into Jarvis's system context. Jarvis is instructed to use supplied data only, and to never claim she changed data unless a backend tool result reports success.

## Risk Classification

Read-only, currently exposed to Jarvis:

- Morning brief
- Daily debrief
- Today's schedule
- Active goals
- Shopping list summaries
- Active Forge projects
- Today's workout and next workout context
- Recent health dashboard summary

Validated write tools currently exposed to Jarvis:

- `log_goal_progress`: logs progress/completion against the best matching active goal. Example: "I went on a date with Tierra."
- `add_shopping_item`: adds an item to the current shopping list.
- `check_shopping_item`: marks a matching shopping item checked.
- `log_health_event`: logs a recognized health event/symptom.
- `upsert_health_checkin`: updates today's water/caffeine health check-in fields.
- `complete_forge_task`: marks a matching Forge task complete.
- `complete_forge_project`: archives/completes a matching Forge project.
- `capture_forge_spark`: saves a Forge spark/idea.

Medium-risk writes, not broadly exposed to Jarvis:

- Arbitrary goal field edits
- Arbitrary Forge project/task/session/note/file/ledger edits
- Meal plan and recipe changes
- Food Vault inventory changes
- Finance transaction and budget changes

High-risk or destructive actions, not exposed to Jarvis:

- Deletes across goals, Forge, archive, shopping, meal planner, recipes, food vault, and health
- Calendar resync
- Chronicle build operations
- Workout completion logging
- Any direct Supabase, SQL, shell, or generic API execution

## Routes Reviewed

Relevant route modules include:

- `assistant`: assistant status, tool status, chat, speech
- `briefing`: morning briefing
- `debrief`: daily debrief and history
- `calendar`: today and next calendar views, resync
- `goals`: goals, logs, plans, milestones
- `forge`: desktop/project/task/session/note/file/ledger/spark operations
- `shopping`: shopping lists and list items
- `workouts`: lift summaries, next workout, workout logging
- `health`: dashboard, events, check-ins, doctor summary
- `finance`, `meal_planner`, `recipies`, `food_vault`, `archive`, `preferences`, `voice`, `dashboard`, `status`

## Guardrails

- Jarvis tools are allowlisted by name in `backend/assistant/tools/registry.py`.
- Tool selection is server-side keyword matching, not model-controlled function execution.
- Tool responses are trimmed and sanitized to small JSON payloads.
- Write tools are narrow, typed wrappers around existing service functions.
- Destructive delete tools are not registered.
- Confirmation flows are not implemented yet.
- Errors return generic unavailable messages to Jarvis instead of stack traces.

## Next Hardening Steps

- Add per-tool audit logging with request ID, user ID, source, selected tool, result status, and duration.
- Add confirmation-token flow before any future write action.
- Add tests for tool selection, write-disabled behavior, and schema validation.
- Add stricter redaction for sensitive calendar/health fields if Jarvis starts reading wider datasets.
- Add rate limiting around `/assistant/chat` and `/assistant/tools/status`.
