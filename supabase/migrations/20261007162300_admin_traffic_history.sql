-- Aggregate game activity only. No player identifiers, IP addresses or emails.
create table admin_private.traffic_writers (
  id text primary key check (id = 'game-primary'),
  token_hash text not null check (length(token_hash)=64),
  enabled boolean not null default true
);
create table admin_private.traffic_samples (
  sampled_at timestamptz primary key,
  boot_id uuid not null,
  players integer not null check(players between 0 and 100000),
  guests integer not null check(guests between 0 and 100000),
  accounts integer not null check(accounts between 0 and 100000),
  rooms integer not null check(rooms between 0 and 10000),
  joins_total bigint not null check(joins_total between 0 and 1000000000),
  completed_total bigint not null check(completed_total between 0 and 1000000000),
  joins bigint,
  completed bigint,
  check(players=guests+accounts)
);
alter table admin_private.traffic_writers enable row level security;
alter table admin_private.traffic_samples enable row level security;
revoke all on admin_private.traffic_writers, admin_private.traffic_samples from public, anon, authenticated, service_role;

-- A dedicated write-only credential, stored only as a SHA-256 hash. It grants
-- neither directory reads nor arbitrary database writes. Provision separately.
create function admin_private.record_traffic(p_token text, p_sample jsonb) returns void
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
  writer admin_private.traffic_writers%rowtype;
  previous admin_private.traffic_samples%rowtype;
  stamp timestamptz;
  boot uuid;
  joins_count bigint;
  completed_count bigint;
  joins_delta bigint;
  completed_delta bigint;
begin
  if p_token is null or length(p_token)<>64 then raise insufficient_privilege using message='Collector access required'; end if;
  select * into writer from admin_private.traffic_writers where id='game-primary' and enabled
    and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found then raise insufficient_privilege using message='Collector access required'; end if;
  if p_sample is null or jsonb_typeof(p_sample)<>'object' or not (p_sample ?& array['at','bootId','players','guests','accounts','rooms','joins','completed','uptime']) then
    raise invalid_parameter_value using message='Invalid traffic sample';
  end if;
  stamp := date_trunc('minute',(p_sample->>'at')::timestamptz);
  boot := (p_sample->>'bootId')::uuid;
  joins_count := (p_sample->>'joins')::bigint;
  completed_count := (p_sample->>'completed')::bigint;
  if stamp is null or stamp < now()-interval '5 minutes' or stamp > now()+interval '1 minute'
    or (p_sample->>'uptime')::numeric < 0 then
    raise invalid_parameter_value using message='Invalid sample time';
  end if;
  -- Retries are idempotent. A single deployed source owns each UTC minute.
  if exists(select 1 from admin_private.traffic_samples where sampled_at=stamp) then return; end if;
  select * into previous from admin_private.traffic_samples order by sampled_at desc limit 1;
  if previous.sampled_at > stamp then raise invalid_parameter_value using message='Out-of-order sample'; end if;
  if previous.boot_id=boot and previous.sampled_at >= stamp-interval '2 minutes' then
    if joins_count < previous.joins_total or completed_count < previous.completed_total then
      raise invalid_parameter_value using message='Counters decreased without a restart';
    end if;
    joins_delta := joins_count-previous.joins_total;
    completed_delta := completed_count-previous.completed_total;
  elsif (p_sample->>'uptime')::numeric <= 90 then
    joins_delta := joins_count;
    completed_delta := completed_count;
  end if;
  insert into admin_private.traffic_samples values(stamp,boot,
    (p_sample->>'players')::integer,(p_sample->>'guests')::integer,(p_sample->>'accounts')::integer,
    (p_sample->>'rooms')::integer,joins_count,completed_count,joins_delta,completed_delta);
  -- 62 days cover both halves of the 30-day comparison. Indexed bounded prune.
  delete from admin_private.traffic_samples where sampled_at < now()-interval '62 days';
end;
$$;
revoke all on function admin_private.record_traffic(text,jsonb) from public, anon, authenticated, service_role;
grant usage on schema admin_private to anon;
grant execute on function admin_private.record_traffic(text,jsonb) to anon;
create function public.record_game_traffic(p_token text, p_sample jsonb) returns void
language sql security invoker set search_path='' as $$ select admin_private.record_traffic(p_token,p_sample); $$;
revoke all on function public.record_game_traffic(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_game_traffic(text,jsonb) to anon;

create table admin_private.website_minutes (
  sampled_at timestamptz primary key, views integer not null default 0, sessions integer not null default 0
);
create table admin_private.website_events (id uuid primary key, session_id uuid not null, at timestamptz not null default now());
create index website_events_at_idx on admin_private.website_events(at);
create index website_events_session_idx on admin_private.website_events(session_id,at);
create table admin_private.website_sessions (id uuid primary key, at timestamptz not null default now());
create index website_sessions_at_idx on admin_private.website_sessions(at);
create table admin_private.website_collection (id boolean primary key default true check(id), started_at timestamptz not null);
alter table admin_private.website_minutes enable row level security;
alter table admin_private.website_events enable row level security;
alter table admin_private.website_sessions enable row level security;
alter table admin_private.website_collection enable row level security;
revoke all on admin_private.website_minutes,admin_private.website_events,admin_private.website_sessions,admin_private.website_collection from public,anon,authenticated,service_role;
-- Intentionally public, write-only analytics endpoint. DB timestamps, UUID-only
-- payload, idempotency and per-session/minute bounds limit accidental inflation.
create function admin_private.record_visit(p_event uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare
  stamp timestamptz := date_trunc('minute',now());
  inserted integer;
  new_session integer;
begin
  if p_event is null or p_session is null then raise invalid_parameter_value using message='Invalid visit'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session::text,0));
  if (select count(*) from admin_private.website_events where session_id=p_session and at>=stamp)>=20 then return; end if;
  insert into admin_private.website_events(id,session_id) values(p_event,p_session) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted=0 then return; end if;
  insert into admin_private.website_sessions(id) values(p_session) on conflict do nothing;
  get diagnostics new_session = row_count;
  insert into admin_private.website_minutes values(stamp,1,new_session)
    on conflict(sampled_at) do update set views=admin_private.website_minutes.views+1,sessions=admin_private.website_minutes.sessions+excluded.sessions;
  insert into admin_private.website_collection values(true,stamp) on conflict do nothing;
  delete from admin_private.website_events where at<now()-interval '2 days';
  delete from admin_private.website_sessions where at<now()-interval '2 days';
  delete from admin_private.website_minutes where sampled_at<now()-interval '62 days';
