-- Run after owner-control-center-migration.sql in the Supabase SQL Editor.
begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.admin_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 100),
  location text check (location is null or char_length(location) <= 120),
  start_date date not null,
  end_date date not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'live', 'completed', 'cancelled')),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.admin_tournaments enable row level security;
create index if not exists admin_tournaments_dates_idx
  on public.admin_tournaments(start_date, status);

alter table public.players
  add column if not exists roster_number smallint;

with numbered_players as (
  select id, row_number() over (partition by team_id order by created_at, id) as roster_number
  from public.players
)
update public.players p
set roster_number = numbered_players.roster_number
from numbered_players
where p.id = numbered_players.id
  and p.roster_number is null;

alter table public.players
  alter column roster_number set not null;

create unique index if not exists players_team_roster_number_uidx
  on public.players(team_id, roster_number);

create or replace function public.assign_player_roster_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.team_id is distinct from old.team_id then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.team_id::text));
    select coalesce(max(p.roster_number), 0) + 1
      into new.roster_number
    from public.players p
    where p.team_id = new.team_id;
  end if;
  return new;
end;
$$;

drop trigger if exists players_assign_roster_number on public.players;
create trigger players_assign_roster_number
before insert or update of team_id on public.players
for each row execute function public.assign_player_roster_number();

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_username text not null,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_push_subscriptions enable row level security;
create index if not exists admin_push_subscriptions_owner_idx
  on public.admin_push_subscriptions(owner_username);

alter table public.owner_notifications
  add column if not exists push_delivered_at timestamptz;

create or replace function public.dispatch_owner_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'pcc_admin_push_secret'
  order by created_at desc
  limit 1;

  if v_secret is null or v_secret = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://peshawarcricketclub.com/api/admin/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('notificationId', new.id),
    timeout_milliseconds := 2000
  );
  return new;
end;
$$;

drop trigger if exists owner_notification_push on public.owner_notifications;
create trigger owner_notification_push
after insert on public.owner_notifications
for each row execute function public.dispatch_owner_notification_push();

commit;
