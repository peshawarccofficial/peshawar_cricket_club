-- Peshawar Cricket Club starter schema.
-- Run in Supabase SQL Editor. Review policies before production launch.
create extension if not exists pgcrypto;

create type public.app_role as enum ('player','captain','scorer','admin');
create type public.team_status as enum ('pending','approved','suspended','rejected');
create type public.fixture_status as enum ('open','requested','confirmed','live','completed','cancelled','expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  display_name text,
  avatar_url text,
  role public.app_role not null default 'player',
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  area text,
  captain_id uuid not null references public.profiles(id),
  status public.team_status not null default 'pending',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  roster_number smallint,
  full_name text not null,
  photo_url text,
  playing_role text not null check (playing_role in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper')),
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  created_at timestamptz not null default now(),
  check (not (is_captain and is_vice_captain))
);

create table public.blocked_numbers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  reason text,
  blocked_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid not null references public.profiles(id),
  team_name text not null,
  team_area text,
  logo_url text,
  status public.team_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.match_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  match_date date not null,
  match_time time,
  ground text,
  overs integer check (overs between 1 and 50),
  notes text,
  status public.fixture_status not null default 'open',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  match_date date not null,
  match_time time,
  ground text,
  overs integer not null default 20 check (overs between 1 and 50),
  status public.fixture_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (home_team_id <> away_team_id)
);

create table public.match_squads (
  fixture_id uuid references public.fixtures(id) on delete cascade,
  player_id uuid references public.players(id),
  team_id uuid references public.teams(id),
  primary key (fixture_id, player_id)
);

create table public.innings (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  innings_number integer not null check (innings_number in (1,2)),
  batting_team_id uuid not null references public.teams(id),
  total_runs integer not null default 0,
  wickets integer not null default 0,
  legal_balls integer not null default 0,
  unique (fixture_id, innings_number)
);

create table public.ball_events (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references public.innings(id) on delete cascade,
  event_number integer not null,
  batter_id uuid references public.players(id),
  bowler_id uuid references public.players(id),
  batter_runs integer not null default 0 check (batter_runs between 0 and 6),
  extra_type text check (extra_type in ('wide','no_ball','bye','leg_bye','penalty')),
  extra_runs integer not null default 0,
  is_wicket boolean not null default false,
  dismissal_type text,
  is_legal_ball boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (innings_id, event_number)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references public.fixtures(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (conversation_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"match_request":true,"fixture_accepted":true,"match_reminder":true,"live_score":true}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  placement text not null,
  enabled boolean not null default false,
  publisher_id text,
  slot_id text,
  created_at timestamptz not null default now()
);
create table public.application_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index teams_status_idx on public.teams(status);
create index players_team_idx on public.players(team_id);
create index match_requests_date_idx on public.match_requests(match_date,status);
create index fixtures_date_idx on public.fixtures(match_date,status);
create index ball_events_innings_idx on public.ball_events(innings_id,event_number);
create index messages_conversation_idx on public.messages(conversation_id,created_at);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Helper: admin status is determined by a protected profile role.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone, display_name, avatar_url)
  values (
    new.id,
    new.phone,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', '')),
    coalesce(nullif(new.raw_user_meta_data->>'avatar_url', ''), nullif(new.raw_user_meta_data->>'picture', ''))
  )
  on conflict (id) do update set
    phone = excluded.phone,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, phone, display_name, avatar_url)
select
  id,
  phone,
  coalesce(nullif(raw_user_meta_data->>'display_name', ''), nullif(raw_user_meta_data->>'full_name', ''), nullif(raw_user_meta_data->>'name', '')),
  coalesce(nullif(raw_user_meta_data->>'avatar_url', ''), nullif(raw_user_meta_data->>'picture', ''))
from auth.users
on conflict (id) do update set
  phone = excluded.phone,
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
    and current_user not in ('postgres', 'service_role')
    and not public.is_admin() then
    raise exception 'Only an administrator can change profile roles';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.prevent_profile_role_escalation();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.blocked_numbers enable row level security;
alter table public.registration_requests enable row level security;
alter table public.match_requests enable row level security;
alter table public.fixtures enable row level security;
alter table public.match_squads enable row level security;
alter table public.innings enable row level security;
alter table public.ball_events enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_preferences enable row level security;
alter table public.admin_logs enable row level security;
alter table public.advertisements enable row level security;
alter table public.application_settings enable row level security;

