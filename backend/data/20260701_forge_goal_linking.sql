-- Jarvis Forge + Goals linking
-- Copy/paste into Supabase SQL editor after the Forge V1 migration.

alter table public.forge_projects
add column if not exists goal_id uuid references public.goals(id) on delete set null;

create index if not exists forge_projects_goal_id_idx
on public.forge_projects(goal_id);

-- Keep the existing Forge project table as the project shell.
-- Linked project progress and milestones should read from goal_milestones.

with workstation_goal as (
  select *
  from public.goals
  where user_id = 'john'
    and lower(title) = lower('Build the Jarvis Workstation')
  order by created_at desc
  limit 1
),
milestone_snapshot as (
  select
    wg.id as goal_id,
    count(gm.id) as total_count,
    count(gm.id) filter (
      where lower(coalesce(gm.status, '')) in ('complete', 'completed', 'purchased', 'already acquired', 'already_acquired')
    ) as completed_count
  from workstation_goal wg
  left join public.goal_milestones gm on gm.goal_id = wg.id
  group by wg.id
),
next_milestone as (
  select distinct on (gm.goal_id)
    gm.goal_id,
    gm.title
  from public.goal_milestones gm
  join workstation_goal wg on wg.id = gm.goal_id
  where lower(coalesce(gm.status, '')) not in ('complete', 'completed', 'purchased', 'already acquired', 'already_acquired')
  order by gm.goal_id, gm.sort_order asc, gm.created_at asc
),
upsert_project as (
  insert into public.forge_projects (
    user_id,
    goal_id,
    title,
    category,
    status,
    summary,
    tags,
    next_milestone,
    progress_percent,
    project_type
  )
  select
    'john',
    wg.id,
    'Build the Jarvis Workstation',
    'Hardware',
    'Active',
    'Investing consistently turns Jarvis from an idea into a permanent tool. One component at a time builds the command center.',
    array['jarvis', 'hardware', 'workstation', 'command-center', 'build'],
    coalesce(nm.title, 'Storage'),
    case
      when ms.total_count > 0 then round((ms.completed_count::numeric / ms.total_count::numeric) * 100, 1)
      else 0
    end,
    'Hardware Build / Jarvis System Build'
  from workstation_goal wg
  left join milestone_snapshot ms on ms.goal_id = wg.id
  left join next_milestone nm on nm.goal_id = wg.id
  where not exists (
    select 1
    from public.forge_projects fp
    where fp.user_id = 'john'
      and (fp.goal_id = wg.id or lower(fp.title) = lower('Build the Jarvis Workstation'))
  )
  returning id
)
update public.forge_projects fp
set
  goal_id = wg.id,
  category = 'Hardware',
  status = 'Active',
  summary = coalesce(fp.summary, 'Investing consistently turns Jarvis from an idea into a permanent tool. One component at a time builds the command center.'),
  tags = case when fp.tags = '{}'::text[] then array['jarvis', 'hardware', 'workstation', 'command-center', 'build'] else fp.tags end,
  next_milestone = coalesce(nm.title, fp.next_milestone, 'Storage'),
  progress_percent = case
    when ms.total_count > 0 then round((ms.completed_count::numeric / ms.total_count::numeric) * 100, 1)
    else coalesce(fp.progress_percent, 0)
  end,
  project_type = coalesce(fp.project_type, 'Hardware Build / Jarvis System Build')
from workstation_goal wg
left join milestone_snapshot ms on ms.goal_id = wg.id
left join next_milestone nm on nm.goal_id = wg.id
where fp.user_id = 'john'
  and (fp.goal_id = wg.id or lower(fp.title) = lower('Build the Jarvis Workstation'));
