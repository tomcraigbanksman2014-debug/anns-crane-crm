-- Shaun's Diary + push notifications
create extension if not exists pgcrypto;

create table if not exists public.shaun_diary_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  entry_type text not null default 'other' check (entry_type in ('site_visit','ap_work','crane_operation','meeting','call','office','personal','unavailable','other')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  notes text,
  contact_name text,
  contact_phone text,
  linked_job_id uuid,
  linked_transport_job_id uuid,
  linked_lift_plan_id uuid,
  reminder_minutes integer,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shaun_diary_valid_times check (end_at > start_at)
);
create index if not exists shaun_diary_entries_start_idx on public.shaun_diary_entries(start_at);
create index if not exists shaun_diary_entries_end_idx on public.shaun_diary_entries(end_at);
alter table public.shaun_diary_entries enable row level security;
drop policy if exists "office users can read shaun diary" on public.shaun_diary_entries;
create policy "office users can read shaun diary" on public.shaun_diary_entries for select to authenticated using (true);
drop policy if exists "office users can add shaun diary" on public.shaun_diary_entries;
create policy "office users can add shaun diary" on public.shaun_diary_entries for insert to authenticated with check (true);
drop policy if exists "office users can update shaun diary" on public.shaun_diary_entries;
create policy "office users can update shaun diary" on public.shaun_diary_entries for update to authenticated using (true) with check (true);
drop policy if exists "office users can delete shaun diary" on public.shaun_diary_entries;
create policy "office users can delete shaun diary" on public.shaun_diary_entries for delete to authenticated using (true);

create table if not exists public.shaun_diary_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_id uuid,
  user_email text,
  active boolean not null default true,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shaun_diary_push_subscriptions enable row level security;

create table if not exists public.shaun_diary_push_log (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  entry_id uuid references public.shaun_diary_entries(id) on delete cascade,
  notification_type text not null,
  devices_sent integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shaun_diary_push_log_entry_idx on public.shaun_diary_push_log(entry_id);
alter table public.shaun_diary_push_log enable row level security;
