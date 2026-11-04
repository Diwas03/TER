-- Run add-sell-price.sql first. Enable Anonymous Sign-Ins in Supabase Auth settings.
begin;
create table if not exists public.push_alerts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  buy_target numeric(18,4) check (buy_target > 0),
  sell_target numeric(18,4) check (sell_target > 0),
  enabled boolean not null default true,
  version uuid not null,
  buy_armed boolean not null default true,
  sell_armed boolean not null default true,
  buy_lease timestamptz not null default '-infinity',
  sell_lease timestamptz not null default '-infinity'
);
alter table public.push_alerts enable row level security;
revoke all on public.push_alerts from anon;
grant select, insert, update, delete on public.push_alerts to authenticated;
grant all on public.push_alerts to service_role;
drop policy if exists "Own push settings" on public.push_alerts;
create policy "Own push settings" on public.push_alerts for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Atomic per-device claim prevents overlapping invocations sending the same alert.
create or replace function public.claim_price_push(p_user uuid, p_version uuid, p_side text, p_price numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare settings public.push_alerts%rowtype; target numeric; armed boolean; lease timestamptz; matched boolean;
begin
  select * into settings from public.push_alerts where user_id = p_user and version = p_version and enabled for update;
  if not found or p_side not in ('buy','sell') or p_price <= 0 then return false; end if;
  target := case when p_side = 'buy' then settings.buy_target else settings.sell_target end;
  if target is null then return false; end if;
  armed := case when p_side = 'buy' then settings.buy_armed else settings.sell_armed end;
  lease := case when p_side = 'buy' then settings.buy_lease else settings.sell_lease end;
  matched := case when p_side = 'buy' then p_price <= target else p_price >= target end;
  if not matched then
    if p_side = 'buy' then
      update public.push_alerts set buy_armed = true where user_id = p_user;
    else
      update public.push_alerts set sell_armed = true where user_id = p_user;
    end if;
    return false;
  end if;
  if not armed or lease > now() then return false; end if;
  if p_side = 'buy' then
    update public.push_alerts set buy_lease = now() + interval '2 minutes' where user_id = p_user;
  else
    update public.push_alerts set sell_lease = now() + interval '2 minutes' where user_id = p_user;
  end if;
  return true;
end $$;
revoke all on function public.claim_price_push(uuid,uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.claim_price_push(uuid,uuid,text,numeric) to service_role;
commit;