end;
$$;
revoke all on function admin_private.record_visit(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function admin_private.record_visit(uuid,uuid) to anon;
create function public.record_website_visit(p_event uuid,p_session uuid) returns void
language sql security invoker set search_path='' as $$ select admin_private.record_visit(p_event,p_session); $$;
revoke all on function public.record_website_visit(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_website_visit(uuid,uuid) to anon;

create function admin_private.read_traffic(p_environment text, p_range text, p_source text) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare
  seconds integer;
  bucket integer;
  ending timestamptz := date_trunc('minute',now());
  result jsonb;
  started timestamptz;
begin
  if auth.uid() is null or p_environment is distinct from 'production'
    or admin_private.current_access(p_environment)->>'status' is distinct from 'allowed' then
    raise insufficient_privilege using message='Administrator access required';
  end if;
  case p_range
    when '1h' then seconds:=3600; bucket:=60;
    when '24h' then seconds:=86400; bucket:=900;
    when '7d' then seconds:=604800; bucket:=3600;
    when '30d' then seconds:=2592000; bucket:=21600;
    else raise invalid_parameter_value using message='Invalid traffic range';
  end case;
  if p_source is null or p_source not in ('game','website') then raise invalid_parameter_value using message='Invalid traffic source'; end if;
  if p_source='website' then
    select started_at into started from admin_private.website_collection where id;
    with buckets as (
      select stamp,case when stamp>=ending-make_interval(secs=>seconds) then 'current' else 'previous' end as period
      from generate_series(ending-make_interval(secs=>seconds*2),ending-make_interval(secs=>bucket),make_interval(secs=>bucket)) stamp
    ), aggregated as (
      select date_bin(make_interval(secs=>bucket),sampled_at,ending) as stamp,sum(views) as views,sum(sessions) as sessions
      from admin_private.website_minutes where sampled_at>=ending-make_interval(secs=>seconds*2) and sampled_at<ending group by 1
    ), points as (
      select b.period,b.stamp,jsonb_build_object('at',b.stamp,'samples',0,'players',null,'guests',null,'accounts',null,'rooms',null,'peak',null,'joins',null,'completed',null,
        'views',case when b.stamp+make_interval(secs=>bucket)>started then coalesce(a.views,0) end,
        'sessions',case when b.stamp+make_interval(secs=>bucket)>started then coalesce(a.sessions,0) end) as point
      from buckets b left join aggregated a using(stamp)
    ) select jsonb_build_object('range',p_range,'source',p_source,'generatedAt',now(),'bucketSeconds',bucket,
      'current',jsonb_agg(point order by stamp) filter(where period='current'),
      'previous',jsonb_agg(point order by stamp) filter(where period='previous'),
      'latestSampleAt',(select max(sampled_at) from admin_private.website_minutes),'retentionDays',62) into result from points;
    return result;
  end if;
  -- End at the last complete minute. Return explicit nulls for missing buckets.
  with buckets as (
    select stamp, case when stamp >= ending-make_interval(secs=>seconds) then 'current' else 'previous' end as period
    from generate_series(ending-make_interval(secs=>seconds*2),ending-make_interval(secs=>bucket),make_interval(secs=>bucket)) stamp
  ), aggregated as (
    select date_bin(make_interval(secs=>bucket),sampled_at,ending) as stamp,
      count(*) as samples, avg(players) as players, avg(guests) as guests,
      avg(accounts) as accounts, avg(rooms) as rooms, max(players) as peak,
      sum(joins) as joins, sum(completed) as completed
    from admin_private.traffic_samples
    where sampled_at >= ending-make_interval(secs=>seconds*2) and sampled_at < ending
    group by 1
  ), points as (
    select b.period,b.stamp,jsonb_build_object('at',b.stamp,'samples',coalesce(a.samples,0),
      'players',a.players,'guests',a.guests,'accounts',a.accounts,'rooms',a.rooms,
      'peak',a.peak,'joins',a.joins,'completed',a.completed) as point
    from buckets b left join aggregated a using(stamp)
  )
  select jsonb_build_object('range',p_range,'source',p_source,'generatedAt',now(),'bucketSeconds',bucket,
    'current',jsonb_agg(point order by stamp) filter(where period='current'),
    'previous',jsonb_agg(point order by stamp) filter(where period='previous'),
    'latestSampleAt',(select max(sampled_at) from admin_private.traffic_samples),'retentionDays',62)
    into result from points;
  return result;
end;
$$;
revoke all on function admin_private.read_traffic(text,text,text) from public, anon, authenticated, service_role;
grant execute on function admin_private.read_traffic(text,text,text) to authenticated;
create function public.admin_traffic_history(p_environment text, p_range text default '24h', p_source text default 'game') returns jsonb
language sql stable security invoker set search_path='' as $$ select admin_private.read_traffic(p_environment,p_range,p_source); $$;
revoke all on function public.admin_traffic_history(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_traffic_history(text,text,text) to authenticated;
