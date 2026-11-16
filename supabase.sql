-- SAWAHTRACK: Supabase PostgreSQL schema
-- Run in Supabase SQL Editor. Enable RLS; never expose service_role key in frontend.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'operator' check (role in ('admin','operator','viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'admin')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.villages (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 name text not null,
 district text,
 regency text,
 created_at timestamptz not null default now()
);
create table if not exists public.owners (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 name text not null,
 phone text,
 village text,
 address text,
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.fields (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null references public.owners(id),
 village_id uuid references public.villages(id),
 field_name text not null,
 local_boxes numeric(10,2) not null default 0,
 area_m2 numeric(14,2) not null default 0,
 plow_rate_per_box numeric(14,2) not null default 0,
 combine_rate_per_box numeric(14,2) not null default 0,
 boundary_geojson jsonb,
 address_note text,
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.field_photos (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 field_id uuid not null references public.fields(id) on delete cascade,
 image_url text not null,
 caption text,
 taken_at timestamptz not null default now()
);
create table if not exists public.seasons (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 name text not null,
 season_type text not null check(season_type in ('tanam','panen','lainnya')),
 start_date date,
 end_date date,
 status text not null default 'active'
);
create table if not exists public.machines (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 name text not null,
 machine_type text not null,
 brand text,
 model text,
 notes text
);
create table if not exists public.jobs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 season_id uuid references public.seasons(id),
 machine_id uuid references public.machines(id),
 job_type text not null check(job_type in ('bajak','combine')),
 job_date date not null,
 season_name text,
 machine_name text,
 status text not null default 'pending' check(status in ('pending','proses','selesai','batal')),
 total_boxes numeric(12,2) not null default 0,
 total_area_m2 numeric(14,2) not null default 0,
 gross_amount numeric(14,2) not null default 0,
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.job_fields (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 job_id uuid not null references public.jobs(id) on delete cascade,
 field_id uuid not null references public.fields(id),
 boxes_snapshot numeric(10,2) not null default 0,
 area_snapshot_m2 numeric(14,2) not null default 0,
 rate_per_box numeric(14,2) not null default 0,
 subtotal numeric(14,2) not null default 0
);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 job_id uuid not null references public.jobs(id),
 amount numeric(14,2) not null check(amount > 0),
 payment_date date not null,
 payment_method text,
 status text not null default 'paid' check(status in ('paid','void')),
 notes text
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 job_id uuid references public.jobs(id),
 expense_type text not null,
 amount numeric(14,2) not null check(amount > 0),
 expense_date date not null,
 description text
);
create table if not exists public.fuel_logs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 machine_id uuid not null references public.machines(id),
 expense_id uuid references public.expenses(id),
 fuel_date date not null,
 liters numeric(12,2) not null check(liters > 0),
 price_per_liter numeric(14,2),
 total_cost numeric(14,2),
 odometer_or_hours numeric(12,2),
 notes text
);
create table if not exists public.workspace_members (
 workspace_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'operator' check(role in ('admin','operator','viewer')),
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id)
);

-- Workspace ID for first account is its auth user UUID. Admins add team members to
-- the same workspace using the Supabase dashboard / secure server-side function.
create or replace function public.my_workspace_ids()
returns setof uuid language sql stable security definer set search_path=public as $$
 select workspace_id from public.workspace_members where user_id=auth.uid()
 union
 select id from public.profiles where id=auth.uid()
$$;

-- First account automatically gets its own workspace membership.
insert into public.workspace_members(workspace_id,user_id,role)
select id,id,'admin' from public.profiles
on conflict do nothing;

create or replace function public.add_new_user_to_own_workspace()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.workspace_members(workspace_id,user_id,role)
 values(new.id,new.id,'admin') on conflict do nothing;
 return new;
end; $$;
drop trigger if exists profile_workspace_created on public.profiles;
create trigger profile_workspace_created after insert on public.profiles
for each row execute procedure public.add_new_user_to_own_workspace();

-- Enable RLS on all tenant data.
do $$ declare t text; begin
 foreach t in array array['villages','owners','fields','field_photos','seasons','machines','jobs','job_fields','payments','expenses','fuel_logs','workspace_members'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists workspace_read on public.%I',t);
  execute format('create policy workspace_read on public.%I for select using (workspace_id in (select public.my_workspace_ids()))',t);
  execute format('drop policy if exists workspace_insert on public.%I',t);
  execute format('create policy workspace_insert on public.%I for insert with check (workspace_id in (select public.my_workspace_ids()))',t);
  execute format('drop policy if exists workspace_update on public.%I',t);
  execute format('create policy workspace_update on public.%I for update using (workspace_id in (select public.my_workspace_ids())) with check (workspace_id in (select public.my_workspace_ids()))',t);
  execute format('drop policy if exists workspace_delete on public.%I',t);
  execute format('create policy workspace_delete on public.%I for delete using (workspace_id in (select public.my_workspace_ids()))',t);
 end loop;
end $$;

alter table public.profiles enable row level security;
create policy "profile self read" on public.profiles for select using (id=auth.uid());
create policy "profile self update" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());

create index if not exists idx_owners_workspace_name on public.owners(workspace_id,name);
create index if not exists idx_fields_workspace_owner on public.fields(workspace_id,owner_id);
create index if not exists idx_jobs_workspace_date on public.jobs(workspace_id,job_date desc);
create index if not exists idx_job_fields_job on public.job_fields(job_id);
create index if not exists idx_payments_job on public.payments(job_id);
create index if not exists idx_expenses_date on public.expenses(workspace_id,expense_date desc);

-- NOTE: workspace_id must be populated by the client with the signed-in user's
-- workspace UUID for inserts. For a multi-user workspace, use a secure invite flow.
