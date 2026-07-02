-- Jarvis Daily Debrief Supabase migration + local JSON import.
-- Paste this into Supabase SQL editor.
-- Safe to run more than once.

create table if not exists public.daily_debrief_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  date date not null,
  overall_status text not null default 'PARTIAL',
  mission_score integer null,
  daily_score integer null,
  weekly_score integer null,
  lifetime_score integer null,
  lifetime_rank text null,
  is_finalized boolean not null default false,
  completed_at timestamptz null,
  summary text null,
  objectives jsonb not null default '[]'::jsonb,
  training jsonb not null default '{}'::jsonb,
  nutrition jsonb not null default '{}'::jsonb,
  finance jsonb not null default '{}'::jsonb,
  victory jsonb not null default '{}'::jsonb,
  lessons jsonb not null default '{}'::jsonb,
  tomorrow jsonb not null default '{}'::jsonb,
  notes jsonb null,
  source text not null default 'daily_debrief',
  raw_payload jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_debrief_entries_user_date_key unique(user_id, date)
);

alter table public.daily_debrief_entries
  add column if not exists source text not null default 'daily_debrief',
  add column if not exists raw_payload jsonb null;

alter table public.daily_debrief_entries
  alter column objectives set default '[]'::jsonb,
  alter column training set default '{}'::jsonb,
  alter column nutrition set default '{}'::jsonb,
  alter column finance set default '{}'::jsonb,
  alter column victory set default '{}'::jsonb,
  alter column lessons set default '{}'::jsonb,
  alter column tomorrow set default '{}'::jsonb;

create index if not exists idx_daily_debrief_entries_user_date
  on public.daily_debrief_entries(user_id, date desc);

create index if not exists idx_daily_debrief_entries_finalized
  on public.daily_debrief_entries(user_id, is_finalized, date desc);

create index if not exists idx_daily_debrief_entries_training_gin
  on public.daily_debrief_entries using gin(training);

create index if not exists idx_daily_debrief_entries_nutrition_gin
  on public.daily_debrief_entries using gin(nutrition);

create index if not exists idx_daily_debrief_entries_finance_gin
  on public.daily_debrief_entries using gin(finance);

create index if not exists idx_daily_debrief_entries_victory_gin
  on public.daily_debrief_entries using gin(victory);

create index if not exists idx_daily_debrief_entries_lessons_gin
  on public.daily_debrief_entries using gin(lessons);

create table if not exists public.daily_debrief_objectives (
  id uuid primary key default gen_random_uuid(),
  debrief_id uuid not null references public.daily_debrief_entries(id) on delete cascade,
  user_id text not null default 'john',
  date date not null,
  goal_id text null,
  title text not null,
  completed boolean not null default false,
  notes text null,
  blocker text null,
  sort_order integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_debrief_objectives_debrief_sort_key unique(debrief_id, sort_order)
);

create index if not exists idx_daily_debrief_objectives_user_date
  on public.daily_debrief_objectives(user_id, date desc);

create index if not exists idx_daily_debrief_objectives_goal_id
  on public.daily_debrief_objectives(goal_id);

