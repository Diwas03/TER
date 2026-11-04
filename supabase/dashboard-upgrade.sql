-- Run add-sell-price.sql first if the sell_price column is not present.
begin;
-- Add buy/sell history without replacing the existing history function.
create or replace function public.price_history_side(range_days integer default 1, quote_side text default 'buy')
returns table (bucket timestamptz, price numeric, low numeric, high numeric, samples bigint)
language sql stable security invoker set search_path = public
as $$
  select date_bin(case when range_days = 1 then interval '5 minutes'
                      when range_days = 7 then interval '30 minutes'
                      else interval '2 hours' end, observed_at, timestamptz '2000-01-01'),
         avg(value), min(value), max(value), count(*)
  from (select observed_at, case when quote_side = 'buy' then price else sell_price end as value
        from public.price_observations
        where quote_side in ('buy','sell') and range_days in (1,7,30)
        and observed_at >= now() - make_interval(days => least(greatest(range_days,1),30))) quotes
  where value is not null
  group by 1 order by 1
$$;
revoke all on function public.price_history_side(integer,text) from public;
grant execute on function public.price_history_side(integer,text) to anon, authenticated, service_role;

-- Broadcast only public price observations; never publish private subscriptions.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                 and schemaname = 'public' and tablename = 'price_observations') then
    alter publication supabase_realtime add table public.price_observations;
  end if;
end $$;

commit;
