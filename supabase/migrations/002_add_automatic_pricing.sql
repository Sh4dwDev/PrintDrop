-- Run this once if you created the database before automatic pricing was added.
alter table public.orders
  add column if not exists estimated_weight_g numeric(10,2)
    check (estimated_weight_g is null or estimated_weight_g > 0),
  add column if not exists quoted_price_nok numeric(10,2)
    generated always as (round(estimated_weight_g * 0.30, 2)) stored;
