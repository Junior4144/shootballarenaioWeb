-- Admin data stays outside the exposed API schemas. Runtime uses the caller's JWT,
-- never a service-role key. The public invoker wrapper exposes only self-access.
create schema if not exists admin_private;
revoke all on schema admin_private from public, anon, authenticated;
grant usage on schema admin_private to authenticated;

create table admin_private.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  roles text[] not null check (cardinality(roles) > 0 and roles <@ array['viewer','analyst','operator','config-editor','config-publisher','owner']::text[]),
  environments text[] not null check (cardinality(environments) > 0 and environments <@ array['local','gcp-test','production']::text[]),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null check (length(reason) between 8 and 500)
);
alter table admin_private.memberships enable row level security;
revoke all on admin_private.memberships from public, anon, authenticated, service_role;

create table admin_private.access_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  subject_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  database_role text not null
);
alter table admin_private.access_audit enable row level security;
revoke all on admin_private.access_audit from public, anon, authenticated, service_role;
revoke all on all sequences in schema admin_private from public, anon, authenticated, service_role;

create function admin_private.audit_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into admin_private.access_audit(actor_id, subject_id, action, old_value, new_value, database_role)
  values (auth.uid(), coalesce(new.user_id, old.user_id), tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end, session_user);
  return coalesce(new, old);
end;
$$;
revoke all on function admin_private.audit_membership() from public, anon, authenticated, service_role;
create trigger audit_membership after insert or update or delete on admin_private.memberships
for each row execute function admin_private.audit_membership();

create function admin_private.current_access(p_environment text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  membership admin_private.memberships%rowtype;
  caller uuid := auth.uid();
  claims jsonb := auth.jwt();
begin
  if caller is null or p_environment not in ('local','gcp-test','production') then
    return jsonb_build_object('status', 'denied');
  end if;
  -- Immediate logout/revocation enforcement, including tokens not yet expired.
  if not exists (select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id::text=claims->>'session_id' and s.user_id=caller
      and (s.not_after is null or s.not_after > now())
      and (u.banned_until is null or u.banned_until < now())) then
    return jsonb_build_object('status', 'denied');
  end if;
  select * into membership from admin_private.memberships
    where user_id=caller and revoked_at is null and p_environment=any(environments);
  if not found then return jsonb_build_object('status', 'denied'); end if;
  if coalesce(claims->>'aal','aal1') <> 'aal2' or not exists
    (select 1 from auth.mfa_factors where user_id=caller and status='verified') then
    return jsonb_build_object('status', 'mfa-required');
  end if;
  return jsonb_build_object('status','allowed','userId',caller,'roles',membership.roles,'environment',p_environment);
end;
$$;
revoke all on function admin_private.current_access(text) from public, anon, authenticated, service_role;
grant execute on function admin_private.current_access(text) to authenticated;

create function public.admin_access(p_environment text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select admin_private.current_access(p_environment);
$$;
revoke all on function public.admin_access(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_access(text) to authenticated;
