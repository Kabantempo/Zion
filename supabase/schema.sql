-- =============================================
-- Zion — Schéma Supabase
-- =============================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.task_types (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  label text not null,
  category text not null,
  points integer not null default 10 check (points > 0),
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly', 'monthly', 'as_needed'))
);

create table if not exists public.task_logs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  task_type_id uuid not null references public.task_types(id) on delete cascade,
  done_by uuid not null references public.profiles(id) on delete cascade,
  done_at timestamptz not null default now(),
  points_awarded integer not null
);

create table if not exists public.tickets (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  task_type_id uuid references public.task_types(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date date,
  note text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  type text not null default 'other' check (type in ('party', 'absence', 'shopping', 'other')),
  start timestamptz not null,
  "end" timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- =============================================
-- INDEXES
-- =============================================

create index if not exists idx_household_members_user on public.household_members(user_id);
create index if not exists idx_task_logs_household on public.task_logs(household_id, done_at desc);
create index if not exists idx_task_logs_done_by on public.task_logs(done_by, done_at desc);
create index if not exists idx_tickets_household on public.tickets(household_id, status);
create index if not exists idx_events_household on public.events(household_id, start);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.task_types enable row level security;
alter table public.task_logs enable row level security;
alter table public.tickets enable row level security;
alter table public.events enable row level security;

-- Helper function: is current user in a given household?
create or replace function public.is_member_of(hid uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  )
$$;

-- profiles: viewable by anyone in same household; editable by owner
create policy "Profiles: read own household" on public.profiles
  for select using (
    id = auth.uid() or exists (
      select 1 from public.household_members hm1
      join public.household_members hm2 on hm1.household_id = hm2.household_id
      where hm1.user_id = auth.uid() and hm2.user_id = profiles.id
    )
  );
create policy "Profiles: insert own" on public.profiles for insert with check (id = auth.uid());
create policy "Profiles: update own" on public.profiles for update using (id = auth.uid());

-- households
create policy "Households: read if member" on public.households
  for select using (public.is_member_of(id));
create policy "Households: insert" on public.households
  for insert with check (created_by = auth.uid());
create policy "Households: update by admin" on public.households
  for update using (
    exists (select 1 from public.household_members where household_id = households.id and user_id = auth.uid() and role = 'admin')
  );

-- household_members
create policy "Members: read if in same household" on public.household_members
  for select using (public.is_member_of(household_id));
create policy "Members: insert self" on public.household_members
  for insert with check (user_id = auth.uid());

-- task_types
create policy "TaskTypes: read if member" on public.task_types
  for select using (public.is_member_of(household_id));
create policy "TaskTypes: insert if member" on public.task_types
  for insert with check (public.is_member_of(household_id));
create policy "TaskTypes: update if admin" on public.task_types
  for update using (
    exists (select 1 from public.household_members where household_id = task_types.household_id and user_id = auth.uid() and role = 'admin')
  );

-- task_logs
create policy "TaskLogs: read if member" on public.task_logs
  for select using (public.is_member_of(household_id));
create policy "TaskLogs: insert if member" on public.task_logs
  for insert with check (public.is_member_of(household_id) and done_by = auth.uid());

-- tickets
create policy "Tickets: read if member" on public.tickets
  for select using (public.is_member_of(household_id));
create policy "Tickets: insert if member" on public.tickets
  for insert with check (public.is_member_of(household_id) and created_by = auth.uid());
create policy "Tickets: update if member" on public.tickets
  for update using (public.is_member_of(household_id));

-- events
create policy "Events: read if member" on public.events
  for select using (public.is_member_of(household_id));
create policy "Events: insert if member" on public.events
  for insert with check (public.is_member_of(household_id) and created_by = auth.uid());
create policy "Events: update own" on public.events
  for update using (created_by = auth.uid());
create policy "Events: delete own" on public.events
  for delete using (created_by = auth.uid());

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, color)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), '#6366f1')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
