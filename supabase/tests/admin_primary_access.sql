-- Hosted authorization regression. All test state is rolled back.
begin;
do $$
declare
  primary_id uuid := 'fb3c5889-48a5-4328-8290-e97ffe3f0bf9';
  test_session uuid := gen_random_uuid();
  access jsonb;
begin
  insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
    values(test_session,primary_id,now(),now(),'aal1',now()+interval '5 minutes');
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',primary_id,'session_id',test_session,'role','authenticated','aal','aal1')::text,true);
  access := public.admin_access('production');
  if access->>'status' <> 'allowed' or access->>'userId' <> primary_id::text then
    raise exception 'Verified primary admin must be allowed without MFA: %',access;
  end if;
  if public.admin_access('gcp-test')->>'status' <> 'denied' then
    raise exception 'Environment restrictions must remain enforced';
  end if;
  update admin_private.memberships set revoked_at=now() where user_id=primary_id;
  if public.admin_access('production')->>'status' <> 'denied' then
    raise exception 'Revoked membership must be denied';
  end if;
  update admin_private.memberships set revoked_at=null where user_id=primary_id;
  update auth.sessions set not_after=now()-interval '1 minute' where id=test_session;
  if public.admin_access('production')->>'status' <> 'denied' then
    raise exception 'Expired session must be denied';
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',gen_random_uuid(),'session_id',test_session,'aal','aal1',
    'email','gbjunior014@gmail.com','user_metadata',jsonb_build_object('email','gbjunior014@gmail.com'))::text,true);
  if public.admin_access('production')->>'status' <> 'denied' then
    raise exception 'Spoofed email claims must not grant admin access';
  end if;
end;
$$;
rollback;
select 'Primary admin AAL1 access, environment restriction, revocation, expired session and spoofed identity checks passed; test state rolled back' as result;
