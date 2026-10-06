create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$')
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
