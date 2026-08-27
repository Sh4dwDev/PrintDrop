-- Run this entire file once in Supabase > SQL Editor.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

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
  status text not null default 'Reviewing' check (status in ('Reviewing', 'Quoted', 'Printing', 'Ready', 'Completed', 'Declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (model_link is not null or file_path is not null)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

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
revoke all on public.profiles, public.orders from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.orders to authenticated;

create policy "profiles visible to owner or admin" on public.profiles
for select to authenticated using ((select auth.uid()) = id or (select public.is_admin()));
create policy "customers view own orders, admins view all" on public.orders
for select to authenticated using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "customers create their own orders" on public.orders
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "admins update orders" on public.orders
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
