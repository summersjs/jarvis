-- Forge Canon Board / Lore Ledger
-- Copy/paste this into Supabase SQL editor.

create table if not exists public.forge_note_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  project_id uuid not null references public.forge_projects(id) on delete cascade,
  note_id uuid null references public.forge_notes(id) on delete set null,
  entry_type text not null,
  title text null,
  body text not null,
  tags text[] not null default '{}',
  folder text null,
  subfolder text null,
  linked_task_id uuid null references public.forge_tasks(id) on delete set null,
  linked_milestone text null,
  is_pinned boolean not null default false,
  status text not null default 'active',
  resolved boolean not null default false,
  resolution_text text null,
  resolved_into_entry_id uuid null references public.forge_note_ledger_entries(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_note_ledger_entries_type_check
    check (entry_type in ('canon', 'decision', 'question', 'draft', 'idea', 'reference')),
  constraint forge_note_ledger_entries_status_check
    check (status in ('active', 'archived'))
);

create index if not exists forge_note_ledger_entries_user_id_idx
  on public.forge_note_ledger_entries(user_id);

create index if not exists forge_note_ledger_entries_project_id_idx
  on public.forge_note_ledger_entries(project_id);

create index if not exists forge_note_ledger_entries_note_id_idx
  on public.forge_note_ledger_entries(note_id);

create index if not exists forge_note_ledger_entries_entry_type_idx
  on public.forge_note_ledger_entries(entry_type);

create index if not exists forge_note_ledger_entries_status_idx
  on public.forge_note_ledger_entries(status);

create index if not exists forge_note_ledger_entries_tags_idx
  on public.forge_note_ledger_entries using gin(tags);

create unique index if not exists forge_note_ledger_entries_project_title_body_idx
  on public.forge_note_ledger_entries(project_id, lower(coalesce(title, '')), lower(body));

create or replace function public.touch_forge_note_ledger_entries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_forge_note_ledger_entries_updated_at on public.forge_note_ledger_entries;
create trigger touch_forge_note_ledger_entries_updated_at
before update on public.forge_note_ledger_entries
for each row execute function public.touch_forge_note_ledger_entries_updated_at();

with world_walker as (
  select id, user_id
  from public.forge_projects
  where lower(title) = 'world walker'
  limit 1
),
seed(entry_type, title, body, tags, folder, subfolder, is_pinned) as (
  values
    ('canon', 'Lucien Vale', 'Lucien Vale is the protagonist.', array['lucien','protagonist','world-walker'], 'Characters', 'Lucien', true),
    ('canon', 'Unclassified Worldwalker', 'Lucien cannot be properly classified within the world''s job system.', array['lucien','class-system','worldwalking'], 'Characters', 'Lucien', true),
    ('canon', 'Aldric Aegis Knight', 'Aldric is the only known Aegis Knight.', array['aldric','aegis-knight','character'], 'Characters', 'Aldric', true),
    ('canon', 'Liora White Mage', 'Liora is Lucien''s mother and a retired White Mage.', array['liora','white-mage','character'], 'Characters', 'Liora', true),
    ('canon', 'Liora Farewell Line', 'Liora’s recurring farewell line is "Come home to me."', array['liora','dialogue','canon'], 'Characters', 'Liora', true),
    ('canon', 'The Witness', 'The Witness exists outside every world and is never fully explained.', array['the-witness','lore','mystery'], 'Characters', 'The Witness', true),
    ('decision', 'Engine Direction', 'World Walker will be built in Unreal Engine.', array['unreal','development','decision'], 'Development', null, true),
    ('decision', 'Character Pipeline', 'Main characters will use Character Creator.', array['art','characters','decision'], 'Art Direction', null, true),
    ('decision', 'Cinematic Pipeline', 'Cinematic story moments will use Unreal cinematic sequences.', array['unreal','story','cinematics'], 'Story', null, true),
    ('decision', 'Visual Target', 'The overworld visual target is stylized storybook JRPG / Ni no Kuni-inspired fantasy.', array['visual-style','art-direction','jrpg'], 'Art Direction', null, true),
    ('decision', 'Game One Scope', 'Game One scope should stay limited to one continent, Ashmoor, two other towns max, and a few major dungeons/trials.', array['mvp','scope','ashmoor'], 'Story', null, true),
    ('question', 'Cloud Consequences', 'What are the consequences of taking Cloud out of his world?', array['world-visits','ff7','question'], 'Story', 'World Visits', false),
    ('question', 'Hybrid Classes', 'What hybrid classes exist besides Red Mage and Paladin?', array['hybrid-classes','class-system','question'], 'Gameplay', 'Class System', false),
    ('question', 'Unstable Ability Pool', 'How does Lucien''s unstable ability pool calculate each turn?', array['lucien','combat','question'], 'Gameplay', null, false),
    ('question', 'Game One Town Count', 'How many towns should be available in Game One?', array['mvp','world-building','question'], 'Story', null, false),
    ('question', 'Memory Wipe', 'How does the memory wipe work after the dream/coma arc?', array['story','nexus','question'], 'Story', null, false),
    ('draft', 'Changing Command Menu', 'During the Placement Trial, Lucien''s command menu may change each turn.', array['placement-trial','combat','draft'], 'Gameplay', 'Placement Trial', false),
    ('draft', 'Guild Master Claims', 'Guild masters may claim Lucien based on observed player actions.', array['guild-system','placement-trial','draft'], 'Gameplay', 'Guild System', false),
    ('draft', 'Hybrid Class Controversy', 'Hybrid classes are rare and controversial because of class purism and jealousy.', array['hybrid-classes','class-system','draft'], 'Gameplay', 'Class System', false),
    ('draft', 'Aldric Power Fantasy', 'Aldric''s presence should make the player feel protected and almost overpowered.', array['aldric','story','draft'], 'Characters', 'Aldric', false),
    ('draft', 'Lucien Early Arc', 'Lucien should be weak or unreliable early, then become dangerous as he gains control.', array['lucien','progression','draft'], 'Characters', 'Lucien', false)
)
insert into public.forge_note_ledger_entries (
  user_id, project_id, entry_type, title, body, tags, folder, subfolder, is_pinned
)
select
  coalesce(world_walker.user_id, 'john'),
  world_walker.id,
  seed.entry_type,
  seed.title,
  seed.body,
  seed.tags,
  seed.folder,
  seed.subfolder,
  seed.is_pinned
from world_walker
cross join seed
on conflict do nothing;
