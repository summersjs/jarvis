-- World Walker Forge task and milestone workspace support.
-- Copy/paste into Supabase SQL editor.

alter table public.forge_projects
add column if not exists cover_image_url text null;

create table if not exists public.forge_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid not null references public.forge_projects(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default 'Backlog',
  priority text null,
  due_date date null,
  milestone_group text null,
  sort_order integer not null default 0,
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.forge_tasks
add column if not exists milestone_group text null;

alter table public.forge_tasks
add column if not exists sort_order integer not null default 0;

alter table public.forge_tasks
add column if not exists completed_at timestamptz null;

alter table public.forge_tasks
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists forge_tasks_user_id_idx on public.forge_tasks(user_id);
create index if not exists forge_tasks_project_id_idx on public.forge_tasks(project_id);
create index if not exists forge_tasks_status_idx on public.forge_tasks(status);
create index if not exists forge_tasks_milestone_group_idx on public.forge_tasks(milestone_group);
create unique index if not exists forge_tasks_project_title_unique_idx
on public.forge_tasks(project_id, title);

with world_walker as (
  select id
  from public.forge_projects
  where user_id = 'john'
    and lower(title) = 'world walker'
  limit 1
),
seed(title, milestone_group, status, sort_order, completed_at, priority, metadata) as (
  values
  ('Create World Walker project', 'Completed Foundation', 'Done', 1, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Write project summary', 'Completed Foundation', 'Done', 2, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Create Lucien character sheet', 'Completed Foundation', 'Done', 3, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Create Aldric character sheet', 'Completed Foundation', 'Done', 4, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Create Liora character sheet', 'Completed Foundation', 'Done', 5, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Create Lucien vs Aldric key art', 'Completed Foundation', 'Done', 6, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Define Lucien core concept', 'Completed Foundation', 'Done', 7, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Define Aldric core concept', 'Completed Foundation', 'Done', 8, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Define Liora core concept', 'Completed Foundation', 'Done', 9, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Create initial GDD outline', 'Milestone 1 - Foundation', 'Done', 10, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Outline the two-act story structure', 'Milestone 3 - Story', 'Done', 11, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Design the class system', 'Milestone 1 - Foundation', 'Done', 12, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Design the guild placement concept', 'Milestone 4 - Gameplay', 'Done', 13, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Design the Warrior class branches', 'Milestone 1 - Foundation', 'Done', 14, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Define the FF world structure', 'Milestone 3 - Story', 'Done', 15, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Design the artifact progression', 'Milestone 4 - Gameplay', 'Done', 16, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),
  ('Create opening cinematic concept', 'Milestone 3 - Story', 'Done', 17, '2026-07-01T12:00:00+00:00'::timestamptz, null, '{"source":"initial_completed_list"}'::jsonb),

  ('Finalize GDD v1', 'Milestone 1 - Foundation', 'Backlog', 18, null, 'High', '{"pinned":true}'::jsonb),
  ('Finalize class tree', 'Milestone 1 - Foundation', 'Backlog', 19, null, 'High', '{}'::jsonb),
  ('Name every kingdom', 'Milestone 1 - Foundation', 'Backlog', 20, null, null, '{}'::jsonb),
  ('Design Ashmoor Village', 'Milestone 1 - Foundation', 'Backlog', 21, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Create world map', 'Milestone 1 - Foundation', 'Backlog', 22, null, null, '{}'::jsonb),

  ('Finish Lucien', 'Milestone 2 - Characters', 'Backlog', 23, null, 'High', '{}'::jsonb),
  ('Finish Aldric', 'Milestone 2 - Characters', 'Backlog', 24, null, 'High', '{}'::jsonb),
  ('Finish Liora', 'Milestone 2 - Characters', 'Backlog', 25, null, 'High', '{}'::jsonb),
  ('Design Lucien father', 'Milestone 2 - Characters', 'Backlog', 26, null, null, '{}'::jsonb),
  ('Design scientist', 'Milestone 2 - Characters', 'Backlog', 27, null, null, '{}'::jsonb),
  ('Design The Witness', 'Milestone 2 - Characters', 'Backlog', 28, null, null, '{}'::jsonb),
  ('Design Warrior Guild Master', 'Characters', 'Backlog', 29, null, null, '{}'::jsonb),
  ('Design Mage Guild Master', 'Characters', 'Backlog', 30, null, null, '{}'::jsonb),
  ('Design Rogue Guild Master', 'Characters', 'Backlog', 31, null, null, '{}'::jsonb),
  ('Design first village elder', 'Characters', 'Backlog', 32, null, null, '{}'::jsonb),
  ('Design Ashmoor blacksmith', 'Characters', 'Backlog', 33, null, null, '{}'::jsonb),
  ('Design Ashmoor merchant', 'Characters', 'Backlog', 34, null, null, '{}'::jsonb),
  ('Design childhood friend', 'Characters', 'Backlog', 35, null, null, '{}'::jsonb),
  ('Design first rival', 'Characters', 'Backlog', 36, null, null, '{}'::jsonb),
  ('Design first boss', 'Characters', 'Backlog', 37, null, null, '{}'::jsonb),

  ('Finish Act 1', 'Milestone 3 - Story', 'Backlog', 38, null, 'High', '{}'::jsonb),
  ('Finish betrayal', 'Milestone 3 - Story', 'Backlog', 39, null, 'High', '{}'::jsonb),
  ('Finish coma sequence', 'Milestone 3 - Story', 'Backlog', 40, null, 'High', '{}'::jsonb),
  ('Finish Nexus', 'Milestone 3 - Story', 'Backlog', 41, null, 'High', '{}'::jsonb),
  ('Outline every FF visit', 'Milestone 3 - Story', 'Backlog', 42, null, 'High', '{}'::jsonb),
  ('Write opening cinematic screenplay', 'Story', 'Backlog', 43, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Write Ashmoor Village introduction', 'Story', 'Backlog', 44, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Write Lucien first mission', 'Story', 'Backlog', 45, null, null, '{}'::jsonb),
  ('Write Lucien and Aldric training scene', 'Story', 'Backlog', 46, null, null, '{"vertical_slice":true}'::jsonb),
  ('Write campfire conversation', 'Story', 'Backlog', 47, null, 'High', '{"estimated_minutes":45,"vertical_slice":true}'::jsonb),
  ('Write Liora recurring dialogue', 'Story', 'Backlog', 48, null, null, '{}'::jsonb),
  ('Write placement exam sequence', 'Story', 'Backlog', 49, null, null, '{}'::jsonb),
  ('Write guild master introductions', 'Story', 'Backlog', 50, null, null, '{}'::jsonb),
  ('Write graduation ceremony', 'Story', 'Backlog', 51, null, null, '{}'::jsonb),
  ('Write betrayal scene', 'Story', 'Backlog', 52, null, 'High', '{}'::jsonb),
  ('Write coma transition', 'Story', 'Backlog', 53, null, null, '{}'::jsonb),
  ('Write Nexus introduction', 'Story', 'Backlog', 54, null, null, '{}'::jsonb),
  ('Write final confrontation', 'Story', 'Backlog', 55, null, null, '{}'::jsonb),
  ('Write ending cinematic', 'Story', 'Backlog', 56, null, null, '{}'::jsonb),
  ('Write post-credit scene', 'Story', 'Backlog', 57, null, null, '{}'::jsonb),

  ('Placement Trial', 'Milestone 4 - Gameplay', 'Backlog', 58, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Guild progression', 'Milestone 4 - Gameplay', 'Backlog', 59, null, null, '{}'::jsonb),
  ('Turn-based combat', 'Milestone 4 - Gameplay', 'Backlog', 60, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Limit Break system', 'Milestone 4 - Gameplay', 'Backlog', 61, null, 'High', '{}'::jsonb),
  ('Artifact system', 'Milestone 4 - Gameplay', 'Backlog', 62, null, 'High', '{}'::jsonb),
  ('Prototype turn-based combat', 'Combat', 'Backlog', 63, null, 'High', '{}'::jsonb),
  ('Create Warrior abilities', 'Combat', 'Backlog', 64, null, null, '{}'::jsonb),
  ('Create Rogue abilities', 'Combat', 'Backlog', 65, null, null, '{}'::jsonb),
  ('Create Mage abilities', 'Combat', 'Backlog', 66, null, null, '{}'::jsonb),
  ('Create Sentinel abilities', 'Combat', 'Backlog', 67, null, null, '{}'::jsonb),
  ('Create Ravager abilities', 'Combat', 'Backlog', 68, null, null, '{}'::jsonb),
  ('Create summon system', 'Combat', 'Backlog', 69, null, null, '{}'::jsonb),
  ('Create status effects', 'Combat', 'Backlog', 70, null, null, '{}'::jsonb),
  ('Design enemy weaknesses', 'Combat', 'Backlog', 71, null, null, '{}'::jsonb),
  ('Design boss mechanics', 'Combat', 'Backlog', 72, null, null, '{}'::jsonb),

  ('Opening cinematic', 'Milestone 5 - Vertical Slice', 'Backlog', 73, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Ashmoor Village', 'Milestone 5 - Vertical Slice', 'Backlog', 74, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Lucien and Aldric', 'Milestone 5 - Vertical Slice', 'Backlog', 75, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('First dungeon', 'Milestone 5 - Vertical Slice', 'Backlog', 76, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Guild Placement Trial', 'Milestone 5 - Vertical Slice', 'Backlog', 77, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Campfire scene', 'Milestone 5 - Vertical Slice', 'Backlog', 78, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Return to village', 'Milestone 5 - Vertical Slice', 'Backlog', 79, null, 'High', '{"vertical_slice":true}'::jsonb),
  ('Vertical Slice Complete', 'Milestones', 'Backlog', 80, null, 'High', '{}'::jsonb),
  ('Act 1 Complete', 'Milestones', 'Backlog', 81, null, null, '{}'::jsonb),
  ('Nexus Prototype Complete', 'Milestones', 'Backlog', 82, null, null, '{}'::jsonb),
  ('Combat System Complete', 'Milestones', 'Backlog', 83, null, null, '{}'::jsonb),
  ('First Boss Playable', 'Milestones', 'Backlog', 84, null, null, '{}'::jsonb),
  ('Guild System Complete', 'Milestones', 'Backlog', 85, null, null, '{}'::jsonb),
  ('FFVII Prototype Complete', 'Milestones', 'Backlog', 86, null, null, '{}'::jsonb),
  ('FFVIII Prototype Complete', 'Milestones', 'Backlog', 87, null, null, '{}'::jsonb),
  ('FFIX Prototype Complete', 'Milestones', 'Backlog', 88, null, null, '{}'::jsonb),
  ('Alpha Build', 'Milestones', 'Backlog', 89, null, null, '{}'::jsonb),
  ('Beta Build', 'Milestones', 'Backlog', 90, null, null, '{}'::jsonb),
  ('Version 1.0', 'Milestones', 'Backlog', 91, null, null, '{}'::jsonb),

  ('Create world map illustration', 'Art', 'Backlog', 92, null, null, '{}'::jsonb),
  ('Create Lucien realistic concept', 'Art', 'Backlog', 93, null, null, '{}'::jsonb),
  ('Create Aldric realistic concept', 'Art', 'Backlog', 94, null, null, '{}'::jsonb),
  ('Create Liora realistic concept', 'Art', 'Backlog', 95, null, null, '{}'::jsonb),
  ('Create Ashmoor concept art', 'Art', 'Backlog', 96, null, null, '{}'::jsonb),
  ('Create Nexus concept art', 'Art', 'Backlog', 97, null, null, '{}'::jsonb),
  ('Create logo', 'Art', 'Backlog', 98, null, null, '{}'::jsonb),
  ('Opening theme', 'Audio', 'Backlog', 99, null, null, '{}'::jsonb),
  ('Battle theme', 'Audio', 'Backlog', 100, null, null, '{}'::jsonb),
  ('Aldric theme', 'Audio', 'Backlog', 101, null, null, '{}'::jsonb),
  ('Create Unity project', 'Development', 'Backlog', 102, null, 'High', '{}'::jsonb),
  ('Build dialogue system', 'Development', 'Backlog', 103, null, null, '{}'::jsonb),
  ('Build quest system', 'Development', 'Backlog', 104, null, null, '{}'::jsonb),
  ('Build inventory system', 'Development', 'Backlog', 105, null, null, '{}'::jsonb),
  ('Build save/load system', 'Development', 'Backlog', 106, null, null, '{}'::jsonb),
  ('Build battle prototype', 'Development', 'Backlog', 107, null, 'High', '{}'::jsonb),
  ('Build first playable demo', 'Development', 'Backlog', 108, null, 'High', '{}'::jsonb)
)
insert into public.forge_tasks (
  user_id,
  project_id,
  title,
  milestone_group,
  status,
  sort_order,
  completed_at,
  priority,
  metadata
)
select
  'john',
  world_walker.id,
  seed.title,
  seed.milestone_group,
  seed.status,
  seed.sort_order,
  seed.completed_at,
  seed.priority,
  seed.metadata
from world_walker
cross join seed
on conflict (project_id, title) do update
set
  milestone_group = excluded.milestone_group,
  sort_order = excluded.sort_order,
  metadata = public.forge_tasks.metadata || excluded.metadata;
