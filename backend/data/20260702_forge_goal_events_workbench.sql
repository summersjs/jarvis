-- Forge + Goals workbench hardening
-- Copy/paste into Supabase SQL editor.
-- Additive only: preserves existing goal_logs, forge projects, notes, tasks, and files.

create table if not exists public.goal_progress_events (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  amount numeric not null default 1,
  unit text null,
  note text null,
  source_type text not null default 'manual',
  source_id uuid null,
  source_project_id uuid null references public.forge_projects(id) on delete set null,
  counts_toward_goal boolean not null default true,
  event_source text not null default 'manual',
  created_by text null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists goal_progress_events_goal_id_idx
  on public.goal_progress_events(goal_id, created_at desc);

create index if not exists goal_progress_events_source_idx
  on public.goal_progress_events(source_type, source_id);

create index if not exists goal_progress_events_project_idx
  on public.goal_progress_events(source_project_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'goal_progress_events_source_type_check'
  ) then
    alter table public.goal_progress_events
      add constraint goal_progress_events_source_type_check
      check (source_type in ('manual', 'forge_task', 'forge_session', 'forge_note', 'forge_asset', 'jarvis_feature', 'habit', 'workout', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'goal_progress_events_event_source_check'
  ) then
    alter table public.goal_progress_events
      add constraint goal_progress_events_event_source_check
      check (event_source in ('automatic', 'manual', 'confirmed'));
  end if;
end $$;

alter table public.forge_tasks
  add column if not exists task_type text not null default 'task',
  add column if not exists linked_goal_id uuid null references public.goals(id) on delete set null,
  add column if not exists counts_toward_goal boolean not null default true,
  add column if not exists goal_event_id uuid null references public.goal_progress_events(id) on delete set null;

alter table public.forge_notes
  add column if not exists note_type text null,
  add column if not exists status text not null default 'active',
  add column if not exists is_pinned boolean not null default false,
  add column if not exists linked_milestone text null,
  add column if not exists linked_tasks text[] not null default '{}',
  add column if not exists sort_order integer null;

create index if not exists forge_tasks_type_idx on public.forge_tasks(task_type);
create index if not exists forge_tasks_linked_goal_idx on public.forge_tasks(linked_goal_id);
create index if not exists forge_notes_project_type_idx on public.forge_notes(project_id, note_type);
create index if not exists forge_notes_pinned_idx on public.forge_notes(project_id, is_pinned);

update public.goals
set
  title = 'Make 3 World Walker Updates Weekly',
  description = 'Complete 3 meaningful Forge actions for World Walker every week. Tasks, canon notes, finished work sessions, and usable asset uploads can count.',
  unit = 'update',
  target_value = 3,
  metadata = coalesce(metadata, '{}'::jsonb) || '{"forge_goal_type":"meaningful_update","source_project_title":"World Walker"}'::jsonb
where lower(title) = 'complete 3 world walker tasks weekly';

update public.goals
set
  title = 'Ship 3 Jarvis Improvements Weekly',
  description = 'Complete 3 meaningful Jarvis improvements every week. Features, fixes, UI improvements, database updates, and completed build sessions can count.',
  unit = 'improvement',
  target_value = 3,
  metadata = coalesce(metadata, '{}'::jsonb) || '{"forge_goal_type":"jarvis_improvement","meaningful_updates":true}'::jsonb
where lower(title) = 'ship 3 features weekly';

with world_walker as (
  select id from public.forge_projects
  where user_id = 'john' and lower(title) = 'world walker'
  limit 1
),
world_walker_goal as (
  select id from public.goals
  where user_id = 'john'
    and lower(title) in ('make 3 world walker updates weekly', 'complete 3 world walker tasks weekly')
  order by created_at desc
  limit 1
)
update public.forge_tasks task
set
  task_type = case
    when task.title in (
      'Vertical Slice Complete', 'Act 1 Complete', 'Nexus Prototype Complete', 'Combat System Complete',
      'First Boss Playable', 'Guild System Complete', 'FFVII Prototype Complete', 'FFVIII Prototype Complete',
      'FFIX Prototype Complete', 'Alpha Build', 'Beta Build', 'Version 1.0'
    ) then 'project_gate'
    when task.title in (
      'Name every kingdom', 'Create logo', 'Opening theme', 'Battle theme', 'Aldric theme',
      'Design Ashmoor merchant', 'Design Ashmoor blacksmith', 'Design first village elder',
      'Write Liora recurring dialogue', 'Write post-credit scene'
    ) then 'quick_win'
    else coalesce(nullif(task.task_type, ''), 'task')
  end,
  priority = case
    when task.title in (
      'Finalize class tree', 'Design Ashmoor Village', 'Finish Lucien', 'Finish Aldric', 'Finish Liora',
      'Finish Act 1', 'Finish betrayal', 'Finish coma sequence', 'Finish Nexus', 'Outline every FF visit',
      'Write opening cinematic screenplay', 'Write campfire conversation', 'Write betrayal scene',
      'Placement Trial', 'Turn-based combat', 'Limit Break system', 'Artifact system',
      'Prototype turn-based combat', 'Create Unity project', 'Build battle prototype', 'Build first playable demo'
    ) then 'High'
    else task.priority
  end,
  linked_goal_id = coalesce(task.linked_goal_id, (select id from world_walker_goal)),
  metadata = coalesce(task.metadata, '{}'::jsonb)
    || case
      when task.title in (
        'Finalize class tree', 'Design Ashmoor Village', 'Create world map', 'Finish Lucien', 'Finish Aldric', 'Finish Liora',
        'Write opening cinematic screenplay', 'Write Ashmoor Village introduction', 'Write Lucien and Aldric training scene',
        'Write placement exam sequence', 'Write betrayal scene', 'Placement Trial', 'Turn-based combat',
        'Limit Break system', 'Artifact system', 'Prototype turn-based combat', 'Opening cinematic', 'Ashmoor Village',
        'Lucien and Aldric', 'First dungeon', 'Guild Placement Trial', 'Campfire scene', 'Return to village',
        'Create Unity project', 'Build dialogue system', 'Build battle prototype', 'Build first playable demo'
      )
      then '{"mvp":true,"vertical_slice":true}'::jsonb
      else '{}'::jsonb
    end
where task.project_id = (select id from world_walker);

with world_walker as (
  select id from public.forge_projects
  where user_id = 'john' and lower(title) = 'world walker'
  limit 1
),
updates(title, note_type, status, tags, is_pinned) as (
  values
  ('Game Design Document v1.0', 'gdd_section', 'active', array['gdd','project-bible','overview','world-walker','mvp','design-pillars'], true),
  ('Core Vision', 'canon', 'active', array['core-vision','world-walker','lucien','legacy','identity','family','final-fantasy-inspired'], true),
  ('Lucien Overview', 'canon', 'active', array['lucien','protagonist','anomaly','class-system','worldwalker','character'], true),
  ('Aldric Character Notes', 'canon', 'active', array['aldric','aegis-knight','betrayal','adoptive-father','tragic-villain','character'], true),
  ('Liora Character Notes', 'canon', 'active', array['liora','white-mage','mother','emotional-anchor','come-home-to-me','character'], true),
  ('Act Structure', 'draft', 'active', array['act-structure','story','act-1','act-2','betrayal','nexus','worldwalking'], false),
  ('Guild System', 'canon', 'active', array['guild-system','placement-trial','class-system','ashmoor','progression'], true),
  ('Class Tree', 'draft', 'active', array['class-tree','warrior','mage','rogue','sentinel','ravager','combat','progression'], true),
  ('Final Fantasy World Visits', 'draft', 'active', array['world-visits','ff7','ff8','ff9','nostalgia','story-preservation','worldwalking'], false),
  ('Artifacts', 'draft', 'active', array['artifacts','progression','limit-break','buster-shard','shivas-tear','trance-ember'], false),
  ('The Witness', 'question', 'active', array['the-witness','mystery','summon','god','memory','lore'], false),
  ('Opening Cinematic', 'draft', 'active', array['opening-cinematic','liora','biological-father','summon','storm','screenplay'], false)
)
update public.forge_notes note
set
  note_type = updates.note_type,
  status = updates.status,
  tags = updates.tags,
  is_pinned = updates.is_pinned
from updates
where note.project_id = (select id from world_walker)
  and lower(note.title) = lower(updates.title);
