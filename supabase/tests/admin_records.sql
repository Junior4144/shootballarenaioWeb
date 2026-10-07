-- Authorization and projection checks. Test session and revocation roll back.
begin;
do $$
declare
  primary_id uuid := 'fb3c5889-48a5-4328-8290-e97ffe3f0bf9';
  test_session uuid := gen_random_uuid();
  result jsonb;
  v text;
begin
  if has_function_privilege('anon','public.admin_records(text,text,text,integer)','execute') then raise exception 'Anonymous execute grant'; end if;
  if has_table_privilege('authenticated','admin_private.memberships','select') then raise exception 'Direct table exposure'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.admin_records('production','accounts'); raise exception 'Anonymous caller allowed'; exception when insufficient_privilege then null; end;
  insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
    values(test_session,primary_id,now(),now(),'aal1',now()+interval '5 minutes');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',primary_id,'session_id',test_session,'role','authenticated','aal','aal1')::text,true);
  foreach v in array array['accounts','activity','memberships'] loop
    result:=public.admin_records('production',v);
    if jsonb_typeof(result->'rows')<>'array' or (result->>'limit')::integer<>50 then raise exception 'Invalid page contract'; end if;
    if result::text like '%encrypted_password%' or result::text like '%refresh_token%' then raise exception 'Credential projection leak'; end if;
  end loop;
  if jsonb_array_length(public.admin_records('production','accounts','no-such-display-name-7c9b')->'rows')<>0 then raise exception 'Search ignored'; end if;
  begin perform public.admin_records('local','accounts'); raise exception 'Wrong environment allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_records('production','accounts','',-1); raise exception 'Negative offset allowed'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_records('production','unsupported'); raise exception 'Unknown view allowed'; exception when invalid_parameter_value then null; end;
  update admin_private.memberships set revoked_at=now() where user_id=primary_id;
  begin perform public.admin_records('production','accounts'); raise exception 'Revoked caller allowed'; exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'Admin record checks passed; test state rolled back' as result;
