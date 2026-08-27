-- Run this once after migration 005.
-- Includes stock controls, quantity pricing, and printer-time pricing.
alter table public.pricing_settings
  add column if not exists available_materials text[] not null
    default array['PLA', 'PETG', 'TPU', 'ABS']
    check (cardinality(available_materials) > 0),
  add column if not exists available_colours text[] not null
    default array['Black', 'White', 'Grey', 'Orange', 'Blue', 'Green', 'Other']
    check (cardinality(available_colours) > 0),
  add column if not exists machine_rate_per_hour numeric(10,2) not null
    default 10 check (machine_rate_per_hour >= 0);

alter table public.orders
  add column if not exists estimated_print_time_minutes numeric(10,2)
    check (estimated_print_time_minutes is null or estimated_print_time_minutes > 0),
  add column if not exists print_time_source text
    check (print_time_source is null or print_time_source in ('customer', 'admin')),
  add column if not exists machine_cost_nok numeric(10,2);

create or replace function public.calculate_order_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.pricing_settings;
  cost_per_kg numeric;
begin
  if new.estimated_weight_g is null and new.estimated_print_time_minutes is null then
    new.material_cost_nok := null;
    new.machine_cost_nok := null;
    new.profit_amount_nok := null;
    new.quoted_price_nok := null;
    return new;
  end if;

  select * into settings
  from public.pricing_settings
  where id = true;

  cost_per_kg := case new.material
    when 'PLA' then settings.pla_cost_per_kg
    when 'PETG' then settings.petg_cost_per_kg
    when 'TPU' then settings.tpu_cost_per_kg
    when 'ABS' then settings.abs_cost_per_kg
  end;

  new.material_cost_nok := round(
    coalesce(new.estimated_weight_g, 0) * new.quantity / 1000 * cost_per_kg,
    2
  );
  new.machine_cost_nok := round(
    coalesce(new.estimated_print_time_minutes, 0) / 60
      * new.quantity * settings.machine_rate_per_hour,
    2
  );
  new.profit_amount_nok := round(
    (new.material_cost_nok + new.machine_cost_nok)
      * settings.profit_margin_percent / 100,
    2
  );
  new.quoted_price_nok :=
    new.material_cost_nok + new.machine_cost_nok + new.profit_amount_nok;
  return new;
end;
$$;

drop trigger if exists calculate_order_price on public.orders;
create trigger calculate_order_price
before insert or update on public.orders
for each row execute procedure public.calculate_order_price();

drop policy if exists "customers create their own orders" on public.orders;
create policy "customers create their own orders"
on public.orders
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select material = any(available_materials) from public.pricing_settings where id = true)
  and (select colour = any(available_colours) from public.pricing_settings where id = true)
);

update public.orders
set updated_at = updated_at
where estimated_weight_g is not null
   or estimated_print_time_minutes is not null;
