-- Public indicative buy quotes only. Never store TER sessions/account data here.
begin;
create table if not exists public.price_observations (
  id bigint generated always as identity primary key,
  price numeric(18,6) not null check (price > 0),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  check (observed_at <= received_at + interval '1 minute')
);
create index if not exists price_observations_time on public.price_observations (observed_at desc);
alter table public.price_observations enable row level security;
revoke all on public.price_observations from anon, authenticated;
grant select on public.price_observations to anon, authenticated;
drop policy if exists "Public price reads" on public.price_observations;
create policy "Public price reads" on public.price_observations for select to anon, authenticated using (true);
grant all on public.price_observations to service_role;
grant usage, select on sequence public.price_observations_id_seq to service_role;
-- Fixed ranges and buckets avoid silently truncating history at the REST row limit.
create or replace function public.price_history(range_days integer default 1)
returns table (bucket timestamptz, price numeric, low numeric, high numeric, samples bigint)
language sql stable security invoker set search_path = public
as $$
  select date_bin(case when range_days = 1 then interval '5 minutes'
                      when range_days = 7 then interval '30 minutes'
                      else interval '2 hours' end, observed_at, timestamptz '2000-01-01'),
         avg(price), min(price), max(price), count(*)
  from public.price_observations
  where range_days in (1,7,30) and observed_at >= now() - make_interval(days => least(greatest(range_days,1),30))
  group by 1 order by 1
$$;
revoke all on function public.price_history(integer) from public;
grant execute on function public.price_history(integer) to anon, authenticated, service_role;
commit;
