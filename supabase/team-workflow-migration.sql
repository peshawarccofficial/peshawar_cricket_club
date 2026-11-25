-- Team registration and approval workflow.
-- Run in the Supabase SQL Editor for an existing installation.
begin;

drop policy if exists "captain creates pending team" on public.teams;
drop policy if exists "captain updates own team or admin" on public.teams;
drop policy if exists "admin updates teams" on public.teams;

create or replace function public.register_team(
  p_name text,
  p_area text,
  p_players jsonb
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
  v_player jsonb;
  v_player_name text;
  v_role text;
  v_team_id uuid;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Sign in before registering a team';
  end if;

  if char_length(v_name) not between 3 and 60 then
    raise exception 'Team name must be between 3 and 60 characters';
  end if;

  if char_length(v_area) not between 2 and 80 then
    raise exception 'Area must be between 2 and 80 characters';
  end if;

  if jsonb_typeof(p_players) is distinct from 'array' then
    raise exception 'Players must be provided as a list';
  end if;
  if jsonb_array_length(p_players) not between 8 and 12 then
    raise exception 'A team must register between 8 and 12 players';
  end if;

  for v_player in select value from jsonb_array_elements(p_players)
  loop
    if jsonb_typeof(v_player) <> 'object' then
      raise exception 'Each player must have a name and playing role';
    end if;
    v_player_name := btrim(coalesce(v_player->>'full_name', ''));
    v_role := v_player->>'playing_role';
    if char_length(v_player_name) not between 2 and 80 then
      raise exception 'Each player name must be between 2 and 80 characters';
    end if;
    if v_role is null or v_role not in (
      'Batsman', 'Bowler', 'All-rounder', 'Batting All-rounder',
      'Bowling All-rounder', 'Wicketkeeper'
    ) then
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

  v_slug :=
    coalesce(
      nullif(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), ''),
      'team'
    ) || '-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.teams (name, slug, area, captain_id, status)
  values (v_name, v_slug, v_area, v_user_id, 'pending')
  returning id into v_team_id;

  insert into public.players (team_id, full_name, playing_role, is_captain)
  select
    v_team_id,
    btrim(player.value->>'full_name'),
    player.value->>'playing_role',
    player.ordinality = 1
  from jsonb_array_elements(p_players) with ordinality as player(value, ordinality);

  return v_team_id;
end;
$$;

revoke all on function public.register_team(text, text, jsonb) from public;
grant execute on function public.register_team(text, text, jsonb) to authenticated;

commit;
