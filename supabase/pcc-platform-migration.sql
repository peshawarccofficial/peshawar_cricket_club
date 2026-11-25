-- Apply after owner-control-center-migration.sql and admin-pwa-migration.sql.
-- Adds public-safe roster views, atomic player IDs, 8-12 player team rules,
-- and authenticated match invitations without publishing private contact data.
begin;

drop function if exists public.owner_review_team_admin(uuid,text,text,text);
delete from public.application_settings where key = 'private_admin_password_sha256';
drop policy if exists "admin updates teams" on public.teams;
drop policy if exists "captain updates own team or admin" on public.teams;

create sequence if not exists public.player_public_id_seq;

alter table public.players
  add column if not exists public_player_id bigint,
  add column if not exists batting_style text,
  add column if not exists bowling_style text,
  add column if not exists jersey_number smallint,
  add column if not exists is_public boolean not null default true,
  add column if not exists account_status text not null default 'unclaimed';

with numbered_players as (
  select id, nextval('public.player_public_id_seq') as public_player_id
  from public.players
  where public_player_id is null
  order by created_at, id
)
update public.players p
set public_player_id = numbered_players.public_player_id
from numbered_players
where p.id = numbered_players.id;

with numbered_rosters as (
  select id, row_number() over (partition by team_id order by created_at,id)::smallint as roster_number
  from public.players
)
update public.players p
set roster_number=numbered_rosters.roster_number
from numbered_rosters
where p.id=numbered_rosters.id and p.roster_number is null;

alter table public.players
  alter column public_player_id drop default,
  alter column public_player_id set not null;

alter table public.players
  drop constraint if exists players_playing_role_check,
  add constraint players_playing_role_check
    check (playing_role in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper','Wicketkeeper-Batsman'));

alter table public.players
  drop constraint if exists players_account_status_check,
  add constraint players_account_status_check
    check (account_status in ('unclaimed','active','suspended')),
  drop constraint if exists players_jersey_number_check,
  add constraint players_jersey_number_check
    check (jersey_number is null or jersey_number between 0 and 999);

create unique index if not exists players_public_player_id_uidx
  on public.players(public_player_id);
create unique index if not exists players_team_roster_number_uidx
  on public.players(team_id,roster_number);
create unique index if not exists players_one_captain_per_team_uidx
  on public.players(team_id) where is_captain;
create unique index if not exists players_one_vice_captain_per_team_uidx
  on public.players(team_id) where is_vice_captain;

create or replace function public.assign_immutable_player_public_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.public_player_id := nextval('public.player_public_id_seq');
  elsif tg_op = 'UPDATE' and new.public_player_id is distinct from old.public_player_id then
    raise exception 'Public player IDs cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.save_advertisement_setting(
  p_placement text,
  p_enabled boolean,
  p_publisher_id text,
  p_slot_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  if p_placement not in ('homepage_content','public_content') then
    raise exception 'Invalid advertisement placement';
  end if;
  if p_enabled and (
    p_publisher_id !~ '^ca-pub-[0-9]{16}$' or
    p_slot_id !~ '^[0-9]{4,20}$'
  ) then
    raise exception 'Valid AdSense publisher and slot IDs are required to enable ads';
  end if;
  if p_publisher_id is not null and p_publisher_id !~ '^ca-pub-[0-9]{16}$' then
    raise exception 'Invalid AdSense publisher ID';
  end if;
  if p_slot_id is not null and p_slot_id !~ '^[0-9]{4,20}$' then
    raise exception 'Invalid AdSense slot ID';
  end if;

  perform pg_advisory_xact_lock(hashtext('pcc-advertisement:' || p_placement));
  select id into v_id
  from public.advertisements
  where placement = p_placement
  order by enabled desc, created_at asc, id asc
  limit 1
  for update;

  if v_id is null then
    insert into public.advertisements(placement,enabled,publisher_id,slot_id)
    values(p_placement,p_enabled,p_publisher_id,p_slot_id)
    returning id into v_id;
  else
    update public.advertisements
    set enabled=p_enabled,publisher_id=p_publisher_id,slot_id=p_slot_id
    where id=v_id;
    update public.advertisements
    set enabled=false
    where placement=p_placement and id<>v_id and enabled=true;
  end if;

  return v_id;
end;
$$;
revoke all on function public.save_advertisement_setting(text,boolean,text,text) from public,anon;
grant execute on function public.save_advertisement_setting(text,boolean,text,text) to authenticated,service_role;

drop policy if exists "ads admin manage" on public.advertisements;
create policy "ads owner manage" on public.advertisements for all
using (public.is_owner())
with check (public.is_owner());

create table if not exists public.pcc_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  image_url text,
  destination_url text,
  start_at timestamptz,
  end_at timestamptz,
  visible boolean not null default false,
  featured_tournament_id uuid references public.admin_tournaments(id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at >= start_at)
);

create table if not exists public.pcc_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 2000),
  destination_url text,
  visible boolean not null default false,
  publish_at timestamptz not null default now(),
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.admin_tournaments(id) on delete cascade,
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  match_date date not null,
  match_time time,
  venue text,
  stage text not null default 'group',
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','cancelled')),
  home_score text,
  away_score text,
  result_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create table if not exists public.tournament_standings (
  tournament_id uuid not null references public.admin_tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  played integer not null default 0 check (played >= 0),
  won integer not null default 0 check (won >= 0),
  lost integer not null default 0 check (lost >= 0),
  tied integer not null default 0 check (tied >= 0),
  no_result integer not null default 0 check (no_result >= 0),
  points integer not null default 0,
  net_run_rate numeric(8,3),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

alter table public.pcc_banners enable row level security;
alter table public.pcc_announcements enable row level security;
alter table public.tournament_fixtures enable row level security;
alter table public.tournament_standings enable row level security;

revoke all on public.pcc_banners,public.pcc_announcements,public.tournament_fixtures,public.tournament_standings from anon,authenticated;
create policy "public visible banners" on public.pcc_banners for select using (
  visible and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now())
);
create policy "public visible announcements" on public.pcc_announcements for select using (
  visible and publish_at <= now() and (end_at is null or end_at >= now())
);
create policy "public tournament fixtures" on public.tournament_fixtures for select using (
  exists(select 1 from public.admin_tournaments t where t.id=tournament_id and t.status in ('upcoming','live','completed'))
);
create policy "public tournament standings" on public.tournament_standings for select using (
  exists(select 1 from public.admin_tournaments t where t.id=tournament_id and t.status in ('upcoming','live','completed'))
);
grant select on public.pcc_banners,public.pcc_announcements,public.tournament_fixtures,public.tournament_standings to anon,authenticated;

drop trigger if exists players_immutable_public_id on public.players;
create trigger players_immutable_public_id
before insert or update of public_player_id on public.players
for each row execute function public.assign_immutable_player_public_id();