create policy "profiles read own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));
create policy "approved teams public read" on public.teams for select using (status = 'approved' and deleted_at is null or captain_id = auth.uid() or public.is_admin());
create policy "players public read for approved teams" on public.players for select using (exists(select 1 from public.teams t where t.id=team_id and (t.status='approved' or t.captain_id=auth.uid())) or public.is_admin());
create policy "captain manages own players" on public.players for all using (exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid()) or public.is_admin()) with check (exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid()) or public.is_admin());
create policy "blocked numbers admin only" on public.blocked_numbers for all using (public.is_admin()) with check (public.is_admin());
create policy "registration owner or admin" on public.registration_requests for select using (captain_id=auth.uid() or public.is_admin());
create policy "captain submits registration" on public.registration_requests for insert with check (captain_id=auth.uid());
create policy "admin manages registrations" on public.registration_requests for update using (public.is_admin()) with check (public.is_admin());
create policy "public read match requests" on public.match_requests for select using (true);
create policy "team captain creates match request" on public.match_requests for insert with check (exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid() and t.status='approved'));
create policy "request owner or admin updates" on public.match_requests for update using (exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid()) or public.is_admin());
create policy "public read fixtures" on public.fixtures for select using (true);
create policy "admin manages fixtures" on public.fixtures for all using (public.is_admin()) with check (public.is_admin());
create policy "public read innings" on public.innings for select using (true);
create policy "public read ball events" on public.ball_events for select using (true);
create policy "scorer or admin adds ball events" on public.ball_events for insert with check (public.is_admin() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='scorer'));
create policy "public read squads" on public.match_squads for select using (true);
create policy "conversation members read conversations" on public.conversations for select using (exists(select 1 from public.conversation_members cm where cm.conversation_id=id and cm.user_id=auth.uid()) or public.is_admin());
create policy "members read membership" on public.conversation_members for select using (user_id=auth.uid() or public.is_admin());
create policy "members read messages" on public.messages for select using (exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
create policy "members send messages" on public.messages for insert with check (sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_id and cm.user_id=auth.uid()));
create policy "users read own notifications" on public.notifications for select using (user_id=auth.uid() or public.is_admin());
create policy "users update own notifications" on public.notifications for update using (user_id=auth.uid());
create policy "users manage own push subscriptions" on public.push_subscriptions for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "users manage own push preferences" on public.push_preferences for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "admin logs admin only" on public.admin_logs for all using (public.is_admin()) with check (public.is_admin());
create policy "ads public read" on public.advertisements for select using (enabled=true);
create policy "ads admin manage" on public.advertisements for all using (public.is_admin()) with check (public.is_admin());
create policy "settings public read" on public.application_settings for select using (key in ('public_branding','public_match_rules') or public.is_admin());
create policy "settings admin manage" on public.application_settings for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.register_team(p_name text, p_area text, p_players jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_player jsonb;
  v_player_name text;
  v_role text;
  v_team_id uuid;
  v_slug text;
begin
  if v_user_id is null then raise exception 'Sign in before registering a team'; end if;
  if char_length(v_name) not between 3 and 60 then raise exception 'Team name must be between 3 and 60 characters'; end if;
  if char_length(v_area) not between 2 and 80 then raise exception 'Area must be between 2 and 80 characters'; end if;
  if jsonb_typeof(p_players) is distinct from 'array' then raise exception 'Players must be provided as a list'; end if;
  if jsonb_array_length(p_players) not between 8 and 12 then
    raise exception 'A team must register between 8 and 12 players';
  end if;

  for v_player in select value from jsonb_array_elements(p_players)
  loop
    if jsonb_typeof(v_player) <> 'object' then raise exception 'Each player must have a name and playing role'; end if;
    v_player_name := btrim(coalesce(v_player->>'full_name', ''));
    v_role := v_player->>'playing_role';
    if char_length(v_player_name) not between 2 and 80 then raise exception 'Each player name must be between 2 and 80 characters'; end if;
    if v_role is null or v_role not in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper') then
      raise exception 'Select a valid playing role for every player';
    end if;
  end loop;

  insert into public.profiles (id, display_name)
  values (
    v_user_id,
    coalesce(
      nullif(auth.jwt()->'user_metadata'->>'display_name', ''),
      nullif(auth.jwt()->'user_metadata'->>'full_name', ''),
      nullif(auth.jwt()->'user_metadata'->>'name', '')
    )
  )
  on conflict (id) do nothing;

  v_slug := coalesce(nullif(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), ''), 'team')
    || '-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.teams (name, slug, area, captain_id, status)
  values (v_name, v_slug, v_area, v_user_id, 'pending')
  returning id into v_team_id;

  insert into public.players (team_id, full_name, playing_role, is_captain)
  select v_team_id, btrim(player.value->>'full_name'), player.value->>'playing_role', player.ordinality = 1
  from jsonb_array_elements(p_players) with ordinality as player(value, ordinality);

  return v_team_id;
end;
$$;
revoke all on function public.register_team(text, text, jsonb) from public;
grant execute on function public.register_team(text, text, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read profile avatars" on storage.objects;
create policy "public read profile avatars" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "users upload own profile avatar" on storage.objects;
create policy "users upload own profile avatar" on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "users update own profile avatar" on storage.objects;
create policy "users update own profile avatar" on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "users delete own profile avatar" on storage.objects;
create policy "users delete own profile avatar" on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Important: create the first admin manually through Supabase dashboard using a trusted account.
-- Never expose the Supabase service-role key in browser code.
