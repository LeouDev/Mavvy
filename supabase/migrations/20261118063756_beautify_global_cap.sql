-- Global daily cap across all users: a circuit breaker on the AI bill, since anonymous
-- accounts can be farmed to get more per-user allowances.

create index beautify_usage_day_idx on public.beautify_usage (day);

-- Non-destructive: this 4-argument version is an overload next to the old 3-argument boolean one,
-- which stays (unused, service_role-only, harmless). supabase-js rpc with named params
-- { p_user, p_day, p_limit, p_global_limit } resolves only to this version.
-- A later cleanup migration can remove the old 3-argument version.

-- 'ok' | 'user_limit' | 'global_limit'. One transaction-level advisory lock serializes reservations,
-- so the global total can't be overshot by concurrent requests.
create function public.beautify_reserve(p_user uuid, p_day date, p_limit integer, p_global_limit integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(7311001); -- fixed key: "beautify reserve"

  if (select coalesce(sum(count), 0) from public.beautify_usage where day = p_day) >= p_global_limit then
    return 'global_limit';
  end if;

  insert into public.beautify_usage as u (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;

  if n > p_limit then
    update public.beautify_usage set count = count - 1 where user_id = p_user and day = p_day;
    return 'user_limit';
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.beautify_reserve(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.beautify_reserve(uuid, date, integer, integer) to service_role;
