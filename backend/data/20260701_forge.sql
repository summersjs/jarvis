-- Jarvis Forge V1
-- Copy/paste into Supabase SQL editor.

create table if not exists public.forge_projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  title text not null,
  category text not null,
  status text not null default 'Active',
  summary text null,
  tags text[] not null default '{}',
  next_milestone text null,
  progress_percent numeric null default 0,
  project_type text null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_projects_category_check check (category in ('Games', 'Jarvis', 'Business', 'Hardware', 'Writing', 'Life')),
  constraint forge_projects_status_check check (status in ('Active', 'Building', 'Experiment', 'Incubating', 'Archived', 'Completed')),
  constraint forge_projects_progress_check check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100))
);

create table if not exists public.forge_sparks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  spark_text text not null,
  category text null,
  project_id uuid null references public.forge_projects(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_sparks_category_check check (category is null or category in ('Games', 'Jarvis', 'Business', 'Hardware', 'Writing', 'Life'))
);

create table if not exists public.forge_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  title text not null,
  body text null,
  category text null,
  project_id uuid null references public.forge_projects(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_notes_category_check check (category is null or category in ('Games', 'Jarvis', 'Business', 'Hardware', 'Writing', 'Life'))
);

create table if not exists public.forge_files (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  file_name text not null,
  file_type text null,
  file_size bigint null,
  file_url text null,
  caption text null,
  category text null,
  project_id uuid null references public.forge_projects(id) on delete set null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_files_category_check check (category is null or category in ('Games', 'Jarvis', 'Business', 'Hardware', 'Writing', 'Life'))
);

create index if not exists forge_projects_user_id_idx on public.forge_projects(user_id);
create index if not exists forge_projects_category_idx on public.forge_projects(category);
create index if not exists forge_projects_status_idx on public.forge_projects(status);
create index if not exists forge_projects_updated_at_idx on public.forge_projects(updated_at desc);

create index if not exists forge_sparks_user_id_idx on public.forge_sparks(user_id);
create index if not exists forge_sparks_project_id_idx on public.forge_sparks(project_id);
create index if not exists forge_sparks_created_at_idx on public.forge_sparks(created_at desc);

create index if not exists forge_notes_user_id_idx on public.forge_notes(user_id);
create index if not exists forge_notes_project_id_idx on public.forge_notes(project_id);
create index if not exists forge_notes_updated_at_idx on public.forge_notes(updated_at desc);

create index if not exists forge_files_user_id_idx on public.forge_files(user_id);
create index if not exists forge_files_project_id_idx on public.forge_files(project_id);
create index if not exists forge_files_created_at_idx on public.forge_files(created_at desc);

create or replace function public.set_forge_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists forge_projects_set_updated_at on public.forge_projects;
create trigger forge_projects_set_updated_at
before update on public.forge_projects
for each row execute function public.set_forge_updated_at();

drop trigger if exists forge_sparks_set_updated_at on public.forge_sparks;
create trigger forge_sparks_set_updated_at
before update on public.forge_sparks
for each row execute function public.set_forge_updated_at();

drop trigger if exists forge_notes_set_updated_at on public.forge_notes;
create trigger forge_notes_set_updated_at
before update on public.forge_notes
for each row execute function public.set_forge_updated_at();

drop trigger if exists forge_files_set_updated_at on public.forge_files;
create trigger forge_files_set_updated_at
before update on public.forge_files
for each row execute function public.set_forge_updated_at();
