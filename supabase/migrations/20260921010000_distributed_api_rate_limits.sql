-- Shared, atomic quota storage for Vercel/serverless API routes. Clients have
-- no table access; the authenticated RPC derives its owner from auth.uid().
create table if not exists public.api_rate_limits (
  scope text not null check (scope in ('ai-chat', 'parse-workout', 'parse-food')),
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, user_id)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_window_started_at timestamptz;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_limit := case p_scope
    when 'ai-chat' then 20
    when 'parse-workout' then 15
    when 'parse-food' then 10
    else null
  end;
  if v_limit is null then
    raise exception 'invalid rate-limit scope' using errcode = '22023';
  end if;

  insert into public.api_rate_limits as quota (scope, user_id, window_started_at, request_count, updated_at)
  values (p_scope, v_user, v_now, 1, v_now)
  on conflict (scope, user_id) do update set
    request_count = case
      when quota.window_started_at <= v_now - interval '60 seconds' then 1
      else quota.request_count + 1
    end,
    window_started_at = case
      when quota.window_started_at <= v_now - interval '60 seconds' then v_now
      else quota.window_started_at
    end,
    updated_at = v_now
  returning request_count, window_started_at into v_count, v_window_started_at;

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_window_started_at + interval '60 seconds' - v_now))))::integer
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(text) from public, anon;
grant execute on function public.consume_api_rate_limit(text) to authenticated;
