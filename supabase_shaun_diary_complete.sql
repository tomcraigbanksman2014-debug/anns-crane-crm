-- Shaun's Diary
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

-- The CRM reads/writes through authenticated server routes. These policies also permit
-- authenticated office users if a direct Supabase client is used later.
drop policy if exists "office users can read shaun diary" on public.shaun_diary_entries;
create policy "office users can read shaun diary"
on public.shaun_diary_entries for select
to authenticated
using (true);

drop policy if exists "office users can add shaun diary" on public.shaun_diary_entries;
create policy "office users can add shaun diary"
on public.shaun_diary_entries for insert
to authenticated
with check (true);

drop policy if exists "office users can update shaun diary" on public.shaun_diary_entries;
create policy "office users can update shaun diary"
on public.shaun_diary_entries for update
to authenticated
using (true)
with check (true);

drop policy if exists "office users can delete shaun diary" on public.shaun_diary_entries;
create policy "office users can delete shaun diary"
on public.shaun_diary_entries for delete
to authenticated
using (true);

create table if not exists public.shaun_diary_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shaun_push_user_idx on public.shaun_diary_push_subscriptions(user_id, enabled);

create table if not exists public.shaun_diary_notification_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.shaun_diary_entries(id) on delete cascade,
  subscription_id uuid references public.shaun_diary_push_subscriptions(id) on delete cascade,
  notification_type text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz not null default now(),
  success boolean not null default true,
  error_message text,
  unique(entry_id, subscription_id, notification_type, scheduled_for)
);

alter table public.shaun_diary_push_subscriptions enable row level security;
alter table public.shaun_diary_notification_log enable row level security;
revoke all on public.shaun_diary_push_subscriptions from anon;
revoke all on public.shaun_diary_notification_log from anon;
grant select, insert, update, delete on public.shaun_diary_push_subscriptions to authenticated;
grant select on public.shaun_diary_notification_log to authenticated;
drop policy if exists shaun_push_own on public.shaun_diary_push_subscriptions;
create policy shaun_push_own on public.shaun_diary_push_subscriptions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists shaun_log_authenticated_read on public.shaun_diary_notification_log;
create policy shaun_log_authenticated_read on public.shaun_diary_notification_log for select to authenticated using (true);
