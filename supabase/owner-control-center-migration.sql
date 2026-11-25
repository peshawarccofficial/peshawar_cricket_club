alter type public.team_status add value if not exists 'pending_approval';

begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists owner_role text not null default 'none'
  constraint owner_role_values check (owner_role in ('none','owner'));

update public.profiles p
set email=u.email
from auth.users u
where p.id=u.id;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.profiles (id, phone, email, display_name, avatar_url)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''),nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name','')),
    coalesce(nullif(new.raw_user_meta_data->>'avatar_url',''),nullif(new.raw_user_meta_data->>'picture',''))
  )
  on conflict (id) do update set
    phone=excluded.phone,
    email=excluded.email,
    display_name=coalesce(excluded.display_name,public.profiles.display_name),
    avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url);
  return new;
end;
$$;

create or replace function public.prevent_profile_role_escalation()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.role is distinct from old.role
    and current_user not in ('postgres','service_role')
    and not public.is_admin() then
    raise exception 'Only an administrator can change profile roles';
  end if;
  if new.owner_role is distinct from old.owner_role
    and current_user not in ('postgres','service_role') then
    raise exception 'Owner role changes require secure database setup';
  end if;
  return new;
end;
$$;
alter type public.team_status add value if not exists 'pending_approval';

alter table public.teams
  add column if not exists sport text,
  add column if not exists description text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

alter table public.registration_requests
  add column if not exists sport text,
  add column if not exists description text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

alter table public.players
  add column if not exists contact text;

create table if not exists public.owner_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists owner_notifications_owner_idx
  on public.owner_notifications(owner_id, read_at, created_at);

create table if not exists public.owner_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  action text not null,
  team_id uuid references public.teams(id),
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.owner_notifications enable row level security;
alter table public.owner_audit_logs enable row level security;

drop policy if exists "owner reads notifications" on public.owner_notifications;
create policy "owner reads notifications" on public.owner_notifications
  for select using (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.owner_role='owner')
  );

drop policy if exists "owner updates notifications" on public.owner_notifications;
create policy "owner updates notifications" on public.owner_notifications
  for update using (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.owner_role='owner')
  ) with check (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.owner_role='owner')
  );

drop policy if exists "owner reads audit" on public.owner_audit_logs;
create policy "owner reads audit" on public.owner_audit_logs
  for select using (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.owner_role='owner')
  );

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id=auth.uid())
  with check (
    id=auth.uid()
    and role=(select role from public.profiles p where p.id=auth.uid())
    and owner_role=(select owner_role from public.profiles p where p.id=auth.uid())
  );

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and owner_role='owner') $$;

revoke execute on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

