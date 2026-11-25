-- Apply once to an existing project to enable OAuth profiles and profile pictures.
alter table public.profiles add column if not exists avatar_url text;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
