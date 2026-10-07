begin;
do $$
declare
  primary_id uuid := 'fb3c5889-48a5-4328-8290-e97ffe3f0bf9';
  session_id uuid := gen_random_uuid();
  boot uuid := gen_random_uuid();
  visitor uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  collector text := repeat('b',64);
  stamp timestamptz := date_trunc('minute',now());
  result jsonb;
  point jsonb;
  sample jsonb;
  views_before integer;
begin
  if has_table_privilege('anon','admin_private.traffic_samples','select') or has_table_privilege('authenticated','admin_private.website_events','select') then raise exception 'Private traffic table exposed'; end if;
  if has_function_privilege('anon','public.admin_traffic_history(text,text,text)','execute') then raise exception 'Public history read grant'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.admin_traffic_history('production'); raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.record_game_traffic('wrong','{}'); raise exception 'Unauthenticated collector allowed'; exception when insufficient_privilege then null; end;
  insert into admin_private.traffic_writers values('game-primary',encode(sha256(convert_to(collector,'UTF8')),'hex'),true)
    on conflict(id) do update set token_hash=excluded.token_hash,enabled=true;
  -- Isolate fixture minutes in this transaction; all changes roll back.
  delete from admin_private.traffic_samples where sampled_at>=stamp-interval '3 minutes';
  sample := jsonb_build_object('at',stamp-interval '2 minutes','bootId',boot,'players',3,'guests',2,'accounts',1,'rooms',1,'joins',4,'completed',0,'uptime',30);
  perform public.record_game_traffic(collector,sample);
  perform public.record_game_traffic(collector,sample);
  if (select count(*) from admin_private.traffic_samples where sampled_at=stamp-interval '2 minutes')<>1 then raise exception 'Duplicate sample counted'; end if;
  sample:=sample||jsonb_build_object('at',stamp-interval '1 minute','joins',6,'uptime',90);
  perform public.record_game_traffic(collector,sample);
  if (select joins from admin_private.traffic_samples where sampled_at=stamp-interval '1 minute')<>2 then raise exception 'Incorrect counter delta'; end if;
  sample:=sample||jsonb_build_object('at',stamp,'bootId',gen_random_uuid(),'joins',1,'uptime',20);
  perform public.record_game_traffic(collector,sample);
  if (select joins from admin_private.traffic_samples where sampled_at=stamp)<>1 then raise exception 'Restart miscounted'; end if;
  insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after) values(session_id,primary_id,now(),now(),'aal1',now()+interval '5 minutes');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',primary_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true);
  result:=public.admin_traffic_history('production','1h','game');
  if jsonb_array_length(result->'current')<>60 or jsonb_array_length(result->'previous')<>60 then raise exception 'Incorrect comparison intervals'; end if;
  point:=result->'current'->59;
  if (point->>'players')::numeric<>3 or (point->>'joins')::integer<>2 then raise exception 'Incorrect aggregation'; end if;
  result:=public.admin_traffic_history('production','30d','game');
  if jsonb_array_length(result->'current')<>120 then raise exception 'Unbounded range'; end if;
  begin perform public.admin_traffic_history('production','all','game'); raise exception 'Unbounded range accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_traffic_history('local'); raise exception 'Wrong environment allowed'; exception when insufficient_privilege then null; end;
  select coalesce(sum(views),0) into views_before from admin_private.website_minutes where sampled_at=stamp;
  perform public.record_website_visit(event_id,visitor);
  perform public.record_website_visit(event_id,visitor);
  perform public.record_website_visit(gen_random_uuid(),visitor);
  if (select views from admin_private.website_minutes where sampled_at=stamp)<>views_before+2 then raise exception 'Website event deduplication failed'; end if;
  if (select count(*) from admin_private.website_sessions where id=visitor)<>1 then raise exception 'Session duplicated'; end if;
  result:=public.admin_traffic_history('production','24h','website');
  if result->>'source'<>'website' or jsonb_array_length(result->'current')<>96 then raise exception 'Website history missing'; end if;
  if result::text like '%'||visitor::text||'%' then raise exception 'Session identifier leaked'; end if;
  update admin_private.memberships set revoked_at=now() where user_id=primary_id;
  begin perform public.admin_traffic_history('production'); raise exception 'Revoked admin allowed'; exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'Traffic history checks passed; fixtures rolled back' as result;