create index if not exists idx_daily_debrief_objectives_completed
  on public.daily_debrief_objectives(user_id, completed, date desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_daily_debrief_entries_updated_at on public.daily_debrief_entries;
create trigger trg_daily_debrief_entries_updated_at
before update on public.daily_debrief_entries
for each row execute function public.touch_updated_at();

drop trigger if exists trg_daily_debrief_objectives_updated_at on public.daily_debrief_objectives;
create trigger trg_daily_debrief_objectives_updated_at
before update on public.daily_debrief_objectives
for each row execute function public.touch_updated_at();

comment on table public.daily_debrief_entries is
  'Daily Debrief snapshots including mission score, victory log, lessons learned, training debrief, nutrition debrief, finance brief, tomorrow prep, and full JSON payload.';

comment on table public.daily_debrief_objectives is
  'Exploded goal impact/objective rows from each Daily Debrief entry for easier goal impact review and reporting.';

insert into public.daily_debrief_entries (
  user_id, date, overall_status, mission_score, daily_score, weekly_score, lifetime_score, lifetime_rank,
  is_finalized, completed_at, summary, objectives, training, nutrition, finance, victory, lessons, tomorrow,
  notes, source, raw_payload, created_at, updated_at
) values (
  'john', '2026-06-08'::date, 'ok', 78, 78, 97, 83, 'Commander',
  true, '2026-06-08T20:43:50.601Z'::timestamptz,
  'Evening debrief, John. Today was complete. Daily score 78. Weekly score 97. Lifetime rank Commander. deadlift was scheduled today. You completed 3 of 3 goal impacts today. Workout logged: deadlift. That session moved Deadlift 400 moved today: Completed. Stayed under control on spending. Next protocol is bench on Thursday. Tomorrow looks like a rest day. Main lesson: Keep rest day simple and stay on plan. Top priority tomorrow is Prepare for bench.',
  '[{"blocker":"","completed":true,"id":"36fe3d37-1ff9-45d7-9e70-01cecbeda893","notes":"Auto-updated from deadlift top set: 275.0 x 5.","title":"Deadlift 400"},{"blocker":"","completed":true,"id":"f79cc1ef-de5a-41ac-98e2-d07a44ebb797","notes":"Finished todays module","title":"Finish 1 training module a day"},{"blocker":"","completed":true,"id":"4c49d748-15e0-462e-8811-ba12f2345e81","notes":"Changed the daily brief on the command center page. Now its dynamic and updates throughout the day. To include a debrief at the end of day","title":"Ship 3 Features Weekly"}]'::jsonb,
  '{"energy_level":5,"lift_completed":"deadlift","pain_notes":"no pain","top_set_reps":5,"top_set_weight":275,"training_notes":"I felt like i could do more weight and more reps. Maybe next jump I''ll go up 15 instead of 10lbs. ","workout_completed":true}'::jsonb,
  '{"ate_out_today":false,"estimated_food_spend":0,"meals_completed":0,"meals_planned_today":0,"notes":null}'::jsonb,
  '{"category":"None","money_spent_today":0,"notes":null,"spending_status":"UNDER CONTROL","unexpected_expense":false}'::jsonb,
  '{"category":"Training","win":"Finished deadlift and pushed the training chain forward."}'::jsonb,
  '{"adjust_tomorrow":"Keep rest day simple and stay on plan.","did_not_work":"Nothing significant blocked the session.","worked":"deadlift was logged and the session moved your goals forward."}'::jsonb,
  '{"calendar":["Allied payday"],"meal_prep":"You have 1 events tomorrow. Allied payday from 8:00 AM to 9:00 AM.","priorities":["Prepare for bench"],"reminder":"Next protocol: bench","shopping_items":[],"top_priorities":["Prepare for bench"],"workout":{"label":"bench","lift":"bench","weekday":"Thursday"}}'::jsonb,
  null, 'json_import', null,
  '2026-06-08T16:43:51.548417-04:00'::timestamptz,
  '2026-06-08T16:43:51.548417-04:00'::timestamptz
),
(
  'john', '2026-06-29'::date, 'ok', 100, 100, 93, 100, 'Legend',
  false, null,
  'Evening debrief, John. Today was partial. Daily score 95. Weekly score 93. Lifetime rank Legend. deadlift was scheduled today. You completed 3 of 5 goal impacts today. Weekly goals moved: 2 completed, 1 above and beyond. Workout logged: deadlift. That session moved Deadlift 400 moved today: Above and Beyond. Stayed under control on spending. Planned standard: 1 Date weekly is planned for Friday, July 3. Next protocol is bench on Thursday. Tomorrow looks like a rest day. Main lesson: Keep rest day simple and stay on plan. Top priority tomorrow is Prepare for bench.',
  '[{"blocker":"","completed":true,"id":"9220617f-ed2a-4c2b-8cae-150e4c71098d","notes":"Investing consistently turns Jarvis from an idea into a permanent tool. One component at a time builds the command center.","title":"Build the Jarvis Workstation"},{"blocker":"","completed":true,"id":"36fe3d37-1ff9-45d7-9e70-01cecbeda893","notes":"Auto-updated from deadlift top set: 290.0 x 6.","title":"Deadlift 400"},{"blocker":"","completed":true,"id":"4c49d748-15e0-462e-8811-ba12f2345e81","notes":"Added Health Ops to track symptoms and a doctor mode","title":"Ship 3 Features Weekly"},{"blocker":"","completed":false,"id":"6c3283ad-d3bd-4172-95ca-31eb0a359b8d","notes":"Friday Date night","title":"1 Date weekly"},{"blocker":"No blocker recorded.","completed":false,"id":"50ca87fc-209b-4716-a2ef-d8ef4c04f805","notes":"Investing consistently turns Jarvis from an idea into a permanent tool. One component at a time builds the command center.","title":"Build Jarvis Workstation"}]'::jsonb,
  '{"energy_level":5,"lift_completed":"deadlift","pain_notes":"No pain","top_set_reps":6,"top_set_weight":290,"training_notes":"I felt great. I updated the training max today. So, I should montior this to see if I need to take it down a notch or not. ","workout_completed":true}'::jsonb,
  '{"ate_out_today":false,"estimated_food_spend":15.15,"meals_completed":4,"meals_planned_today":4,"notes":null}'::jsonb,
  '{"category":"None","money_spent_today":15.15,"notes":null,"spending_status":"UNDER CONTROL","unexpected_expense":false}'::jsonb,
  '{"category":"Training","win":"I changed deadlift so that i would be lifting heavier weight. I smashed my old record. "}'::jsonb,
  '{"adjust_tomorrow":"Tomorrow is a rest day. I probably should read something tomorrow. ","did_not_work":"I feel like I''m still avoiding some things instead of taking them head on. ","worked":"Today felt pretty good. I was able to get up and be motivated. I spent the day working on Jarvis and did my dealift workout. I also did 2 loads of laundry"}'::jsonb,
  '{"calendar":["Allied payday"],"meal_prep":"You have 1 events tomorrow. Allied payday from 8:00 AM to 9:00 AM.","priorities":["Prepare for bench"],"reminder":"Next protocol: bench","shopping_items":[],"top_priorities":["Prepare for bench"],"workout":{"label":"bench","lift":"bench","weekday":"Thursday"}}'::jsonb,
  null, 'json_import', null,
  '2026-06-29T17:15:01.831506-04:00'::timestamptz,
  '2026-06-29T17:15:01.831506-04:00'::timestamptz
),
(
  'john', '2026-06-30'::date, 'ok', 92, 92, 95, 100, 'Legend',
  false, null,
  'Evening debrief, John. Today was recovery. Daily score 92. Weekly score 95. Lifetime rank Legend. Today was a recovery day. You completed 2 of 2 goal impacts today. Daily goals moved: 1 completed, 1 above and beyond. Weekly goals moved: 1 completed, 1 above and beyond. No workout log was found today. Stayed watch on spending. Planned standard: 1 Date weekly is planned for Friday, July 3. Next protocol is bench on Thursday. Tomorrow looks like a rest day. Main lesson: Do the first important thing earlier and keep tomorrow simple. Top priority tomorrow is Prepare for bench.',
  '[{"blocker":"","completed":true,"id":"f79cc1ef-de5a-41ac-98e2-d07a44ebb797","notes":"Completed Insider Threat Training","title":"Finish 1 training module a day"},{"blocker":"","completed":true,"id":"4c49d748-15e0-462e-8811-ba12f2345e81","notes":"Polish food and recipe screens","title":"Ship 3 Features Weekly"}]'::jsonb,
  '{"energy_level":null,"lift_completed":null,"pain_notes":null,"top_set_reps":null,"top_set_weight":null,"training_notes":null,"workout_completed":false}'::jsonb,
  '{"ate_out_today":false,"estimated_food_spend":7.72,"meals_completed":8,"meals_planned_today":8,"notes":null}'::jsonb,
  '{"category":"Food","money_spent_today":7.72,"notes":null,"spending_status":"WATCH","unexpected_expense":false}'::jsonb,
  '{"category":"App Build","win":"I added lots to Jarvis today. The thing I''m most proud of is the Dream Journal that I added. "}'::jsonb,
  '{"adjust_tomorrow":"Wake up earlier and ask myself if I''m dreaming more often. Brainstorm Jarvis prompts before Codex.","did_not_work":"I wasn''t logging my symptoms as often as I should. I also did not ask myself if i was dreaming enough.","worked":"I took my time and spaced out my work. I was able to accomplish a lot without feeling overwhelmed."}'::jsonb,
  '{"calendar":["Recovery day","Keep the calendar clear","Protect energy"],"meal_prep":"You have no events scheduled for tomorrow.","priorities":["Prepare for bench"],"reminder":"Next protocol: bench","shopping_items":[],"top_priorities":["Prepare for bench"],"workout":{"label":"bench","lift":"bench","weekday":"Thursday"}}'::jsonb,
  null, 'json_import', null,
  '2026-06-30T19:59:38.083628-04:00'::timestamptz,
  '2026-06-30T19:59:38.083628-04:00'::timestamptz
),
(
  'john', '2026-07-01'::date, 'ok', 100, 100, 100, 100, 'Legend',
  true, '2026-07-01T23:31:29.627Z'::timestamptz,
  'Evening debrief, John. Today was recovery. Daily score 95. Weekly score 100. Lifetime rank Legend. Today was a recovery day. You completed 2 of 2 goal impacts today. Weekly goals moved: 2 completed, 2 above and beyond. No workout log was found today. Stayed watch on spending. Planned standard: 1 Date weekly is planned for Friday, July 3. Next protocol is bench on Thursday. Tomorrow looks like a bench day. Main lesson: Do the first important thing earlier and keep tomorrow simple. Top priority tomorrow is Prepare for bench.',
  '[{"blocker":"","completed":true,"id":"9220617f-ed2a-4c2b-8cae-150e4c71098d","notes":"Milestone completed: Case","title":"Build the Jarvis Workstation"},{"blocker":"","completed":true,"id":"4c49d748-15e0-462e-8811-ba12f2345e81","notes":"Created a daily journal screen. Called Chronicles","title":"Ship 3 Features Weekly"}]'::jsonb,
  '{"energy_level":null,"lift_completed":null,"pain_notes":null,"top_set_reps":null,"top_set_weight":null,"training_notes":null,"workout_completed":false}'::jsonb,
  '{"ate_out_today":true,"estimated_food_spend":37.89,"meals_completed":3,"meals_planned_today":3,"notes":null}'::jsonb,
  '{"category":"Food","money_spent_today":37.89,"notes":null,"spending_status":"WATCH","unexpected_expense":false}'::jsonb,
  '{"category":"App Build","win":"Created a daily journal screen called Chronicles. Built the Forge and added two projects to it. "}'::jsonb,
  '{"adjust_tomorrow":"I need to get out of bed sooner. I woke up earlier today. I need to define some goals early and learn to relax after I meet them. ","did_not_work":"I didnt stay within my calorie and fat goals. Tomorrow i need to ensure to get my macros. That means eating sooner so I dont eat junk.","worked":"Today was awesome. I had a lot of momentum and continued upon yesterday''s success. "}'::jsonb,
  '{"calendar":["Clear the morning","Keep the calendar clean","Protect the first hour"],"meal_prep":"You have no events scheduled for tomorrow.","priorities":["Prepare for bench"],"reminder":"Next protocol: bench","shopping_items":[],"top_priorities":["Prepare for bench"],"workout":{"label":"bench","lift":"bench","weekday":"Thursday"}}'::jsonb,
  null, 'json_import', null,
  '2026-07-01T19:31:29.657221-04:00'::timestamptz,
  '2026-07-01T19:31:29.657221-04:00'::timestamptz
)
on conflict (user_id, date) do update set
  overall_status = excluded.overall_status,
  mission_score = excluded.mission_score,
  daily_score = excluded.daily_score,
  weekly_score = excluded.weekly_score,
  lifetime_score = excluded.lifetime_score,
  lifetime_rank = excluded.lifetime_rank,
  is_finalized = excluded.is_finalized,
  completed_at = excluded.completed_at,
  summary = excluded.summary,
  objectives = excluded.objectives,
  training = excluded.training,
  nutrition = excluded.nutrition,
  finance = excluded.finance,
  victory = excluded.victory,
  lessons = excluded.lessons,
  tomorrow = excluded.tomorrow,
  notes = excluded.notes,
  source = excluded.source,
  raw_payload = excluded.raw_payload,
  updated_at = excluded.updated_at;

delete from public.daily_debrief_objectives
where debrief_id in (
  select id
  from public.daily_debrief_entries
  where user_id = 'john'
    and date in ('2026-06-08'::date, '2026-06-29'::date, '2026-06-30'::date, '2026-07-01'::date)
);

insert into public.daily_debrief_objectives (
  debrief_id,
  user_id,
  date,
  goal_id,
  title,
  completed,
  notes,
  blocker,
  sort_order,
  raw_payload
)
select
  entry.id,
  entry.user_id,
  entry.date,
  objective.value->>'id',
  coalesce(objective.value->>'title', 'Untitled objective'),
  coalesce((objective.value->>'completed')::boolean, false),
  objective.value->>'notes',
  objective.value->>'blocker',
  objective.ordinality::integer - 1,
  objective.value
from public.daily_debrief_entries entry
cross join lateral jsonb_array_elements(entry.objectives) with ordinality as objective(value, ordinality)
where entry.user_id = 'john'
  and entry.date in ('2026-06-08'::date, '2026-06-29'::date, '2026-06-30'::date, '2026-07-01'::date)
on conflict (debrief_id, sort_order) do update set
  goal_id = excluded.goal_id,
  title = excluded.title,
  completed = excluded.completed,
  notes = excluded.notes,
  blocker = excluded.blocker,
  raw_payload = excluded.raw_payload,
  updated_at = now();

create or replace view public.daily_debrief_journal_snapshot as
select
  id,
  user_id,
  date,
  is_finalized,
  completed_at,
  daily_score,
  weekly_score,
  lifetime_score,
  lifetime_rank,
  overall_status,
  victory->>'win' as victory_log,
  victory->>'category' as victory_category,
  lessons->>'worked' as lessons_worked,
  lessons->>'did_not_work' as lessons_did_not_work,
  lessons->>'adjust_tomorrow' as lessons_adjust_tomorrow,
  training->>'lift_completed' as lift_completed,
  (training->>'workout_completed')::boolean as workout_completed,
  nutrition->>'meals_planned_today' as meals_planned_today,
  nutrition->>'meals_completed' as meals_completed,
  finance->>'money_spent_today' as money_spent_today,
  finance->>'spending_status' as spending_status,
  summary,
  created_at,
  updated_at
from public.daily_debrief_entries;
