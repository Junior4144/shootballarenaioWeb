create or replace function admin_private.current_access(p_environment text) returns jsonb
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
  -- The verified primary admin explicitly opted out of the authenticator step.
  -- Match the immutable user ID and current verified email, never JWT user_metadata.
  if not exists (select 1 from auth.users where id=caller
      and id='fb3c5889-48a5-4328-8290-e97ffe3f0bf9'::uuid
      and lower(email)='gbjunior014@gmail.com' and email_confirmed_at is not null)
    and (coalesce(claims->>'aal','aal1') <> 'aal2' or not exists
    (select 1 from auth.mfa_factors where user_id=caller and status='verified')) then
    return jsonb_build_object('status', 'mfa-required');
  end if;
  return jsonb_build_object('status','allowed','userId',caller,'roles',membership.roles,'environment',p_environment);
end;
$$;
revoke all on function admin_private.current_access(text) from public, anon, authenticated, service_role;
grant execute on function admin_private.current_access(text) to authenticated;

