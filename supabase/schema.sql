-- Run this entire file once in Supabase > SQL Editor.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table public.pricing_settings (
  id boolean primary key default true check (id),
  pla_cost_per_kg numeric(10,2) not null default 300 check (pla_cost_per_kg >= 0),
  petg_cost_per_kg numeric(10,2) not null default 300 check (petg_cost_per_kg >= 0),
  tpu_cost_per_kg numeric(10,2) not null default 300 check (tpu_cost_per_kg >= 0),
  abs_cost_per_kg numeric(10,2) not null default 300 check (abs_cost_per_kg >= 0),
  profit_margin_percent numeric(7,2) not null default 15 check (profit_margin_percent between 0 and 1000),
  default_infill_percent numeric(5,2) not null default 15 check (default_infill_percent between 0 and 100),
  updated_at timestamptz not null default now()
);

insert into public.pricing_settings (id) values (true);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null,
  user_email text not null,
  name text not null check (char_length(name) between 1 and 120),
  model_link text,
  material text not null check (material in ('PLA', 'PETG', 'TPU', 'ABS')),
  colour text not null,
  quantity integer not null check (quantity between 1 and 50),
  notes text check (char_length(notes) <= 2000),
  file_name text,
  file_path text,
  estimated_weight_g numeric(10,2) check (estimated_weight_g is null or estimated_weight_g > 0),
  weight_source text check (weight_source is null or weight_source in ('customer', 'file_estimate', 'admin')),
  material_cost_nok numeric(10,2),
  profit_amount_nok numeric(10,2),
  quoted_price_nok numeric(10,2),
  status text not null default 'Reviewing' check (status in ('Reviewing', 'Quoted', 'Printing', 'Ready', 'Completed', 'Declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (model_link is not null or file_path is not null)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

create or replace function public.calculate_order_price()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  settings public.pricing_settings;
  cost_per_kg numeric;
begin
  if new.estimated_weight_g is null then
    new.material_cost_nok := null;
    new.profit_amount_nok := null;
    new.quoted_price_nok := null;
    return new;
  end if;
  select * into settings from public.pricing_settings where id = true;
  cost_per_kg := case new.material
    when 'PLA' then settings.pla_cost_per_kg
    when 'PETG' then settings.petg_cost_per_kg
    when 'TPU' then settings.tpu_cost_per_kg
    when 'ABS' then settings.abs_cost_per_kg
  end;
  new.material_cost_nok := round(new.estimated_weight_g / 1000 * cost_per_kg, 2);
  new.profit_amount_nok := round(new.material_cost_nok * settings.profit_margin_percent / 100, 2);
  new.quoted_price_nok := new.material_cost_nok + new.profit_amount_nok;
  return new;
end;
$$;

create trigger calculate_order_price before insert or update on public.orders
for each row execute procedure public.calculate_order_price();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), new.email,
    case when not exists (select 1 from public.profiles) then 'admin' else 'customer' end);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.pricing_settings enable row level security;
revoke all on public.profiles, public.orders, public.pricing_settings from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, update on public.pricing_settings to authenticated;

create policy "profiles visible to owner or admin" on public.profiles
for select to authenticated using ((select auth.uid()) = id or (select public.is_admin()));
create policy "customers view own orders, admins view all" on public.orders
for select to authenticated using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "customers create their own orders" on public.orders
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "admins update orders" on public.orders
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "signed in users view pricing" on public.pricing_settings
for select to authenticated using (true);
create policy "admins update pricing" on public.pricing_settings
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('print-files', 'print-files', false, 209715200)
on conflict (id) do nothing;

create policy "users upload to their folder" on storage.objects
for insert to authenticated with check (bucket_id = 'print-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners and admins download print files" on storage.objects
for select to authenticated using (bucket_id = 'print-files' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "users can remove files in their folder" on storage.objects
for delete to authenticated using (bucket_id = 'print-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
