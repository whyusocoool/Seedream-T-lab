create extension if not exists pgcrypto;

do $$ begin
  create type public.job_type as enum ('ux', 'tester');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  primary key (workspace_id, profile_id)
);

create table if not exists public.profile_jobs (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job public.job_type not null,
  primary key (profile_id, workspace_id, job)
);

create table if not exists public.job_canvases (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job public.job_type not null,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, job)
);

create table if not exists public.shared_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_type text not null check (document_type in ('template','prompt','rules','fit_run','tune_run','review')),
  document_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, document_type, document_key)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.workspace_members where workspace_id = target_workspace and profile_id = auth.uid()
) $$;

create or replace function public.has_workspace_job(target_workspace uuid, target_job public.job_type)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profile_jobs where workspace_id = target_workspace and profile_id = auth.uid() and job = target_job
) $$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profile_jobs enable row level security;
alter table public.job_canvases enable row level security;
alter table public.shared_documents enable row level security;

grant usage on schema public to authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members, public.profile_jobs to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select, insert, update on public.job_canvases, public.shared_documents to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "read member workspaces" on public.workspaces;
create policy "read member workspaces" on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists "read workspace colleagues" on public.workspace_members;
create policy "read workspace colleagues" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
drop policy if exists "read own jobs" on public.profile_jobs;
create policy "read own jobs" on public.profile_jobs for select using (profile_id = auth.uid());
drop policy if exists "job reads canvas" on public.job_canvases;
create policy "job reads canvas" on public.job_canvases for select using (public.has_workspace_job(workspace_id, job));
drop policy if exists "job creates canvas" on public.job_canvases;
create policy "job creates canvas" on public.job_canvases for insert with check (public.has_workspace_job(workspace_id, job));
drop policy if exists "job updates canvas" on public.job_canvases;
create policy "job updates canvas" on public.job_canvases for update using (public.has_workspace_job(workspace_id, job));
drop policy if exists "members read shared documents" on public.shared_documents;
create policy "members read shared documents" on public.shared_documents for select using (public.is_workspace_member(workspace_id));
drop policy if exists "members create shared documents" on public.shared_documents;
create policy "members create shared documents" on public.shared_documents for insert with check (public.is_workspace_member(workspace_id));
drop policy if exists "members update shared documents" on public.shared_documents;
create policy "members update shared documents" on public.shared_documents for update using (public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-images','workspace-images',false,20971520,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false;

drop policy if exists "job reads images" on storage.objects;
create policy "job reads images" on storage.objects for select to authenticated
using (bucket_id = 'workspace-images' and public.has_workspace_job((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::public.job_type));
drop policy if exists "job uploads images" on storage.objects;
create policy "job uploads images" on storage.objects for insert to authenticated
with check (bucket_id = 'workspace-images' and public.has_workspace_job((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::public.job_type));

insert into public.workspaces(id,name)
values('00000000-0000-4000-8000-000000000001','Seedream 团队')
on conflict(id) do nothing;

create or replace function public.join_seedream_workspace(selected_job public.job_type)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.workspace_members(workspace_id,profile_id)
  values('00000000-0000-4000-8000-000000000001',auth.uid()) on conflict do nothing;
  insert into public.profile_jobs(workspace_id,profile_id,job)
  values('00000000-0000-4000-8000-000000000001',auth.uid(),selected_job) on conflict do nothing;
end $$;
grant execute on function public.join_seedream_workspace(public.job_type) to authenticated;

create or replace function public.search_workspace_colleagues(target_workspace uuid, search_term text)
returns table(id uuid, display_name text, email text, avatar_url text, jobs public.job_type[])
language sql stable security definer set search_path=public,auth
as $$
  select p.id,p.display_name,u.email,p.avatar_url,
    coalesce(array_agg(distinct pj.job) filter(where pj.job is not null),array[]::public.job_type[])
  from public.profiles p
  join auth.users u on u.id=p.id
  join public.workspace_members wm on wm.profile_id=p.id and wm.workspace_id=target_workspace
  left join public.profile_jobs pj on pj.profile_id=p.id and pj.workspace_id=target_workspace
  where public.is_workspace_member(target_workspace)
    and p.id<>auth.uid()
    and length(trim(search_term))>=2
    and (p.display_name ilike '%'||trim(search_term)||'%' or u.email ilike '%'||trim(search_term)||'%')
  group by p.id,p.display_name,u.email,p.avatar_url
  order by p.display_name
  limit 20
$$;
revoke all on function public.search_workspace_colleagues(uuid,text) from public;
grant execute on function public.search_workspace_colleagues(uuid,text) to authenticated;

create or replace function public.change_seedream_job(selected_job public.job_type)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_workspace_member('00000000-0000-4000-8000-000000000001') then raise exception 'Not a workspace member'; end if;
  delete from public.profile_jobs where workspace_id='00000000-0000-4000-8000-000000000001' and profile_id=auth.uid();
  insert into public.profile_jobs(workspace_id,profile_id,job) values('00000000-0000-4000-8000-000000000001',auth.uid(),selected_job);
end $$;
revoke all on function public.change_seedream_job(public.job_type) from public;
grant execute on function public.change_seedream_job(public.job_type) to authenticated;

-- One-time ownership migration for the initial catalog. Run after both named accounts exist.
do $$ declare hanyi_id uuid; lico_id uuid; begin
  select id into hanyi_id from public.profiles where lower(regexp_replace(display_name,'\s','','g'))='hanyiwang' order by created_at limit 1;
  select id into lico_id from public.profiles where display_name ilike 'Lico' order by created_at limit 1;
  if hanyi_id is null or lico_id is null then raise notice 'Hanyi Wang or Lico account not found; catalog ownership migration skipped'; return; end if;
  update public.shared_documents d set payload=(
    select jsonb_agg(
      case when item->>'responsibilityVersion'='2' then item else
      jsonb_set(jsonb_set(jsonb_set(jsonb_set(item,'{responsibilityVersion}','2'::jsonb),'{ownerId}',to_jsonb(hanyi_id::text)),'{collaborators}',
        (select jsonb_agg(distinct value) from jsonb_array_elements(coalesce(item->'collaborators','[]'::jsonb)||jsonb_build_array(lico_id::text)))),'{team}',
        jsonb_build_array(
          jsonb_build_object('profileId',hanyi_id::text,'name','Hanyi Wang','role','ux','avatarUrl','/images/avatar-ux-cat.png'),
          jsonb_build_object('profileId',lico_id::text,'name','Lico','role','tester','avatarUrl','/images/avatar-tester.png')
        )
      ) end
    ) from jsonb_array_elements(d.payload) item
  ),updated_at=now() where d.document_type='template' and d.document_key='catalog-v1';
end $$;
