-- Run add-sell-price.sql first if sell_price is not present. Preserves all data.
begin;
create or replace function public.price_history_window(window_hours integer default 1)
returns table (bucket timestamptz, buy_price numeric, sell_price numeric,
               buy_low numeric, buy_high numeric, sell_low numeric, sell_high numeric, samples bigint)
language sql stable security invoker set search_path = public
as $$
  with observations as (
    select observed_at, price, sell_price
    from public.price_observations
    where window_hours in (1,2,24)
      and observed_at >= now() - make_interval(hours => window_hours)
      and observed_at <= now()
  ), buckets as (
    select date_bin(case when window_hours = 1 then interval '30 seconds'
                         when window_hours = 2 then interval '1 minute'
                         else interval '5 minutes' end,
                    observed_at, timestamptz '2000-01-01') as period,
           avg(price) as buy, avg(sell_price) as sell,
           min(price) as buy_min, max(price) as buy_max,
           min(sell_price) as sell_min, max(sell_price) as sell_max, count(*) as readings
    from observations group by 1
  )
  select greatest(period, now() - make_interval(hours => window_hours)),
         buy, sell, buy_min, buy_max, sell_min, sell_max, readings
  from buckets order by period
$$;
revoke all on function public.price_history_window(integer) from public;
grant execute on function public.price_history_window(integer) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