create or replace function public.register_team(
  p_name text,
  p_area text,
  p_players jsonb,
  p_logo_url text default null,
  p_sport text default 'Cricket',
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_sport text := btrim(coalesce(p_sport, 'Cricket'));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_logo_url text := nullif(btrim(coalesce(p_logo_url, '')), '');
  v_player jsonb;
  v_player_name text;
  v_role text;
  v_team_id uuid;
  v_slug text;
  v_owner_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before registering a team'; end if;
  if char_length(v_name) not between 3 and 60 then raise exception 'Team name must be between 3 and 60 characters'; end if;
  if char_length(v_area) not between 2 and 80 then raise exception 'Area must be between 2 and 80 characters'; end if;
  if char_length(v_sport) not between 2 and 40 then raise exception 'Sport type must be between 2 and 40 characters'; end if;
  if v_description is not null and char_length(v_description) > 2000 then raise exception 'Description is too long'; end if;
  if jsonb_typeof(p_players) is distinct from 'array' then raise exception 'Players must be provided as a list'; end if;
  if jsonb_array_length(p_players) not between 8 and 12 then raise exception 'A team must register between 8 and 12 players'; end if;

  for v_player in select value from jsonb_array_elements(p_players)
  loop
    if jsonb_typeof(v_player) <> 'object' then raise exception 'Each player must have a name and role'; end if;
    v_player_name := btrim(coalesce(v_player->>'full_name', ''));
    v_role := v_player->>'playing_role';
    if char_length(v_player_name) not between 2 and 80 then raise exception 'Each player name must be between 2 and 80 characters'; end if;
    if v_role is null or v_role not in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper') then
      raise exception 'Select a valid playing role for every player';
    end if;
  end loop;

  v_slug := coalesce(nullif(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), ''), 'team')
    || '-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.teams (
    name, slug, logo_url, sport, description, area, captain_id, status
  ) values (
    v_name, v_slug, v_logo_url, v_sport, v_description, v_area, v_user_id, 'pending_approval'
  ) returning id into v_team_id;

  insert into public.players (team_id, full_name, photo_url, playing_role, is_captain, contact)
  select
    v_team_id,
    btrim(player.value->>'full_name'),
    nullif(btrim(coalesce(player.value->>'photo_url', '')), ''),
    player.value->>'playing_role',
    player.ordinality = 1,
    nullif(btrim(coalesce(player.value->>'contact', '')), '')
  from jsonb_array_elements(p_players) with ordinality as player(value, ordinality);

  for v_owner_id in select id from public.profiles where owner_role='owner'
  loop
    insert into public.owner_notifications(owner_id, team_id, title, body)
    values (
      v_owner_id,
      v_team_id,
      'NEW TEAM REGISTRATION REQUEST',
      v_name || ' submitted a pending team registration by ' || coalesce(
        nullif(auth.jwt()->'user_metadata'->>'display_name',''),
        nullif(auth.jwt()->'user_metadata'->>'full_name',''),
        nullif(auth.jwt()->'user_metadata'->>'name',''),
        'the captain'
      )
    );
  end loop;

  return v_team_id;
end;
$$;
revoke all on function public.register_team(text,text,jsonb,text,text,text) from public;
grant execute on function public.register_team(text,text,jsonb,text,text,text) to authenticated;
drop function if exists public.register_team(text,text,jsonb);

create or replace function public.owner_review_team(
  p_team_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_current_status text;
  v_captain_id uuid;
  v_team_name text;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
begin
  if not exists(select 1 from public.profiles where id=v_owner_id and owner_role='owner') then
    raise exception 'Owner access required';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if p_status='rejected' and v_reason is null then raise exception 'A rejection reason is required'; end if;

  select status::text,captain_id,name into v_current_status,v_captain_id,v_team_name
  from public.teams where id=p_team_id for update;
  if v_current_status is null then raise exception 'Team not found'; end if;
  if v_current_status not in ('pending','pending_approval') then raise exception 'Team was already reviewed'; end if;

  update public.teams
  set status=p_status::public.team_status,
      rejection_reason=case when p_status='rejected' then v_reason else null end,
      reviewed_by=v_owner_id,
      reviewed_at=now()
  where id=p_team_id;

  insert into public.owner_audit_logs(owner_id, action, team_id, details)
  values (
    v_owner_id,
    case when p_status='approved' then 'team.approved' else 'team.rejected' end,
    p_team_id,
    jsonb_build_object('team_name',v_team_name,'status',p_status,'reason',v_reason)
  );

  insert into public.notifications(user_id,title,body)
  values (
    v_captain_id,
    case when p_status='approved' then 'Team registration approved' else 'Team registration rejected' end,
    case when p_status='approved' then v_team_name || ' is now approved and visible publicly.'
         else v_team_name || ' was rejected: ' || v_reason end
  );

  update public.owner_notifications
  set read_at=coalesce(read_at,now())
  where team_id=p_team_id and owner_id=v_owner_id;

  return p_team_id;
end;
$$;
revoke all on function public.owner_review_team(uuid,text,text) from public;
grant execute on function public.owner_review_team(uuid,text,text) to authenticated;

drop policy if exists "approved teams public read" on public.teams;
drop policy if exists "admin updates teams" on public.teams;
drop policy if exists "captain updates own team or admin" on public.teams;
create policy "approved teams public read" on public.teams
  for select using (
    (status='approved' and deleted_at is null)
    or captain_id=auth.uid()
    or public.is_owner()
  );

commit;
