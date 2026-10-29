-- 새 Supabase 프로젝트의 SQL Editor에서 전체를 한 번 실행해.
-- 개발 초기에 실수로 다시 실행해도 데이터 삭제는 하지 않으며, 기존 동일 테이블은 오류가 발생해.
begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default '#647a55' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  due_date date,
  due_time time without time zone,
  completed_at timestamptz,
  position_x double precision not null default 80 check (position_x between -1000000 and 1000000),
  position_y double precision not null default 80 check (position_y between -1000000 and 1000000),
  created_at timestamptz not null default now(),
  unique (id, project_id),
  check (due_time is null or due_date is not null)
);

create table public.task_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null,
  target_id uuid not null,
  foreign key (source_id, project_id) references public.tasks(id, project_id) on delete cascade,
  foreign key (target_id, project_id) references public.tasks(id, project_id) on delete cascade,
  unique (project_id, source_id, target_id),
  check (source_id <> target_id)
);

create index projects_owner_idx on public.projects(owner_id);
create index tasks_project_idx on public.tasks(project_id);
create index task_links_project_idx on public.task_links(project_id);
create index task_links_source_idx on public.task_links(source_id, project_id);
create index task_links_target_idx on public.task_links(target_id, project_id);

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_links enable row level security;

revoke all on table public.projects, public.tasks, public.task_links from anon;
revoke all on table public.projects, public.tasks, public.task_links from authenticated;
grant select, insert, update, delete on public.projects, public.tasks, public.task_links to authenticated;

create policy "owners_manage_projects" on public.projects
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "owners_manage_tasks" on public.tasks
for all to authenticated
using (exists (select 1 from public.projects p where p.id = tasks.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = tasks.project_id and p.owner_id = (select auth.uid())));

create policy "owners_manage_links" on public.task_links
for all to authenticated
using (exists (select 1 from public.projects p where p.id = task_links.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = task_links.project_id and p.owner_id = (select auth.uid())));

commit;
