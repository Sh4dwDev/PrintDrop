-- Run this once to add admin material and colour stock controls.
alter table public.pricing_settings
  add column if not exists available_materials text[] not null
    default array['PLA', 'PETG', 'TPU', 'ABS']
    check (cardinality(available_materials) > 0),
  add column if not exists available_colours text[] not null
    default array['Black', 'White', 'Grey', 'Orange', 'Blue', 'Green', 'Other']
    check (cardinality(available_colours) > 0);

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