create table if not exists public.player_account_links (
  player_id uuid primary key references public.players(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);

create table if not exists public.player_account_invites (
  player_id uuid primary key references public.players(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);
alter table public.player_account_links enable row level security;
alter table public.player_account_invites enable row level security;
revoke all on public.player_account_links,public.player_account_invites from anon,authenticated;
grant select on public.player_account_links,public.players to service_role;

create or replace function public.create_player_account_invite(p_player_id uuid,p_token_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_player record;
  v_expires_at timestamptz;
begin
  if v_user_id is null then raise exception 'Sign in before creating a player invite'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid player invite token'; end if;

  select player.team_id,player.is_captain,player.account_status,team.captain_id,team.status::text as team_status,team.deleted_at
  into v_player
  from public.players player
  join public.teams team on team.id=player.team_id
  where player.id=p_player_id
  for update of player;
  if not found or v_player.captain_id<>v_user_id or v_player.team_status<>'approved' or v_player.deleted_at is not null then
    raise exception 'You can only invite players on your approved team';
  end if;
  if v_player.is_captain then raise exception 'The captain already has club account access'; end if;
  if v_player.account_status<>'unclaimed' or exists(select 1 from public.player_account_links where player_id=p_player_id) then
    raise exception 'This player already has an account';
  end if;

  insert into public.player_account_invites(player_id,token_hash,created_by,expires_at,claimed_at)
  values(p_player_id,p_token_hash,v_user_id,now()+interval '7 days',null)
  on conflict(player_id) do update
    set token_hash=excluded.token_hash,
        created_by=excluded.created_by,
        created_at=now(),
        expires_at=excluded.expires_at,
        claimed_at=null
    where public.player_account_invites.claimed_at is null
  returning expires_at into v_expires_at;
  if v_expires_at is null then raise exception 'A claimed player invite cannot be replaced'; end if;
  return v_expires_at;
end;
$$;
revoke all on function public.create_player_account_invite(uuid,text) from public;
grant execute on function public.create_player_account_invite(uuid,text) to authenticated;

create or replace function public.claim_player_account(p_public_player_id text,p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_player_id text := nullif(pg_catalog.ltrim(pg_catalog.btrim(coalesce(p_public_player_id,'')),'0'),'');
  v_player record;
  v_invite public.player_account_invites%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in before claiming a player account'; end if;
  if v_public_player_id is null or v_public_player_id !~ '^[0-9]{1,19}$'
      or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid player ID or invite code';
  end if;

  select player.id,player.account_status,team.status::text as team_status,team.deleted_at
  into v_player
  from public.players player
  join public.teams team on team.id=player.team_id
  where player.public_player_id::text=v_public_player_id
  for update of player;
  if not found or v_player.account_status<>'unclaimed' or v_player.team_status<>'approved' or v_player.deleted_at is not null then
    raise exception 'Player invite is invalid or expired';
  end if;
  if exists(select 1 from public.player_account_links where user_id=v_user_id) then
    raise exception 'This account is already linked to a player';
  end if;

  select * into v_invite
  from public.player_account_invites
  where player_id=v_player.id
  for update;
  if not found or v_invite.claimed_at is not null or v_invite.expires_at<=now() or v_invite.token_hash<>p_token_hash then
    raise exception 'Player invite is invalid or expired';
  end if;

  insert into public.player_account_links(player_id,user_id)
  values(v_player.id,v_user_id);
  update public.players set account_status='active' where id=v_player.id;
  update public.player_account_invites set claimed_at=now() where player_id=v_player.id;
  return v_player.id;
end;
$$;
revoke all on function public.claim_player_account(text,text) from public;
grant execute on function public.claim_player_account(text,text) to authenticated;

create or replace function public.get_my_player_account()
returns table(
  public_player_id text,
  full_name text,
  photo_url text,
  playing_role text,
  batting_style text,
  bowling_style text,
  jersey_number smallint,
  is_captain boolean,
  is_vice_captain boolean,
  team_name text,
  team_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.lpad(player.public_player_id::text,pg_catalog.greatest(4,pg_catalog.char_length(player.public_player_id::text)),'0'),
    player.full_name,
    player.photo_url,
    player.playing_role,
    player.batting_style,
    player.bowling_style,
    player.jersey_number,
    player.is_captain,
    player.is_vice_captain,
    team.name,
    team.slug
  from public.player_account_links link
  join public.players player on player.id=link.player_id
  join public.teams team on team.id=player.team_id
  where link.user_id=auth.uid()
    and player.account_status='active'
    and team.status::text='approved'
    and team.deleted_at is null
$$;
revoke all on function public.get_my_player_account() from public;
grant execute on function public.get_my_player_account() to authenticated;

create or replace function public.enforce_team_roster_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_team_ids uuid[];
  v_status text;
  v_player_count integer;
  v_captain_count integer;
begin
  if tg_op = 'DELETE' then
    v_team_ids := array[old.team_id];
  elsif tg_op = 'UPDATE' and old.team_id is distinct from new.team_id then
    v_team_ids := array[old.team_id, new.team_id];
  else
    v_team_ids := array[new.team_id];
  end if;

  foreach v_team_id in array v_team_ids loop
    select status::text into v_status from public.teams where id = v_team_id;
    if not found then continue; end if;

    select count(*), count(*) filter (where is_captain)
    into v_player_count, v_captain_count
    from public.players
    where team_id = v_team_id;

    if v_player_count < 8 or v_player_count > 12 then
      raise exception 'An active team roster must contain between 8 and 12 players';
    end if;
    if v_captain_count <> 1 then
      raise exception 'Each active team must have exactly one captain';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists players_enforce_roster_size on public.players;
create constraint trigger players_enforce_roster_size
after insert or update or delete on public.players
deferrable initially deferred
for each row execute function public.enforce_team_roster_size();

create or replace function public.enforce_approved_team_roster_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_count integer;
  v_captain_count integer;
begin
  if new.status::text = 'approved' and old.status::text is distinct from 'approved' then
    select count(*), count(*) filter (where is_captain)
    into v_player_count, v_captain_count
    from public.players
    where team_id = new.id;
    if v_player_count < 8 or v_player_count > 12 or v_captain_count <> 1 then
      raise exception 'A team needs 8-12 players and exactly one captain before approval';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists teams_enforce_roster_before_approval on public.teams;
create trigger teams_enforce_roster_before_approval
before update of status on public.teams
for each row execute function public.enforce_approved_team_roster_size();

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
set search_path = ''
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
  if v_logo_url is not null and (char_length(v_logo_url) > 2048 or v_logo_url !~ '^https://') then raise exception 'Team logo must use a secure image URL'; end if;
  if jsonb_typeof(p_players) is distinct from 'array' then raise exception 'Players must be provided as a list'; end if;
  if jsonb_array_length(p_players) not between 8 and 12 then raise exception 'A team must register between 8 and 12 players'; end if;

  for v_player in select value from jsonb_array_elements(p_players)
  loop
    if jsonb_typeof(v_player) <> 'object' then raise exception 'Each player must have a name and role'; end if;
    v_player_name := btrim(coalesce(v_player->>'full_name', ''));
    v_role := v_player->>'playing_role';
    if char_length(v_player_name) not between 2 and 80 then raise exception 'Each player name must be between 2 and 80 characters'; end if;
    if v_role is null or v_role not in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper','Wicketkeeper-Batsman') then
      raise exception 'Select a valid playing role for every player';
    end if;
    if length(coalesce(v_player->>'contact','')) > 30 then raise exception 'Player contact information is too long'; end if;
    if length(coalesce(v_player->>'photo_url','')) > 2048 or (nullif(v_player->>'photo_url','') is not null and v_player->>'photo_url' !~ '^https://') then
      raise exception 'Player photos must use secure image URLs';
    end if;
  end loop;

  v_slug := coalesce(nullif(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), ''), 'team')
    || '-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.teams (name, slug, logo_url, sport, description, area, captain_id, status)
  values (v_name, v_slug, v_logo_url, v_sport, v_description, v_area, v_user_id, 'pending_approval')
  returning id into v_team_id;

  insert into public.players (team_id, roster_number, full_name, photo_url, playing_role, is_captain, contact)
  select
    v_team_id,
    player.ordinality::smallint,
    btrim(player.value->>'full_name'),
    nullif(btrim(coalesce(player.value->>'photo_url','')), ''),
    player.value->>'playing_role',
    player.ordinality = 1,
    nullif(btrim(coalesce(player.value->>'contact','')), '')
  from jsonb_array_elements(p_players) with ordinality as player(value, ordinality);

  for v_owner_id in select id from public.profiles where owner_role = 'owner'
  loop
    insert into public.owner_notifications(owner_id, team_id, title, body)
    values (v_owner_id, v_team_id, 'NEW TEAM REGISTRATION REQUEST',
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

create or replace view public.public_teams with (security_invoker = false) as
select
  t.id,
  t.slug,
  t.name,
  t.logo_url,
  t.area,
  t.sport,
  t.description,
  t.created_at,
  captain.display_name as captain_name,
  captain.avatar_url as captain_photo_url,
  coalesce(roster.player_count, 0)::integer as player_count,
  vice.full_name as vice_captain_name,
  vice.photo_url as vice_captain_photo_url
from public.teams t
left join public.profiles captain on captain.id = t.captain_id
left join lateral (
  select count(*) as player_count
  from public.players p
  where p.team_id = t.id and p.is_public
) roster on true
left join lateral (
  select p.full_name, p.photo_url
  from public.players p
  where p.team_id = t.id and p.is_vice_captain
  limit 1
) vice on true
where t.status::text = 'approved' and t.deleted_at is null
  and coalesce(roster.player_count, 0) between 8 and 12;

create or replace view public.public_team_players with (security_invoker = false) as
select
  p.id,
  p.team_id,
  p.roster_number,
  lpad(p.public_player_id::text, greatest(4, char_length(p.public_player_id::text)), '0') as player_id,
  p.full_name,
  p.photo_url,
  p.playing_role,
  p.batting_style,
  p.bowling_style,
  p.jersey_number,
  p.is_captain,
  p.is_vice_captain,
  p.created_at,
  t.slug as team_slug,
  t.name as team_name,
  t.area as team_area
from public.players p
join public.teams t on t.id = p.team_id
where t.status::text = 'approved' and t.deleted_at is null and p.is_public;

revoke select on public.players from anon, authenticated;
grant select on public.players to authenticated;
drop policy if exists "owner reads private player records" on public.players;
create policy "owner reads private player records" on public.players
  for select using (public.is_owner());

drop policy if exists "owner reads profiles" on public.profiles;
create policy "owner reads profiles" on public.profiles
  for select using (public.is_owner());

grant select on public.public_teams, public.public_team_players to anon, authenticated;

create or replace function public.get_my_team_roster_counts()
returns table(team_id uuid, player_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, count(p.id)::integer
  from public.teams t
  left join public.players p on p.team_id = t.id
  where t.captain_id = auth.uid() and t.deleted_at is null
  group by t.id
$$;
revoke all on function public.get_my_team_roster_counts() from public;
grant execute on function public.get_my_team_roster_counts() to authenticated;

drop function if exists public.get_my_captain_teams();
create function public.get_my_captain_teams()
returns table(
  team_id uuid,
  name text,
  slug text,
  status text,
  area text,
  sport text,
  description text,
  logo_url text,
  rejection_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,t.name,t.slug,t.status::text,t.area,t.sport,t.description,t.logo_url,t.rejection_reason
  from public.teams t
  where t.captain_id=auth.uid() and t.deleted_at is null
  order by t.created_at desc
$$;

create or replace function public.get_my_team_roster(p_team_id uuid)
returns table(
  id uuid,
  team_id uuid,
  public_player_id bigint,
  roster_number smallint,
  full_name text,
  photo_url text,
  playing_role text,
  contact text,
  batting_style text,
  bowling_style text,
  jersey_number smallint,
  is_public boolean,
  is_captain boolean,
  is_vice_captain boolean,
  account_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.teams where id=p_team_id and captain_id=auth.uid()
  ) then raise exception 'Only the team captain can view this roster'; end if;
  return query
  select
    p.id,p.team_id,p.public_player_id,p.roster_number,p.full_name,p.photo_url,p.playing_role,
    p.contact,p.batting_style,p.bowling_style,p.jersey_number,p.is_public,p.is_captain,
    p.is_vice_captain,p.account_status
  from public.players p
  where p.team_id=p_team_id
  order by p.roster_number,p.created_at;
end;
$$;

create or replace function public.resubmit_my_team(
  p_team_id uuid,
  p_name text,
  p_area text,
  p_sport text,
  p_description text,
  p_logo_url text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name,''));
  v_area text := btrim(coalesce(p_area,''));
  v_sport text := btrim(coalesce(p_sport,''));
  v_player jsonb;
  v_player_name text;
  v_role text;
  v_photo_url text;
  v_contact text;
  v_roster_number smallint;
  v_team_name text;
  v_owner_id uuid;
  v_rows integer;
begin
  if v_user_id is null then raise exception 'Sign in before resubmitting a team'; end if;
  if char_length(v_name) not between 3 and 60 then raise exception 'Team name must be between 3 and 60 characters'; end if;
  if char_length(v_area) not between 2 and 80 then raise exception 'Area must be between 2 and 80 characters'; end if;
  if char_length(v_sport) not between 2 and 40 then raise exception 'Sport type must be between 2 and 40 characters'; end if;
  if p_description is not null and char_length(p_description)>2000 then raise exception 'Description is too long'; end if;
  if p_logo_url is not null and (char_length(p_logo_url)>2048 or p_logo_url !~ '^https://') then
    raise exception 'Team logo must use a secure image URL';
  end if;
  if jsonb_typeof(p_players) is distinct from 'array' then raise exception 'Players must be provided as a list'; end if;
  if jsonb_array_length(p_players) not between 8 and 12 then raise exception 'A team must register between 8 and 12 players'; end if;

  select name into v_team_name
  from public.teams
  where id=p_team_id and captain_id=v_user_id and status::text='rejected' and deleted_at is null
  for update;
  if not found then raise exception 'Only your rejected team application can be resubmitted'; end if;

  update public.players set is_captain=false,is_vice_captain=false where team_id=p_team_id;

  for v_player,v_roster_number in
    select player.value,player.ordinality::smallint
    from jsonb_array_elements(p_players) with ordinality as player(value,ordinality)
  loop
    if jsonb_typeof(v_player) <> 'object' then raise exception 'Each player must have a name and role'; end if;
    v_player_name := btrim(coalesce(v_player->>'full_name',''));
    v_role := v_player->>'playing_role';
    v_photo_url := nullif(btrim(coalesce(v_player->>'photo_url','')),'');
    v_contact := nullif(btrim(coalesce(v_player->>'contact','')),'');
    if char_length(v_player_name) not between 2 and 80 then raise exception 'Each player name must be between 2 and 80 characters'; end if;
    if v_role is null or v_role not in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper','Wicketkeeper-Batsman') then
      raise exception 'Select a valid playing role for every player';
    end if;
    if v_photo_url is not null and (char_length(v_photo_url)>2048 or v_photo_url !~ '^https://') then
      raise exception 'Player photos must use secure image URLs';
    end if;
    if v_contact is not null and char_length(v_contact)>30 then raise exception 'Player contact is too long'; end if;

    update public.players
    set full_name=v_player_name,
        photo_url=v_photo_url,
        playing_role=v_role,
        contact=v_contact,
        is_captain=(v_roster_number=1),
        is_vice_captain=case when v_roster_number=1 then false else is_vice_captain end
    where team_id=p_team_id and roster_number=v_roster_number;
    get diagnostics v_rows = row_count;
    if v_rows=0 then
      insert into public.players(team_id,roster_number,full_name,photo_url,playing_role,contact,is_captain)
      values(p_team_id,v_roster_number,v_player_name,v_photo_url,v_role,v_contact,v_roster_number=1);
    end if;
  end loop;

  delete from public.players
  where team_id=p_team_id and roster_number>jsonb_array_length(p_players);

  update public.teams
  set name=v_name,area=v_area,sport=v_sport,description=nullif(btrim(coalesce(p_description,'')),''),
      logo_url=p_logo_url,status='pending_approval',rejection_reason=null,reviewed_by=null,reviewed_at=null
  where id=p_team_id;

  for v_owner_id in select id from public.profiles where owner_role='owner'
  loop
    insert into public.owner_notifications(owner_id,team_id,title,body)
    values(v_owner_id,p_team_id,'TEAM APPLICATION RESUBMITTED',v_name || ' corrected and resubmitted its application.');
  end loop;

  return p_team_id;
end;
$$;

create or replace function public.update_my_team_player(
  p_player_id uuid,
  p_full_name text,
  p_playing_role text,
  p_photo_url text,
  p_contact text,
  p_batting_style text,
  p_bowling_style text,
  p_jersey_number smallint,
  p_is_public boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before managing players'; end if;
  select p.team_id into v_team_id
  from public.players p join public.teams t on t.id=p.team_id
  where p.id=p_player_id and t.captain_id=auth.uid() and t.status::text='approved'
  for update of p;
  if not found then raise exception 'Player not found in your approved team'; end if;
  if char_length(btrim(coalesce(p_full_name,''))) not between 2 and 80 then raise exception 'Player name must be between 2 and 80 characters'; end if;
  if p_playing_role is null or p_playing_role not in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper','Wicketkeeper-Batsman') then raise exception 'Select a valid playing role'; end if;
  if p_photo_url is not null and (char_length(p_photo_url)>2048 or p_photo_url !~ '^https://') then raise exception 'Player photo must use a secure image URL'; end if;
  if p_contact is not null and char_length(p_contact)>30 then raise exception 'Player contact is too long'; end if;
  if p_batting_style is not null and char_length(p_batting_style)>80 then raise exception 'Batting style is too long'; end if;
  if p_bowling_style is not null and char_length(p_bowling_style)>80 then raise exception 'Bowling style is too long'; end if;
  if p_jersey_number is not null and p_jersey_number not between 0 and 999 then raise exception 'Jersey number must be between 0 and 999'; end if;
  update public.players
  set full_name=btrim(p_full_name),playing_role=p_playing_role,photo_url=p_photo_url,
      contact=nullif(btrim(coalesce(p_contact,'')),''),batting_style=nullif(btrim(coalesce(p_batting_style,'')),''),
      bowling_style=nullif(btrim(coalesce(p_bowling_style,'')),''),jersey_number=p_jersey_number,
      is_public=coalesce(p_is_public,false)
  where id=p_player_id;
  return p_player_id;
end;
$$;

create or replace function public.add_my_team_player(
  p_team_id uuid,
  p_full_name text,
  p_playing_role text,
  p_photo_url text default null,
  p_contact text default null,
  p_batting_style text default null,
  p_bowling_style text default null,
  p_jersey_number smallint default null,
  p_is_public boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roster_number smallint;
  v_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before managing players'; end if;
  perform 1 from public.teams where id=p_team_id and captain_id=auth.uid() and status::text='approved' for update;
  if not found then raise exception 'Only the captain of an approved team can add players'; end if;
  if (select count(*) from public.players where team_id=p_team_id)>=12 then raise exception 'A team cannot have more than 12 players'; end if;
  if char_length(btrim(coalesce(p_full_name,''))) not between 2 and 80 then raise exception 'Player name must be between 2 and 80 characters'; end if;
  if p_playing_role is null or p_playing_role not in ('Batsman','Bowler','All-rounder','Batting All-rounder','Bowling All-rounder','Wicketkeeper','Wicketkeeper-Batsman') then raise exception 'Select a valid playing role'; end if;
  if p_photo_url is not null and (char_length(p_photo_url)>2048 or p_photo_url !~ '^https://') then raise exception 'Player photo must use a secure image URL'; end if;
  if p_contact is not null and char_length(p_contact)>30 then raise exception 'Player contact is too long'; end if;
  if p_batting_style is not null and char_length(p_batting_style)>80 then raise exception 'Batting style is too long'; end if;
  if p_bowling_style is not null and char_length(p_bowling_style)>80 then raise exception 'Bowling style is too long'; end if;
  if p_jersey_number is not null and p_jersey_number not between 0 and 999 then raise exception 'Jersey number must be between 0 and 999'; end if;
  select coalesce(max(roster_number),0)+1 into v_roster_number from public.players where team_id=p_team_id;
  insert into public.players(team_id,roster_number,full_name,playing_role,photo_url,contact,batting_style,bowling_style,jersey_number,is_public)
  values(p_team_id,v_roster_number,btrim(p_full_name),p_playing_role,p_photo_url,p_contact,p_batting_style,p_bowling_style,p_jersey_number,coalesce(p_is_public,true))
  returning id into v_player_id;
  return v_player_id;
end;
$$;

create or replace function public.remove_my_team_player(p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before managing players'; end if;
  select p.team_id into v_team_id
  from public.players p join public.teams t on t.id=p.team_id
  where p.id=p_player_id and t.captain_id=auth.uid() and t.status::text='approved'
  for update of p;
  if not found then raise exception 'Player not found in your approved team'; end if;
  perform 1 from public.teams where id=v_team_id for update;
  if (select count(*) from public.players where team_id=v_team_id)<=8 then raise exception 'An approved team must keep at least 8 players'; end if;
  if exists(select 1 from public.players where id=p_player_id and is_captain) then raise exception 'Transfer captaincy before removing the captain'; end if;
  delete from public.players where id=p_player_id;
  return p_player_id;
end;
$$;

create or replace function public.set_my_team_vice_captain(p_team_id uuid,p_player_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before managing team roles'; end if;
  perform 1 from public.teams where id=p_team_id and captain_id=auth.uid() and status::text='approved' for update;
  if not found then raise exception 'Only the captain of an approved team can assign a vice-captain'; end if;
  if p_player_id is not null and not exists(
    select 1 from public.players where id=p_player_id and team_id=p_team_id and not is_captain
  ) then raise exception 'Choose a non-captain player from your team'; end if;
  update public.players set is_vice_captain=false where team_id=p_team_id and is_vice_captain;
  if p_player_id is not null then
    update public.players set is_vice_captain=true where id=p_player_id;
  end if;
  return p_player_id;
end;
$$;

revoke all on function public.get_my_captain_teams() from public;
revoke all on function public.get_my_team_roster(uuid) from public;
revoke all on function public.resubmit_my_team(uuid,text,text,text,text,text,jsonb) from public;
revoke all on function public.update_my_team_player(uuid,text,text,text,text,text,text,smallint,boolean) from public;
revoke all on function public.add_my_team_player(uuid,text,text,text,text,text,smallint,boolean) from public;
revoke all on function public.remove_my_team_player(uuid) from public;
revoke all on function public.set_my_team_vice_captain(uuid,uuid) from public;
grant execute on function public.get_my_captain_teams() to authenticated;
grant execute on function public.get_my_team_roster(uuid) to authenticated;
grant execute on function public.resubmit_my_team(uuid,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.update_my_team_player(uuid,text,text,text,text,text,text,smallint,boolean) to authenticated;
grant execute on function public.add_my_team_player(uuid,text,text,text,text,text,smallint,boolean) to authenticated;
grant execute on function public.remove_my_team_player(uuid) to authenticated;
grant execute on function public.set_my_team_vice_captain(uuid,uuid) to authenticated;

create table if not exists public.match_invitations (
  id uuid primary key default gen_random_uuid(),
  requester_team_id uuid not null references public.teams(id),
  invited_team_id uuid not null references public.teams(id),
  requested_by uuid not null references public.profiles(id),
  match_date date not null,
  match_time time,
  venue text not null check (char_length(venue) between 2 and 160),
  overs smallint not null default 20 check (overs between 1 and 50),
  match_format text not null default 'T20' check (char_length(match_format) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','finalized','cancelled')),
  requester_confirmed boolean not null default false,
  invited_confirmed boolean not null default false,
  fixture_id uuid references public.fixtures(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (requester_team_id <> invited_team_id),
  check (fixture_id is null or status = 'finalized')
);

create table if not exists public.match_polls (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.match_invitations(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open','closed')),
  allow_vote_changes boolean not null default true,
  closes_at timestamptz,
  closed_at timestamptz,
  final_date date,
  final_time time,
  final_venue text,
  created_at timestamptz not null default now(),
  check ((status='open' and closed_at is null) or (status='closed' and closed_at is not null))
);
create unique index if not exists match_polls_one_open_per_invitation_idx
  on public.match_polls(invitation_id) where status='open';
create index if not exists match_polls_invitation_created_idx
  on public.match_polls(invitation_id,created_at desc);

create table if not exists public.match_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.match_polls(id) on delete cascade,
  category text not null check (category in ('date','time','venue')),
  label text not null check (char_length(label) between 1 and 160),
  value text not null check (char_length(value) between 1 and 160),
  option_order smallint not null check (option_order between 1 and 8),
  created_at timestamptz not null default now(),
  unique(poll_id,category,option_order),
  unique(poll_id,category,value)
);
create index if not exists match_poll_options_category_idx
  on public.match_poll_options(poll_id,category,option_order);

create table if not exists public.match_poll_votes (
  poll_id uuid not null references public.match_polls(id) on delete cascade,
  category text not null check (category in ('date','time','venue')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  option_id uuid not null references public.match_poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(poll_id,category,user_id)
);
create index if not exists match_poll_votes_option_idx on public.match_poll_votes(option_id);

create index if not exists match_invitations_status_date_idx
  on public.match_invitations(status, match_date, created_at desc);
create unique index if not exists match_invitations_active_unique_idx
  on public.match_invitations(
    least(requester_team_id, invited_team_id),
    greatest(requester_team_id, invited_team_id),
    match_date,
    coalesce(match_time, '00:00'::time)
  )
  where status in ('pending','accepted','finalized');

alter table public.match_invitations enable row level security;
revoke all on public.match_invitations from anon, authenticated;
alter table public.match_polls enable row level security;
alter table public.match_poll_options enable row level security;
alter table public.match_poll_votes enable row level security;
revoke all on public.match_polls,public.match_poll_options,public.match_poll_votes from anon,authenticated;

create or replace view public.public_match_invitations with (security_invoker = false) as
select
  invitation.id,
  invitation.requester_team_id,
  requester.name as requester_team_name,
  requester.logo_url as requester_team_logo,
  invitation.invited_team_id,
  invited.name as invited_team_name,
  invited.logo_url as invited_team_logo,
  invitation.match_date,
  invitation.match_time,
  invitation.venue,
  invitation.overs,
  invitation.match_format,
  invitation.notes,
  invitation.status,
  invitation.fixture_id,
  invitation.requester_confirmed,
  invitation.invited_confirmed,
  invitation.created_at
from public.match_invitations invitation
join public.teams requester on requester.id = invitation.requester_team_id
join public.teams invited on invited.id = invitation.invited_team_id
where invitation.status in ('pending','accepted','finalized')
  and requester.status::text = 'approved' and invited.status::text = 'approved';

grant select on public.public_match_invitations to anon, authenticated;

create or replace function public.create_match_invitation(
  p_requester_team_id uuid,
  p_invited_team_id uuid,
  p_match_date date,
  p_match_time time,
  p_venue text,
  p_overs smallint,
  p_match_format text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation_id uuid;
  v_invited_captain uuid;
begin
  if v_user_id is null then raise exception 'Sign in before requesting a match'; end if;
  if p_requester_team_id = p_invited_team_id then raise exception 'Choose another team as the opponent'; end if;
  if p_match_date is null or p_match_date < current_date or p_match_date > current_date + 365 then raise exception 'Choose a match date within the next year'; end if;
  if p_venue is null or char_length(btrim(p_venue)) not between 2 and 160 then raise exception 'Enter a venue between 2 and 160 characters'; end if;
  if p_overs is null or p_overs not between 1 and 50 then raise exception 'Overs must be between 1 and 50'; end if;
  if p_match_format is null or char_length(btrim(p_match_format)) not between 1 and 80 then raise exception 'Enter a valid match format'; end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 1000 then raise exception 'Match notes are too long'; end if;
  if not exists(select 1 from public.teams where id=p_requester_team_id and captain_id=v_user_id and status::text='approved' and deleted_at is null) then
    raise exception 'Only the captain of an approved team can create a match request';
  end if;
  select captain_id into v_invited_captain
  from public.teams
  where id=p_invited_team_id and status::text='approved' and deleted_at is null;
  if v_invited_captain is null then raise exception 'The selected opponent is not an approved team'; end if;

  insert into public.match_invitations(
    requester_team_id, invited_team_id, requested_by, match_date,
    match_time, venue, overs, match_format, notes
  )
  values(
    p_requester_team_id, p_invited_team_id, v_user_id, p_match_date,
    p_match_time, btrim(p_venue), p_overs, btrim(p_match_format), nullif(btrim(coalesce(p_notes,'')),'')
  )
  returning id into v_invitation_id;

  insert into public.notifications(user_id, title, body)
  select v_invited_captain, 'New match invitation', t.name || ' invited your team to a match on ' || p_match_date::text
  from public.teams t where t.id=p_requester_team_id;
  return v_invitation_id;
end;
$$;

create or replace function public.respond_match_invitation(p_invitation_id uuid, p_response text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.match_invitations%rowtype;
  v_team_name text;
begin
  if v_user_id is null then raise exception 'Sign in before responding'; end if;
  if p_response not in ('accepted','rejected') then raise exception 'Choose accept or reject'; end if;
  select * into v_invitation from public.match_invitations where id=p_invitation_id for update;
  if not found then raise exception 'Match invitation not found'; end if;
  if not exists(select 1 from public.teams where id=v_invitation.invited_team_id and captain_id=v_user_id and status::text='approved') then
    raise exception 'Only the invited team captain can respond';
  end if;
  if v_invitation.status <> 'pending' then raise exception 'This invitation has already been answered'; end if;

  update public.match_invitations
  set status=p_response, responded_at=now()
  where id=p_invitation_id;

  select name into v_team_name from public.teams where id=v_invitation.invited_team_id;
  insert into public.notifications(user_id,title,body)
  values(v_invitation.requested_by,
    case when p_response='accepted' then 'Match invitation accepted' else 'Match invitation declined' end,
    v_team_name || case when p_response='accepted' then ' accepted your match request.' else ' declined your match request.' end
  );
  return p_invitation_id;
end;
$$;

create or replace function public.get_match_push_recipients(p_invitation_id uuid, p_event text)
returns table(user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.match_invitations%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in before checking notification recipients'; end if;
  if p_event not in ('request_created','response_accepted','response_declined','match_confirmed') then raise exception 'Invalid notification event'; end if;
  select * into v_invitation from public.match_invitations where id=p_invitation_id;
  if not found then raise exception 'Match invitation not found'; end if;

  if p_event='request_created' then
    if not exists(select 1 from public.teams where id=v_invitation.requester_team_id and captain_id=v_user_id) then
      raise exception 'Only the requesting team captain can dispatch this notification';
    end if;
    return query select captain_id from public.teams where id=v_invitation.invited_team_id;
  elsif p_event in ('response_accepted','response_declined') then
    if (p_event='response_accepted' and v_invitation.status not in ('accepted','finalized'))
      or (p_event='response_declined' and v_invitation.status <> 'rejected')
      or not exists(select 1 from public.teams where id=v_invitation.invited_team_id and captain_id=v_user_id) then
      raise exception 'Only the invited captain can dispatch this match response notification';
    end if;
    return query select v_invitation.requested_by;
  else
    if v_invitation.status <> 'finalized'
      or not exists(
        select 1 from public.teams
        where id in (v_invitation.requester_team_id,v_invitation.invited_team_id) and captain_id=v_user_id
      ) then
      raise exception 'Only a participating captain can dispatch the confirmed match notification';
    end if;
    return query
      select captain_id from public.teams
      where id in (v_invitation.requester_team_id,v_invitation.invited_team_id);
  end if;
end;
$$;

create or replace function public.confirm_match_arrangement(
  p_invitation_id uuid,
  p_match_date date,
  p_match_time time,
  p_venue text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.match_invitations%rowtype;
  v_requester_confirmation boolean;
  v_invited_confirmation boolean;
  v_fixture_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before confirming a match'; end if;
  if p_match_date is null or p_match_date < current_date or p_match_date > current_date + 365 then raise exception 'Choose a match date within the next year'; end if;
  if p_venue is null or char_length(btrim(p_venue)) not between 2 and 160 then raise exception 'Enter a valid venue'; end if;

  select * into v_invitation from public.match_invitations where id=p_invitation_id for update;
  if not found then raise exception 'Match invitation not found'; end if;
  if v_invitation.status not in ('accepted','finalized') then raise exception 'The match invitation must be accepted first'; end if;
  if v_invitation.status = 'finalized' then raise exception 'This match has already been confirmed'; end if;
  if not exists(
    select 1 from public.teams
    where id in (v_invitation.requester_team_id,v_invitation.invited_team_id)
      and captain_id=v_user_id and status::text='approved'
  ) then raise exception 'Only one of the approved team captains can confirm this match'; end if;

  if (v_invitation.requester_confirmed or v_invitation.invited_confirmed)
    and (v_invitation.match_date <> p_match_date
      or v_invitation.match_time is distinct from p_match_time
      or v_invitation.venue <> btrim(p_venue)) then
    raise exception 'Both captains must confirm the same date, time, and venue';
  end if;

  v_requester_confirmation := v_invitation.requester_confirmed
    or exists(select 1 from public.teams where id=v_invitation.requester_team_id and captain_id=v_user_id);
  v_invited_confirmation := v_invitation.invited_confirmed
    or exists(select 1 from public.teams where id=v_invitation.invited_team_id and captain_id=v_user_id);

  update public.match_invitations
  set match_date=p_match_date,
      match_time=p_match_time,
      venue=btrim(p_venue),
      requester_confirmed=v_requester_confirmation,
      invited_confirmed=v_invited_confirmation
  where id=p_invitation_id;

  if v_requester_confirmation and v_invited_confirmation then
    if v_invitation.fixture_id is null then
      insert into public.fixtures(
        home_team_id, away_team_id, match_date, match_time, ground, overs, status
      ) values (
        v_invitation.requester_team_id, v_invitation.invited_team_id,
        p_match_date, p_match_time, btrim(p_venue), v_invitation.overs, 'confirmed'
      )
      returning id into v_fixture_id;
    else
      v_fixture_id := v_invitation.fixture_id;
      update public.fixtures
      set match_date=p_match_date, match_time=p_match_time, ground=btrim(p_venue)
      where id=v_fixture_id;
    end if;
    update public.match_invitations
    set status='finalized', fixture_id=v_fixture_id
    where id=p_invitation_id;

    insert into public.notifications(user_id,title,body)
    select captain_id, 'Match confirmed', 'Both captains confirmed the match for ' || p_match_date::text || ' at ' || btrim(p_venue)
    from public.teams
    where id in (v_invitation.requester_team_id,v_invitation.invited_team_id);
  end if;
  return coalesce(v_fixture_id,p_invitation_id);
end;
$$;

create or replace function public.create_match_poll(
  p_invitation_id uuid,
  p_date_options text[],
  p_time_options text[],
  p_venue_options text[],
  p_allow_vote_changes boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.match_invitations%rowtype;
  v_poll_id uuid;
  v_other_captain uuid;
  v_requester_name text;
  v_raw text;
  v_date date;
  v_time time;
  v_venue text;
  v_order smallint;
begin
  if v_user_id is null then raise exception 'Sign in before creating a match poll'; end if;
  if coalesce(cardinality(p_date_options),0) not between 2 and 8
    or coalesce(cardinality(p_time_options),0) not between 2 and 8
    or coalesce(cardinality(p_venue_options),0) not between 2 and 8 then
    raise exception 'Provide 2 to 8 options for dates, times, and venues';
  end if;

  select * into v_invitation
  from public.match_invitations
  where id=p_invitation_id
  for update;
  if not found or v_invitation.status <> 'accepted' then
    raise exception 'Accept the match invitation before creating a poll';
  end if;
  if v_invitation.requester_confirmed or v_invitation.invited_confirmed then
    raise exception 'A poll cannot be opened after a captain has confirmed arrangements';
  end if;
  if not exists(
    select 1 from public.teams
    where id in (v_invitation.requester_team_id,v_invitation.invited_team_id)
      and captain_id=v_user_id and status::text='approved' and deleted_at is null
  ) then raise exception 'Only a participating approved team captain can create a poll'; end if;
  if exists(select 1 from public.match_polls where invitation_id=p_invitation_id and status='open') then
    raise exception 'This match already has an open poll';
  end if;

  insert into public.match_polls(invitation_id,created_by,allow_vote_changes)
  values(p_invitation_id,v_user_id,coalesce(p_allow_vote_changes,true))
  returning id into v_poll_id;

  v_order := 0;
  foreach v_raw in array p_date_options loop
    if btrim(coalesce(v_raw,'')) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Enter each poll date in YYYY-MM-DD format';
    end if;
    begin
      v_date := btrim(coalesce(v_raw,''))::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Enter each poll date in YYYY-MM-DD format';
    end;
    if v_date < current_date or v_date > current_date + 365 then raise exception 'Poll dates must be within the next year'; end if;
    v_order := v_order + 1;
    insert into public.match_poll_options(poll_id,category,label,value,option_order)
    values(v_poll_id,'date',to_char(v_date,'Dy, Mon DD YYYY'),v_date::text,v_order);
  end loop;

  v_order := 0;
  foreach v_raw in array p_time_options loop
    begin
      v_time := btrim(coalesce(v_raw,''))::time;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Enter each poll time in HH:MM format';
    end;
    v_order := v_order + 1;
    insert into public.match_poll_options(poll_id,category,label,value,option_order)
    values(v_poll_id,'time',to_char(v_time,'HH24:MI'),to_char(v_time,'HH24:MI'),v_order);
  end loop;

  v_order := 0;
  foreach v_raw in array p_venue_options loop
    v_venue := btrim(coalesce(v_raw,''));
    if char_length(v_venue) not between 2 and 160 then raise exception 'Each venue must be 2 to 160 characters'; end if;
    v_order := v_order + 1;
    insert into public.match_poll_options(poll_id,category,label,value,option_order)
    values(v_poll_id,'venue',v_venue,v_venue,v_order);
  end loop;

  if exists(select 1 from public.teams where id=v_invitation.requester_team_id and captain_id=v_user_id) then
    select captain_id into v_other_captain from public.teams where id=v_invitation.invited_team_id;
    select name into v_requester_name from public.teams where id=v_invitation.requester_team_id;
  else
    select captain_id into v_other_captain from public.teams where id=v_invitation.requester_team_id;
    select name into v_requester_name from public.teams where id=v_invitation.invited_team_id;
  end if;

  insert into public.notifications(user_id,title,body)
  values(v_other_captain,'Match poll opened',coalesce(v_requester_name,'A participating team') || ' opened a date, time, and venue poll for your match.');

  return v_poll_id;
end;
$$;

create or replace function public.get_my_match_polls()
returns table(
  invitation_id uuid,
  poll_id uuid,
  created_by uuid,
  status text,
  allow_vote_changes boolean,
  closes_at timestamptz,
  closed_at timestamptz,
  final_date date,
  final_time time,
  final_venue text,
  options jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    poll.invitation_id,
    poll.id,
    poll.created_by,
    poll.status,
    poll.allow_vote_changes,
    poll.closes_at,
    poll.closed_at,
    poll.final_date,
    poll.final_time,
    poll.final_venue,
    coalesce(option_data.options,'[]'::jsonb)
  from public.match_polls poll
  join public.match_invitations invitation on invitation.id=poll.invitation_id
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id',row_data.id,
        'category',row_data.category,
        'label',row_data.label,
        'value',row_data.value,
        'vote_count',row_data.vote_count,
        'my_vote',row_data.my_vote
      ) order by case row_data.category when 'date' then 1 when 'time' then 2 else 3 end,row_data.option_order
    ) as options
    from (
      select
        option.id,
        option.category,
        option.label,
        option.value,
        option.option_order,
        count(vote.user_id)::integer as vote_count,
        coalesce(bool_or(vote.user_id=auth.uid()),false) as my_vote
      from public.match_poll_options option
      left join public.match_poll_votes vote on vote.option_id=option.id
      where option.poll_id=poll.id
      group by option.id,option.category,option.label,option.value,option.option_order
    ) row_data
  ) option_data
  where auth.uid() is not null
    and exists(
      select 1 from public.teams
      where id in (invitation.requester_team_id,invitation.invited_team_id)
        and captain_id=auth.uid()
    )
  order by poll.created_at desc
$$;

create or replace function public.cast_match_poll_vote(p_poll_id uuid,p_option_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_poll public.match_polls%rowtype;
  v_invitation public.match_invitations%rowtype;
  v_team_id uuid;
  v_category text;
  v_existing_option uuid;
begin
  if v_user_id is null then raise exception 'Sign in before voting'; end if;
  select * into v_poll from public.match_polls where id=p_poll_id for update;
  if not found then raise exception 'Match poll not found'; end if;
  if v_poll.status <> 'open' or (v_poll.closes_at is not null and v_poll.closes_at<=now()) then
    raise exception 'This poll is closed';
  end if;
  select * into v_invitation from public.match_invitations where id=v_poll.invitation_id;
  if not found or v_invitation.status <> 'accepted' then raise exception 'This poll is no longer active'; end if;
  select id into v_team_id
  from public.teams
  where id in (v_invitation.requester_team_id,v_invitation.invited_team_id)
    and captain_id=v_user_id and status::text='approved' and deleted_at is null
  limit 1;
  if v_team_id is null then raise exception 'Only a participating approved team captain can vote'; end if;
  select category into v_category
  from public.match_poll_options
  where id=p_option_id and poll_id=p_poll_id;
  if not found then raise exception 'Choose an option from this poll'; end if;

  select option_id into v_existing_option
  from public.match_poll_votes
  where poll_id=p_poll_id and category=v_category and user_id=v_user_id
  for update;
  if found then
    if v_existing_option=p_option_id then return p_option_id; end if;
    if not v_poll.allow_vote_changes then raise exception 'Vote changes are disabled for this poll'; end if;
    update public.match_poll_votes
    set option_id=p_option_id,team_id=v_team_id,updated_at=now()
    where poll_id=p_poll_id and category=v_category and user_id=v_user_id;
  else
    insert into public.match_poll_votes(poll_id,category,user_id,team_id,option_id)
    values(p_poll_id,v_category,v_user_id,v_team_id,p_option_id);
  end if;
  return p_option_id;
end;
$$;

create or replace function public.close_match_poll(p_poll_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation_id uuid;
  v_poll public.match_polls%rowtype;
  v_invitation public.match_invitations%rowtype;
  v_team public.teams%rowtype;
  v_date text;
  v_time text;
  v_venue text;
begin
  if v_user_id is null then raise exception 'Sign in before closing a poll'; end if;
  select invitation_id into v_invitation_id from public.match_polls where id=p_poll_id;
  if v_invitation_id is null then raise exception 'Match poll not found'; end if;
  select * into v_invitation from public.match_invitations where id=v_invitation_id for update;
  if not found then raise exception 'Match invitation not found'; end if;
  select * into v_poll from public.match_polls where id=p_poll_id for update;
  if not found then raise exception 'Match poll not found'; end if;
  if v_poll.status='closed' then return p_poll_id; end if;
  if v_invitation.status <> 'accepted' then raise exception 'This match is no longer accepting poll results'; end if;
  if not exists(
    select 1 from public.teams
    where id in (v_invitation.requester_team_id,v_invitation.invited_team_id)
      and captain_id=v_user_id and status::text='approved' and deleted_at is null
  ) then raise exception 'Only a participating approved team captain can close this poll'; end if;

  select option.value into v_date
  from public.match_poll_options option
  left join public.match_poll_votes vote on vote.option_id=option.id
  where option.poll_id=p_poll_id and option.category='date'
  group by option.id,option.value,option.option_order
  having count(vote.user_id)>0
  order by count(vote.user_id) desc,option.option_order
  limit 1;
  select option.value into v_time
  from public.match_poll_options option
  left join public.match_poll_votes vote on vote.option_id=option.id
  where option.poll_id=p_poll_id and option.category='time'
  group by option.id,option.value,option.option_order
  having count(vote.user_id)>0
  order by count(vote.user_id) desc,option.option_order
  limit 1;
  select option.value into v_venue
  from public.match_poll_options option
  left join public.match_poll_votes vote on vote.option_id=option.id
  where option.poll_id=p_poll_id and option.category='venue'
  group by option.id,option.value,option.option_order
  having count(vote.user_id)>0
  order by count(vote.user_id) desc,option.option_order
  limit 1;
  if v_date is null or v_time is null or v_venue is null then
    raise exception 'Each poll category needs at least one vote before it can be closed';
  end if;

  update public.match_polls
  set status='closed',closed_at=now(),final_date=v_date::date,final_time=v_time::time,final_venue=v_venue
  where id=p_poll_id;
  update public.match_invitations
  set match_date=v_date::date,match_time=v_time::time,venue=v_venue,
      requester_confirmed=false,invited_confirmed=false
  where id=v_invitation_id;

  for v_team in
    select * from public.teams
    where id in (v_invitation.requester_team_id,v_invitation.invited_team_id)
  loop
    insert into public.notifications(user_id,title,body)
    values(v_team.captain_id,'Match poll closed','The leading poll choices are ' || v_date || ' at ' || v_time || ' · ' || v_venue || '. Confirm the final arrangement on the match page.');
  end loop;

  return p_poll_id;
end;
$$;

revoke all on function public.create_match_invitation(uuid,uuid,date,time,text,smallint,text,text) from public;
revoke all on function public.respond_match_invitation(uuid,text) from public;
revoke all on function public.get_match_push_recipients(uuid,text) from public;
revoke all on function public.confirm_match_arrangement(uuid,date,time,text) from public;
revoke all on function public.create_match_poll(uuid,text[],text[],text[],boolean) from public;
revoke all on function public.get_my_match_polls() from public;
revoke all on function public.cast_match_poll_vote(uuid,uuid) from public;
revoke all on function public.close_match_poll(uuid) from public;
grant execute on function public.create_match_invitation(uuid,uuid,date,time,text,smallint,text,text) to authenticated;
grant execute on function public.respond_match_invitation(uuid,text) to authenticated;
grant execute on function public.get_match_push_recipients(uuid,text) to authenticated;
grant execute on function public.confirm_match_arrangement(uuid,date,time,text) to authenticated;
grant execute on function public.create_match_poll(uuid,text[],text[],text[],boolean) to authenticated;
grant execute on function public.get_my_match_polls() to authenticated;
grant execute on function public.cast_match_poll_vote(uuid,uuid) to authenticated;
grant execute on function public.close_match_poll(uuid) to authenticated;

create or replace function public.start_match_chat(p_fixture_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fixture public.fixtures%rowtype;
  v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before starting a match chat'; end if;
  select * into v_fixture
  from public.fixtures
  where id=p_fixture_id and status::text in ('confirmed','live','completed')
  for share;
  if not found then raise exception 'Only a confirmed match can have a chat'; end if;
  if not exists(
    select 1 from public.teams
    where id in (v_fixture.home_team_id,v_fixture.away_team_id)
      and captain_id=v_user_id and status::text='approved'
  ) then raise exception 'Only a participating team captain can start this chat'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('match-chat:' || p_fixture_id::text));
  select id into v_conversation_id
  from public.conversations
  where fixture_id=p_fixture_id and team_id is null
  order by created_at
  limit 1;
  if v_conversation_id is null then
    insert into public.conversations(fixture_id)
    values(p_fixture_id)
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_members(conversation_id,user_id)
  select v_conversation_id,captain_id
  from public.teams
  where id in (v_fixture.home_team_id,v_fixture.away_team_id)
  on conflict do nothing;
  return v_conversation_id;
end;
$$;

create or replace function public.start_team_chat(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before starting a team chat'; end if;
  if not exists(select 1 from public.teams where id=p_team_id and captain_id=v_user_id and status::text='approved') then
    raise exception 'Only the captain of an approved team can start its chat';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('team-chat:' || p_team_id::text));
  select id into v_conversation_id
  from public.conversations
  where team_id=p_team_id and fixture_id is null
  order by created_at
  limit 1;
  if v_conversation_id is null then
    insert into public.conversations(team_id)
    values(p_team_id)
    returning id into v_conversation_id;
  end if;
  insert into public.conversation_members(conversation_id,user_id)
  values(v_conversation_id,v_user_id)
  on conflict do nothing;
  return v_conversation_id;
end;
$$;

create or replace function public.send_chat_message(p_conversation_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(p_body,''));
  v_message_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before sending a message'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Messages must contain between 1 and 4000 characters'; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=v_user_id) then
    raise exception 'You are not a member of this conversation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('chat-rate:' || v_user_id::text));
  if (select count(*) from public.messages where sender_id=v_user_id and created_at > now()-interval '1 minute') >= 20 then
    raise exception 'Message rate limit reached. Wait before sending another message';
  end if;

  insert into public.messages(conversation_id,sender_id,body)
  values(p_conversation_id,v_user_id,v_body)
  returning id into v_message_id;

  insert into public.notifications(user_id,title,body)
  select member.user_id,'New chat message',left(v_body,160)
  from public.conversation_members member
  where member.conversation_id=p_conversation_id and member.user_id<>v_user_id;
  return v_message_id;
end;
$$;

create or replace view public.public_chat_conversations with (security_invoker = false) as
select
  c.id,
  c.team_id,
  c.fixture_id,
  c.created_at,
  case
    when c.team_id is not null then coalesce(team.name,'Team chat')
    else coalesce(home.name,'Team') || ' vs ' || coalesce(away.name,'Team')
  end as title,
  latest.body as latest_message,
  latest.created_at as latest_message_at
from public.conversations c
left join public.teams team on team.id=c.team_id
left join public.fixtures fixture on fixture.id=c.fixture_id
left join public.teams home on home.id=fixture.home_team_id
left join public.teams away on away.id=fixture.away_team_id
left join lateral (
  select message.body,message.created_at
  from public.messages message
  where message.conversation_id=c.id
  order by message.created_at desc
  limit 1
) latest on true
where exists(
  select 1 from public.conversation_members member
  where member.conversation_id=c.id and member.user_id=auth.uid()
);

create or replace view public.public_chat_messages with (security_invoker = false) as
select
  message.id,
  message.conversation_id,
  message.sender_id,
  coalesce(profile.display_name,'Club member') as sender_name,
  message.body,
  message.created_at
from public.messages message
join public.profiles profile on profile.id=message.sender_id
where exists(
  select 1 from public.conversation_members member
  where member.conversation_id=message.conversation_id and member.user_id=auth.uid()
);

grant select on public.public_chat_conversations,public.public_chat_messages to authenticated;
revoke all on function public.start_match_chat(uuid) from public;
revoke all on function public.start_team_chat(uuid) from public;
revoke all on function public.send_chat_message(uuid,text) from public;
grant execute on function public.start_match_chat(uuid) to authenticated;
grant execute on function public.start_team_chat(uuid) to authenticated;
grant execute on function public.send_chat_message(uuid,text) to authenticated;

create table if not exists public.chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 80),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(message_id,reporter_id)
);
create index if not exists chat_message_reports_status_created_idx
  on public.chat_message_reports(status,created_at desc);
alter table public.chat_message_reports enable row level security;
revoke all on public.chat_message_reports from anon,authenticated;
grant select,update on public.chat_message_reports to service_role;

create or replace function public.report_chat_message(p_message_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason,''));
  v_report_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before reporting a message'; end if;
  if char_length(v_reason) not between 1 and 1000 then raise exception 'Provide a report reason between 1 and 1000 characters'; end if;
  if not exists(
    select 1
    from public.messages message
    join public.conversation_members member on member.conversation_id=message.conversation_id
    where message.id=p_message_id
      and message.sender_id<>v_user_id
      and member.user_id=v_user_id
  ) then raise exception 'Only a member can report another member message'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('chat-report:' || v_user_id::text));
  if (select count(*) from public.chat_message_reports
      where reporter_id=v_user_id and created_at>now()-interval '10 minutes') >= 5 then
    raise exception 'Report rate limit reached. Wait before submitting another report';
  end if;

  insert into public.chat_message_reports(message_id,reporter_id,reason)
  values(p_message_id,v_user_id,v_reason)
  on conflict(message_id,reporter_id) do nothing
  returning id into v_report_id;
  if v_report_id is null then raise exception 'You have already reported this message'; end if;
  return v_report_id;
end;
$$;
revoke all on function public.report_chat_message(uuid,text) from public;
grant execute on function public.report_chat_message(uuid,text) to authenticated;

create or replace function public.review_chat_message_report(
  p_report_id uuid,
  p_status text,
  p_review_note text default null,
  p_operator text default 'owner'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.chat_message_reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_review_note,'')),'');
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  if p_status not in ('resolved','dismissed') then raise exception 'Choose resolved or dismissed'; end if;
  if v_note is not null and char_length(v_note)>1000 then raise exception 'Review notes must be 1000 characters or fewer'; end if;

  update public.chat_message_reports
  set status=p_status,
      review_note=v_note,
      reviewed_by=left(coalesce(p_operator,'owner'),80),
      reviewed_at=now()
  where id=p_report_id and status='open'
  returning * into v_report;
  if not found then raise exception 'Open message report not found'; end if;

  insert into public.admin_logs(action,target_type,target_id,details)
  values(
    'chat.message_report.' || p_status,
    'chat_message_report',
    v_report.id,
    jsonb_build_object(
      'message_id',v_report.message_id,
      'reporter_id',v_report.reporter_id,
      'operator',left(coalesce(p_operator,'owner'),80)
    )
  );
  return v_report.id;
end;
$$;
revoke all on function public.review_chat_message_report(uuid,text,text,text) from public;
grant execute on function public.review_chat_message_report(uuid,text,text,text) to service_role;

alter table public.innings
  add column if not exists is_completed boolean not null default false,
  add column if not exists completed_at timestamptz;

alter table public.fixtures
  add column if not exists reminder_sent_at timestamptz;

create or replace function public.dispatch_due_match_reminders()
returns table (
  fixture_id uuid,
  home_team text,
  away_team text,
  match_date date,
  match_time time,
  ground text,
  home_captain_id uuid,
  away_captain_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'Asia/Karachi';
  v_fixture record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authorized scheduler required'; end if;
  for v_fixture in
    select
      f.id,
      f.match_date,
      f.match_time,
      f.ground,
      home.name as home_name,
      away.name as away_name,
      home.captain_id as home_captain,
      away.captain_id as away_captain
    from public.fixtures f
    join public.teams home on home.id=f.home_team_id
    join public.teams away on away.id=f.away_team_id
    where f.status::text='confirmed'
      and f.match_time is not null
      and f.reminder_sent_at is null
      and (f.match_date + f.match_time) >= v_now
      and (f.match_date + f.match_time) <= v_now + interval '20 minutes'
    order by f.match_date,f.match_time
    for update of f skip locked
  loop
    update public.fixtures set reminder_sent_at=now() where id=v_fixture.id;
    insert into public.notifications(user_id,title,body)
    select distinct team.captain_id,
      'Match reminder',
      v_fixture.home_name || ' vs ' || v_fixture.away_name || ' starts soon at ' || coalesce(v_fixture.ground,'the scheduled ground') || '.'
    from public.teams team
    where team.id in (
      select f.home_team_id from public.fixtures f where f.id=v_fixture.id
      union
      select f.away_team_id from public.fixtures f where f.id=v_fixture.id
    ) and team.captain_id is not null;
    return query select
      v_fixture.id,
      v_fixture.home_name,
      v_fixture.away_name,
      v_fixture.match_date,
      v_fixture.match_time,
      v_fixture.ground,
      v_fixture.home_captain,
      v_fixture.away_captain;
  end loop;
end;
$$;

revoke all on function public.dispatch_due_match_reminders() from public;
grant execute on function public.dispatch_due_match_reminders() to service_role;

create or replace function public.start_admin_innings(
  p_fixture_id uuid,
  p_batting_team_id uuid,
  p_admin_username text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_innings_count integer;
  v_innings_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authorized admin session required'; end if;
  select * into v_fixture from public.fixtures where id=p_fixture_id for update;
  if not found or v_fixture.status::text not in ('confirmed','live') then raise exception 'Only a confirmed fixture can be scored'; end if;
  if p_batting_team_id not in (v_fixture.home_team_id,v_fixture.away_team_id) then raise exception 'Select one of the fixture teams'; end if;
  select count(*) into v_innings_count from public.innings where fixture_id=p_fixture_id;
  if v_innings_count >= 2 then raise exception 'Both innings have already started'; end if;
  if v_innings_count=1 and not exists(
    select 1 from public.innings
    where fixture_id=p_fixture_id and innings_number=1 and is_completed
  ) then raise exception 'Complete the first innings before starting the second'; end if;

  insert into public.innings(fixture_id,innings_number,batting_team_id)
  values(p_fixture_id,v_innings_count+1,p_batting_team_id)
  returning id into v_innings_id;
  update public.fixtures set status='live' where id=p_fixture_id;
  insert into public.admin_logs(action,target_type,target_id,details)
  values('innings.started','fixture',p_fixture_id,
    jsonb_build_object('innings_number',v_innings_count+1,'batting_team_id',p_batting_team_id,'operator',left(coalesce(p_admin_username,'admin'),80)));
  return v_innings_id;
end;
$$;

create or replace function public.record_admin_ball_event(
  p_innings_id uuid,
  p_batter_id uuid,
  p_bowler_id uuid,
  p_batter_runs integer,
  p_extra_type text default null,
  p_extra_runs integer default 0,
  p_is_wicket boolean default false,
  p_dismissal_type text default null,
  p_admin_username text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_innings public.innings%rowtype;
  v_fixture public.fixtures%rowtype;
  v_event_number integer;
  v_legal_ball boolean;
  v_total_runs integer;
  v_total_wickets integer;
  v_legal_balls integer;
  v_event_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authorized admin session required'; end if;
  if p_batter_runs is null or p_batter_runs not between 0 and 6 then raise exception 'Batter runs must be between 0 and 6'; end if;
  if p_extra_runs is null or p_extra_runs not between 0 and 10 then raise exception 'Extra runs must be between 0 and 10'; end if;
  if p_extra_type is not null and p_extra_type not in ('wide','no_ball','bye','leg_bye','penalty') then raise exception 'Select a valid extra type'; end if;
  if (p_extra_type is null and p_extra_runs<>0)
    or (p_extra_type in ('wide','no_ball') and p_extra_runs<1)
    or (p_extra_type in ('wide','bye','leg_bye','penalty') and p_batter_runs<>0) then
    raise exception 'Batter runs and extras do not match the selected extra type';
  end if;
  if coalesce(p_is_wicket,false) and (
    p_dismissal_type is null
    or p_dismissal_type not in ('bowled','caught','lbw','run_out','stumped','hit_wicket','other')
  ) then
    raise exception 'Select a valid dismissal type';
  end if;

  select * into v_innings from public.innings where id=p_innings_id for update;
  if not found then raise exception 'Innings not found'; end if;
  if v_innings.is_completed then raise exception 'This innings has already been completed'; end if;
  select * into v_fixture from public.fixtures where id=v_innings.fixture_id for update;
  if not found or v_fixture.status::text<>'live' then raise exception 'The fixture is not live'; end if;
  if not exists(select 1 from public.players where id=p_batter_id and team_id=v_innings.batting_team_id) then
    raise exception 'Select a batter from the batting team';
  end if;
  if not exists(
    select 1 from public.players
    where id=p_bowler_id and team_id in (v_fixture.home_team_id,v_fixture.away_team_id)
      and team_id<>v_innings.batting_team_id
  ) then raise exception 'Select a bowler from the opposing team'; end if;

  v_legal_ball := coalesce(p_extra_type not in ('wide','no_ball'),true);
  v_total_runs := v_innings.total_runs + p_batter_runs + p_extra_runs;
  v_total_wickets := v_innings.wickets + case when coalesce(p_is_wicket,false) then 1 else 0 end;
  v_legal_balls := v_innings.legal_balls + case when v_legal_ball then 1 else 0 end;
  if v_total_wickets>10 then raise exception 'An innings cannot have more than 10 wickets'; end if;
  if v_legal_balls>v_fixture.overs*6 then raise exception 'The innings has reached its over limit'; end if;
  select coalesce(max(event_number),0)+1 into v_event_number
  from public.ball_events where innings_id=p_innings_id;

  insert into public.ball_events(
    innings_id,event_number,batter_id,bowler_id,batter_runs,extra_type,extra_runs,
    is_wicket,dismissal_type,is_legal_ball
  ) values(
    p_innings_id,v_event_number,p_batter_id,p_bowler_id,p_batter_runs,p_extra_type,p_extra_runs,
    coalesce(p_is_wicket,false),case when p_is_wicket then p_dismissal_type else null end,v_legal_ball
  ) returning id into v_event_id;

  update public.innings
  set total_runs=v_total_runs,wickets=v_total_wickets,legal_balls=v_legal_balls,
      is_completed=(v_total_wickets=10 or v_legal_balls=v_fixture.overs*6),
      completed_at=case when v_total_wickets=10 or v_legal_balls=v_fixture.overs*6 then now() else null end
  where id=p_innings_id;

  insert into public.admin_logs(action,target_type,target_id,details)
  values('score.ball_recorded','fixture',v_fixture.id,
    jsonb_build_object('innings_id',p_innings_id,'event_id',v_event_id,'event_number',v_event_number,'operator',left(coalesce(p_admin_username,'admin'),80)));
  return v_event_id;
end;
$$;

create or replace function public.finish_admin_innings(p_innings_id uuid,p_admin_username text default 'admin')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_innings public.innings%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authorized admin session required'; end if;
  select * into v_innings from public.innings where id=p_innings_id for update;
  if not found then raise exception 'Innings not found'; end if;
  if v_innings.is_completed then raise exception 'This innings is already complete'; end if;
  update public.innings set is_completed=true,completed_at=now() where id=p_innings_id;
  insert into public.admin_logs(action,target_type,target_id,details)
  values('innings.completed','fixture',v_innings.fixture_id,
    jsonb_build_object('innings_id',p_innings_id,'operator',left(coalesce(p_admin_username,'admin'),80)));
  return p_innings_id;
end;
$$;

create or replace function public.undo_admin_ball_event(p_innings_id uuid,p_admin_username text default 'admin')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_innings public.innings%rowtype;
  v_event public.ball_events%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authorized admin session required'; end if;
  select * into v_innings from public.innings where id=p_innings_id for update;
  if not found then raise exception 'Innings not found'; end if;
  select * into v_event from public.ball_events where innings_id=p_innings_id order by event_number desc limit 1 for update;
  if not found then raise exception 'There is no ball to undo'; end if;
  delete from public.ball_events where id=v_event.id;
  update public.innings
  set total_runs=coalesce((select sum(batter_runs+extra_runs) from public.ball_events where innings_id=p_innings_id),0),
      wickets=coalesce((select count(*) from public.ball_events where innings_id=p_innings_id and is_wicket),0),
      legal_balls=coalesce((select count(*) from public.ball_events where innings_id=p_innings_id and is_legal_ball),0),
      is_completed=false,
      completed_at=null
  where id=p_innings_id;
  insert into public.admin_logs(action,target_type,target_id,details)
  values('score.ball_undone','fixture',v_innings.fixture_id,
    jsonb_build_object('innings_id',p_innings_id,'event_id',v_event.id,'operator',left(coalesce(p_admin_username,'admin'),80)));
  return v_event.id;
end;
$$;

create or replace function public.complete_admin_match(p_fixture_id uuid,p_admin_username text default 'admin')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authorized admin session required'; end if;
  perform 1 from public.fixtures where id=p_fixture_id and status::text='live' for update;
  if not found then raise exception 'Live fixture not found'; end if;
  if (select count(*) from public.innings where fixture_id=p_fixture_id)<>2
    or exists(select 1 from public.innings where fixture_id=p_fixture_id and not is_completed) then
    raise exception 'Complete both innings before completing the match';
  end if;
  update public.fixtures set status='completed',completed_at=now() where id=p_fixture_id;
  insert into public.admin_logs(action,target_type,target_id,details)
  values('match.completed','fixture',p_fixture_id,
    jsonb_build_object('operator',left(coalesce(p_admin_username,'admin'),80)));
  return p_fixture_id;
end;
$$;

revoke all on function public.start_admin_innings(uuid, uuid, text) from public;
revoke all on function public.record_admin_ball_event(uuid,uuid,uuid,integer,text,integer,boolean,text,text) from public;
revoke all on function public.finish_admin_innings(uuid,text) from public;
revoke all on function public.undo_admin_ball_event(uuid,text) from public;
revoke all on function public.complete_admin_match(uuid,text) from public;
grant execute on function public.start_admin_innings(uuid,uuid,text) to service_role;
grant execute on function public.record_admin_ball_event(uuid,uuid,uuid,integer,text,integer,boolean,text,text) to service_role;
grant execute on function public.finish_admin_innings(uuid,text) to service_role;
grant execute on function public.undo_admin_ball_event(uuid,text) to service_role;
grant execute on function public.complete_admin_match(uuid,text) to service_role;

alter table public.admin_tournaments
  add column if not exists format text not null default 'T20',
  add column if not exists max_teams smallint not null default 16,
  add column if not exists entry_deadline date,
  add column if not exists rules text,
  add column if not exists slug text;

create or replace function public.generate_tournament_slug(p_name text)
returns text
language sql
immutable
set search_path=''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name,'')), '[^a-z0-9]+', '-', 'g'),
      '^-+|-+$',
      '',
      'g'
    ),
    ''
  );
$$;

with slugged as (
  select id, public.generate_tournament_slug(name) as base_slug
  from public.admin_tournaments
)
update public.admin_tournaments tournament
set slug = slugged.base_slug ||
  case when count(*) over (partition by slugged.base_slug) > 1
       then '-' || substr(tournament.id::text,1,8)
       else '' end
from slugged
where tournament.id=slugged.id and tournament.slug is null;

update public.admin_tournaments
set slug=substr(id::text,1,8)
where slug is null or btrim(slug)='';

create unique index if not exists admin_tournaments_slug_uidx on public.admin_tournaments(slug);

create or replace function public.assign_tournament_slug()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_base text;
  v_slug text;
begin
  v_base := public.generate_tournament_slug(new.name);
  if v_base is null then
    v_slug := substr(new.id::text,1,8);
  else
    v_slug := v_base;
    if exists(select 1 from public.admin_tournaments where slug=v_slug and id<>new.id) then
      v_slug := v_base || '-' || substr(new.id::text,1,8);
    end if;
  end if;
  new.slug := v_slug;
  return new;
end;
$$;

drop trigger if exists admin_tournaments_assign_slug on public.admin_tournaments;
create trigger admin_tournaments_assign_slug
before insert or update of name on public.admin_tournaments
for each row execute function public.assign_tournament_slug();
alter table public.admin_tournaments
  drop constraint if exists admin_tournaments_format_check,
  add constraint admin_tournaments_format_check check (char_length(format) between 1 and 60),
  drop constraint if exists admin_tournaments_max_teams_check,
  add constraint admin_tournaments_max_teams_check check (max_teams between 2 and 64),
  drop constraint if exists admin_tournaments_rules_check,
  add constraint admin_tournaments_rules_check check (rules is null or char_length(rules) <= 4000);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.admin_tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  captain_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tournament_id,team_id)
);
create index if not exists tournament_entries_tournament_status_idx
  on public.tournament_entries(tournament_id,status,created_at);
alter table public.tournament_entries enable row level security;
revoke all on public.tournament_entries from anon,authenticated;

drop view if exists public.public_tournaments;
create view public.public_tournaments with (security_invoker = false) as
select
  tournament.id,
  tournament.slug,
  tournament.name,
  tournament.location,
  tournament.start_date,
  tournament.end_date,
  tournament.status,
  tournament.description,
  tournament.format,
  tournament.max_teams,
  tournament.entry_deadline,
  tournament.rules,
  (select count(*)::integer from public.tournament_entries entry
   where entry.tournament_id=tournament.id and entry.status='approved') as approved_teams
from public.admin_tournaments tournament
where tournament.status in ('upcoming','live','completed');
grant select on public.public_tournaments to anon,authenticated;

create or replace function public.apply_for_tournament(p_tournament_id uuid,p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tournament public.admin_tournaments%rowtype;
  v_team_name text;
  v_entry_id uuid;
  v_owner_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before applying to a tournament'; end if;
  select * into v_tournament
  from public.admin_tournaments
  where id=p_tournament_id and status='upcoming'
    and (entry_deadline is null or entry_deadline>=current_date)
    and start_date>=current_date
  for share;
  if not found then raise exception 'This tournament is not accepting applications'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tournament-entries:' || p_tournament_id::text));
  select name into v_team_name
  from public.teams
  where id=p_team_id and captain_id=v_user_id and status::text='approved' and deleted_at is null;
  if v_team_name is null then raise exception 'Only the captain of an approved team can apply'; end if;
  if (select count(*) from public.tournament_entries where tournament_id=p_tournament_id and status in ('pending','approved')) >= v_tournament.max_teams then
    raise exception 'This tournament has reached its team limit';
  end if;

  insert into public.tournament_entries(tournament_id,team_id,captain_id)
  values(p_tournament_id,p_team_id,v_user_id)
  returning id into v_entry_id;

  for v_owner_id in select id from public.profiles where owner_role='owner'
  loop
    insert into public.owner_notifications(owner_id,team_id,title,body)
    values(v_owner_id,p_team_id,'NEW TOURNAMENT ENTRY REQUEST',
      v_team_name || ' applied to ' || v_tournament.name || '.');
  end loop;
  return v_entry_id;
end;
$$;

create or replace function public.get_my_tournament_entries()
returns table(tournament_id uuid,team_id uuid,status text,rejection_reason text,created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select entry.tournament_id,entry.team_id,entry.status,entry.rejection_reason,entry.created_at
  from public.tournament_entries entry
  where entry.captain_id=auth.uid()
$$;
revoke all on function public.apply_for_tournament(uuid,uuid) from public;
revoke all on function public.get_my_tournament_entries() from public;
grant execute on function public.apply_for_tournament(uuid,uuid) to authenticated;
grant execute on function public.get_my_tournament_entries() to authenticated;

create or replace function public.review_tournament_entry(
  p_entry_id uuid,
  p_status text,
  p_rejection_reason text default null,
  p_operator text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.tournament_entries%rowtype;
  v_tournament public.admin_tournaments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason,'')),'');
  v_owner_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_owner() and not public.is_admin() then
    raise exception 'Tournament administrator access required';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Select approve or reject'; end if;
  if p_status='rejected' and (v_reason is null or char_length(v_reason)>1000) then
    raise exception 'A rejection reason between 1 and 1000 characters is required';
  end if;

  select * into v_entry from public.tournament_entries where id=p_entry_id;
  if not found then raise exception 'Tournament entry not found'; end if;
  select * into v_tournament from public.admin_tournaments where id=v_entry.tournament_id for update;
  select * into v_entry from public.tournament_entries where id=p_entry_id for update;
  if v_entry.status<>'pending' then raise exception 'This tournament entry has already been reviewed'; end if;
  if p_status='approved' and (
    select count(*) from public.tournament_entries
    where tournament_id=v_entry.tournament_id and status='approved'
  ) >= v_tournament.max_teams then
    raise exception 'This tournament has reached its team limit';
  end if;

  update public.tournament_entries
  set status=p_status,rejection_reason=case when p_status='rejected' then v_reason else null end,reviewed_at=now()
  where id=p_entry_id;
  insert into public.notifications(user_id,title,body)
  values(
    v_entry.captain_id,
    case when p_status='approved' then 'Tournament entry approved' else 'Tournament entry rejected' end,
    case when p_status='approved' then v_tournament.name || ' accepted your team.'
      else v_tournament.name || ' did not accept your team: ' || v_reason end
  );
  insert into public.admin_logs(action,target_type,target_id,details)
  values('tournament.entry.' || p_status,'tournament_entry',p_entry_id,
    jsonb_build_object(
      'tournament_id',v_entry.tournament_id,
      'team_id',v_entry.team_id,
      'actor_id',auth.uid(),
      'operator',case when coalesce(auth.role(),'')='service_role' then left(coalesce(p_operator,'admin'),80) else 'authenticated-user' end
    ));

  select id into v_owner_id from public.profiles where owner_role='owner' limit 1;
  if v_owner_id is not null then
    insert into public.owner_audit_logs(owner_id,action,team_id,details)
    values(v_owner_id,'tournament.entry.' || p_status,v_entry.team_id,
      jsonb_build_object(
        'tournament_id',v_entry.tournament_id,
        'entry_id',p_entry_id,
        'actor_id',auth.uid(),
        'operator',case when coalesce(auth.role(),'')='service_role' then left(coalesce(p_operator,'admin'),80) else 'authenticated-user' end
      ));
  end if;
  return p_entry_id;
end;
$$;
revoke all on function public.review_tournament_entry(uuid,text,text,text) from public;
grant execute on function public.review_tournament_entry(uuid,text,text,text) to authenticated,service_role;

do $$
declare
  v_table text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach v_table in array array['match_invitations','fixtures','innings','ball_events','notifications','messages'] loop
      if not exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;
