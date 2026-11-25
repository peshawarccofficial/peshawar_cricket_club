-- Remove the legacy public password-hash approval path.
-- Team review is now restricted to owner_review_team and the OWNER role.
begin;

drop function if exists public.owner_review_team_admin(uuid,text,text,text);
delete from public.application_settings where key='private_admin_password_sha256';
drop policy if exists "admin updates teams" on public.teams;
drop policy if exists "captain updates own team or admin" on public.teams;

commit;
