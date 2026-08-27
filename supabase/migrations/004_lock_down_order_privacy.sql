-- Run this once to ensure customers can only read their own requests.
alter table public.orders enable row level security;

drop policy if exists "customers view own orders, admins view all" on public.orders;
create policy "customers view own orders, admins view all" on public.orders
for select to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_admin())
);

drop policy if exists "customers create their own orders" on public.orders;
create policy "customers create their own orders" on public.orders
for insert to authenticated
with check ((select auth.uid()) = user_id);
