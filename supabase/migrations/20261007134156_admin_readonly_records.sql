-- Read-only admin directory. Private implementation + invoker API wrapper.
-- Every call rechecks active session, membership, environment and MFA policy.
create function admin_private.read_records(p_environment text, p_view text, p_search text default '', p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '5s' as $$
declare
  access jsonb;
  items jsonb;
begin
  access := admin_private.current_access(p_environment);
  if auth.uid() is null or p_environment is distinct from 'production' or access->>'status' is distinct from 'allowed' then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if p_view is null or p_view not in ('accounts','activity','memberships') or p_search is null or length(p_search)>100
    or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise invalid_parameter_value using message = 'Invalid directory request';
  end if;
  if p_view='accounts' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into items from (
      select u.id, p.display_name, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null) as email_confirmed
      from auth.users u left join public.profiles p on p.id=u.id
      where not coalesce(u.is_anonymous,false)
        and (p_search='' or position(lower(p_search) in lower(u.id::text || ' ' || coalesce(p.display_name,'')))>0)
      order by u.created_at desc, u.id limit 51 offset p_offset
    ) r;
  elsif p_view='memberships' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into items from (
      select user_id, roles, environments, granted_at, revoked_at, reason
      from admin_private.memberships
      where p_environment=any(environments)
        and (p_search='' or position(lower(p_search) in lower(user_id::text || ' ' || array_to_string(roles,',')))>0)
      order by granted_at desc, user_id limit 51 offset p_offset
    ) r;
  else
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into items from (
      select id, occurred_at, actor_id, subject_id, action, old_value, new_value
      from admin_private.access_audit
      where (coalesce(old_value->'environments','[]'::jsonb) ? p_environment
        or coalesce(new_value->'environments','[]'::jsonb) ? p_environment)
        and (p_search='' or position(lower(p_search) in lower(action || ' ' || subject_id::text || ' ' || coalesce(actor_id::text,'')))>0)
      order by occurred_at desc,id desc limit 51 offset p_offset
    ) r;
  end if;
  return jsonb_build_object(
    'rows', case when jsonb_array_length(items)>50 then items-50 else items end,
    'hasMore', jsonb_array_length(items)>50, 'offset', p_offset, 'limit', 50,
    'source', case p_view when 'accounts' then 'Scoped Supabase Auth and profiles; project-wide registered accounts'
      when 'activity' then 'Private membership-change audit; production-scoped'
      else 'Private administrator memberships; production-scoped' end);
end;
$$;
revoke all on function admin_private.read_records(text,text,text,integer) from public, anon, authenticated, service_role;
grant execute on function admin_private.read_records(text,text,text,integer) to authenticated;

create function public.admin_records(p_environment text, p_view text, p_search text default '', p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select admin_private.read_records(p_environment,p_view,p_search,p_offset);
$$;
revoke all on function public.admin_records(text,text,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_records(text,text,text,integer) to authenticated;
