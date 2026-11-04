-- Run before redeploying collect-prices. Preserves existing price history.
alter table public.price_observations
  add column if not exists sell_price numeric(18,6)
  check (sell_price > 0 and sell_price <= price);
