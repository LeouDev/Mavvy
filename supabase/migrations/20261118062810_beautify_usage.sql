-- Per-user daily beautify counter. Only the beautify Edge Function (service role) touches it.

create table public.beautify_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- RLS on with no policies: anon/authenticated clients can't read or write rows.
alter table public.beautify_usage enable row level security;
revoke all on table public.beautify_usage from anon, authenticated;

-- Atomically take one beautify for (user, day). Returns false (and changes nothing) once the limit is reached.
create or replace function public.beautify_reserve(p_user uuid, p_day date, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.beautify_usage as u (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;

  if n > p_limit then
    update public.beautify_usage set count = count - 1 where user_id = p_user and day = p_day;
    return false;
  end if;
  return true;
end;
$$;

-- Give the reservation back when the upstream call fails, so errors don't eat the daily allowance.
create or replace function public.beautify_refund(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.beautify_usage set count = greatest(count - 1, 0) where user_id = p_user and day = p_day;
$$;

-- Clients must not call these (a client calling refund could reset its own limit).
revoke execute on function public.beautify_reserve(uuid, date, integer) from public, anon, authenticated;
revoke execute on function public.beautify_refund(uuid, date) from public, anon, authenticated;
grant execute on function public.beautify_reserve(uuid, date, integer) to service_role;
grant execute on function public.beautify_refund(uuid, date) to service_role;
