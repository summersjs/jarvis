-- Jarvis Forge project workspace support
-- Copy/paste into Supabase SQL editor after Forge V1.

alter table public.forge_files
add column if not exists file_path text null;

alter table public.forge_files
add column if not exists mime_type text null;

alter table public.forge_files
add column if not exists size_bytes bigint null;

update public.forge_files
set
  mime_type = coalesce(mime_type, file_type),
  size_bytes = coalesce(size_bytes, file_size)
where mime_type is null
   or size_bytes is null;

create table if not exists public.forge_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid not null references public.forge_projects(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default 'Backlog',
  priority text null,
  due_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_research (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid not null references public.forge_projects(id) on delete cascade,
  title text not null,
  url text null,
  notes text null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_activity (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid null references public.forge_projects(id) on delete cascade,
  type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_tasks_user_id_idx on public.forge_tasks(user_id);
create index if not exists forge_tasks_project_id_idx on public.forge_tasks(project_id);
create index if not exists forge_research_user_id_idx on public.forge_research(user_id);
create index if not exists forge_research_project_id_idx on public.forge_research(project_id);
create index if not exists forge_activity_user_id_idx on public.forge_activity(user_id);
create index if not exists forge_activity_project_id_idx on public.forge_activity(project_id);
create index if not exists forge_activity_created_at_idx on public.forge_activity(created_at desc);

