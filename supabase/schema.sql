create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  profile_picture_url text,
  company_logo_url text,
  country_code text,
  phone text,
  company_name text,
  company_website text,
  industry text,
  selected_plan text,
  billing_cycle text,
  billing_status text,
  trial_ends_at timestamptz,
  coupon_code text,
  razorpay_subscription_id text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_profiles add column if not exists billing_cycle text;
alter table public.app_profiles add column if not exists billing_status text;
alter table public.app_profiles add column if not exists trial_ends_at timestamptz;
alter table public.app_profiles add column if not exists coupon_code text;
alter table public.app_profiles add column if not exists razorpay_subscription_id text;
alter table public.app_profiles add column if not exists profile_picture_url text;
alter table public.app_profiles add column if not exists company_logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-profile-pictures',
  'app-profile-pictures',
  true,
  5242880,
  array['image/png', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.meta_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  setup_type text,
  connection_method text not null,
  status text not null default 'connected',
  waba_id text not null,
  phone_number_id text not null,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  messaging_limit_tier text,
  business_account_name text,
  access_token_ciphertext text not null,
  access_token_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists meta_channels_phone_number_id_key on public.meta_channels (phone_number_id);

create table if not exists public.instagram_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  connection_method text not null,
  status text not null default 'connected',
  instagram_account_id text not null,
  instagram_username text,
  instagram_name text,
  profile_picture_url text,
  page_id text not null,
  page_name text,
  user_access_token_ciphertext text not null,
  user_access_token_last4 text,
  page_access_token_ciphertext text not null,
  page_access_token_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists instagram_channels_instagram_account_id_key
  on public.instagram_channels (instagram_account_id);

create table if not exists public.messenger_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  connection_method text not null,
  status text not null default 'connected',
  page_id text not null,
  page_name text,
  page_picture_url text,
  page_tasks text[] not null default '{}',
  page_access_token_ciphertext text not null,
  page_access_token_last4 text,
  webhook_fields text[] not null default '{}',
  webhook_subscribed boolean not null default false,
  webhook_last_error text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.messenger_channels add column if not exists page_name text;
alter table public.messenger_channels add column if not exists page_picture_url text;
alter table public.messenger_channels add column if not exists page_tasks text[] not null default '{}';
alter table public.messenger_channels add column if not exists page_access_token_last4 text;
alter table public.messenger_channels add column if not exists webhook_fields text[] not null default '{}';
alter table public.messenger_channels add column if not exists webhook_subscribed boolean not null default false;
alter table public.messenger_channels add column if not exists webhook_last_error text;

create unique index if not exists messenger_channels_page_id_key
  on public.messenger_channels (page_id);

create table if not exists public.meta_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  meta_template_id text,
  template_name text not null,
  category text,
  language text not null,
  status text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, template_name, language)
);

create table if not exists public.meta_conversational_automation_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  enable_welcome_message boolean not null default false,
  prompts text[] not null default '{}',
  commands jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  contact_wa_id text not null,
  contact_name text,
  display_phone text,
  email text,
  source text,
  remark text,
  avatar_url text,
  status text not null default 'New',
  priority text not null default 'Medium',
  labels text[] not null default '{}',
  owner_name text,
  last_message_text text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, contact_wa_id)
);

alter table public.conversation_threads add column if not exists email text;
alter table public.conversation_threads add column if not exists source text;
alter table public.conversation_threads add column if not exists remark text;

create index if not exists conversation_threads_last_message_at_idx on public.conversation_threads (user_id, last_message_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  wa_message_id text,
  direction text not null,
  message_type text not null,
  body text,
  sender_name text,
  sender_wa_id text,
  recipient_wa_id text,
  template_name text,
  status text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists conversation_messages_unique_meta_id
  on public.conversation_messages (user_id, wa_message_id)
  where wa_message_id is not null;

create index if not exists conversation_messages_thread_created_idx
  on public.conversation_messages (thread_id, created_at asc);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  type text not null check (type in ('addition', 'deduction')),
  amount numeric(12, 4) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  call_id text,
  name text,
  phone text not null,
  type text not null check (type in ('incoming', 'outgoing', 'missed')),
  duration_seconds integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  call_id text not null,
  contact_wa_id text,
  contact_name text,
  display_phone text,
  direction text not null default 'outgoing' check (direction in ('incoming', 'outgoing')),
  state text not null default 'dialing',
  offer_sdp text,
  answer_sdp text,
  biz_opaque_callback_data text,
  last_event text,
  raw jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  connected_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, call_id)
);

alter table public.call_logs add column if not exists call_id text;
alter table public.call_sessions add column if not exists connected_at timestamptz;

create unique index if not exists call_logs_user_call_id_key
  on public.call_logs (user_id, call_id);

create index if not exists call_sessions_user_updated_idx
  on public.call_sessions (user_id, updated_at desc);

create table if not exists public.meta_lead_capture_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  status text not null default 'draft',
  app_id text,
  page_ids text[] not null default '{}',
  form_ids text[] not null default '{}',
  access_token_ciphertext text,
  access_token_last4 text,
  verify_token text not null,
  verified_at timestamptz,
  default_owner_name text,
  default_labels text[] not null default '{}',
  auto_create_leads boolean not null default true,
  last_webhook_at timestamptz,
  last_lead_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists meta_lead_capture_configs_verify_token_key
  on public.meta_lead_capture_configs (verify_token);

alter table public.meta_lead_capture_configs add column if not exists verified_at timestamptz;

create table if not exists public.meta_lead_capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text,
  form_id text,
  lead_id text,
  event_time timestamptz,
  processing_status text not null default 'received',
  error_message text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists meta_lead_capture_events_user_lead_id_key
  on public.meta_lead_capture_events (user_id, lead_id)
  where lead_id is not null;

create index if not exists meta_lead_capture_events_user_created_idx
  on public.meta_lead_capture_events (user_id, created_at desc);

create table if not exists public.whatsapp_payment_configuration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_channel_id uuid references public.meta_channels(id) on delete set null,
  configuration_name text,
  provider_name text,
  provider_mid text,
  status text,
  created_timestamp bigint,
  updated_timestamp bigint,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists whatsapp_payment_configuration_events_user_created_idx
  on public.whatsapp_payment_configuration_events (user_id, created_at desc);

create table if not exists public.workspace_team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete set null,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_email text not null,
  full_name text,
  role text not null default 'Agent',
  status text not null default 'invited',
  invite_sent_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists workspace_team_members_owner_email_key
  on public.workspace_team_members (workspace_owner_user_id, invited_email);

create index if not exists workspace_team_members_owner_idx
  on public.workspace_team_members (workspace_owner_user_id, created_at desc);

create index if not exists workspace_team_members_member_idx
  on public.workspace_team_members (member_user_id);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('template_approved', 'template_rejected', 'missed_call', 'lead_created', 'team_member_joined')),
  title text not null,
  body text not null,
  target_path text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_notifications_user_dedupe_key
  on public.user_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, is_read, created_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  sound_enabled boolean not null default true,
  call_sound_enabled boolean not null default true,
  sound_preset text not null default 'classic' check (sound_preset in ('classic', 'soft', 'pulse')),
  volume numeric(4, 2) not null default 0.8,
  template_review_enabled boolean not null default true,
  missed_call_enabled boolean not null default true,
  lead_enabled boolean not null default true,
  team_joined_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email_address text not null,
  auth_user text not null,
  password_ciphertext text not null,
  smtp_host text not null,
  smtp_port integer not null,
  smtp_secure boolean not null default true,
  imap_host text not null,
  imap_port integer not null,
  imap_secure boolean not null default true,
  status text not null default 'connected',
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  editor_mode text not null default 'rich',
  html_content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists email_templates_user_updated_idx
  on public.email_templates (user_id, updated_at desc);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_template_id uuid references public.email_templates(id) on delete set null,
  template_name text,
  campaign_name text not null,
  subject text not null,
  html_content text not null default '',
  audience_source text not null default 'contacts',
  recipient_count integer not null default 0,
  status text not null default 'sent',
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.email_campaigns add column if not exists template_name text;

create index if not exists email_campaigns_user_created_idx
  on public.email_campaigns (user_id, created_at desc);

drop trigger if exists app_profiles_set_updated_at on public.app_profiles;
create trigger app_profiles_set_updated_at
before update on public.app_profiles
for each row execute function public.set_updated_at();

drop trigger if exists meta_channels_set_updated_at on public.meta_channels;
create trigger meta_channels_set_updated_at
before update on public.meta_channels
for each row execute function public.set_updated_at();

drop trigger if exists instagram_channels_set_updated_at on public.instagram_channels;
create trigger instagram_channels_set_updated_at
before update on public.instagram_channels
for each row execute function public.set_updated_at();

drop trigger if exists messenger_channels_set_updated_at on public.messenger_channels;
create trigger messenger_channels_set_updated_at
before update on public.messenger_channels
for each row execute function public.set_updated_at();

drop trigger if exists meta_templates_set_updated_at on public.meta_templates;
create trigger meta_templates_set_updated_at
before update on public.meta_templates
for each row execute function public.set_updated_at();

drop trigger if exists meta_conversational_automation_configs_set_updated_at on public.meta_conversational_automation_configs;
create trigger meta_conversational_automation_configs_set_updated_at
before update on public.meta_conversational_automation_configs
for each row execute function public.set_updated_at();

drop trigger if exists conversation_threads_set_updated_at on public.conversation_threads;
create trigger conversation_threads_set_updated_at
before update on public.conversation_threads
for each row execute function public.set_updated_at();

drop trigger if exists call_sessions_set_updated_at on public.call_sessions;
create trigger call_sessions_set_updated_at
before update on public.call_sessions
for each row execute function public.set_updated_at();

drop trigger if exists meta_lead_capture_configs_set_updated_at on public.meta_lead_capture_configs;
create trigger meta_lead_capture_configs_set_updated_at
before update on public.meta_lead_capture_configs
for each row execute function public.set_updated_at();

drop trigger if exists workspace_team_members_set_updated_at on public.workspace_team_members;
create trigger workspace_team_members_set_updated_at
before update on public.workspace_team_members
for each row execute function public.set_updated_at();

drop trigger if exists user_notifications_set_updated_at on public.user_notifications;
create trigger user_notifications_set_updated_at
before update on public.user_notifications
for each row execute function public.set_updated_at();

drop trigger if exists user_notification_preferences_set_updated_at on public.user_notification_preferences;
create trigger user_notification_preferences_set_updated_at
before update on public.user_notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists email_connections_set_updated_at on public.email_connections;
create trigger email_connections_set_updated_at
before update on public.email_connections
for each row execute function public.set_updated_at();

drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

drop trigger if exists email_campaigns_set_updated_at on public.email_campaigns;
create trigger email_campaigns_set_updated_at
before update on public.email_campaigns
for each row execute function public.set_updated_at();

alter table public.app_profiles enable row level security;
alter table public.meta_channels enable row level security;
alter table public.instagram_channels enable row level security;
alter table public.messenger_channels enable row level security;
alter table public.meta_templates enable row level security;
alter table public.meta_conversational_automation_configs enable row level security;
alter table public.conversation_threads enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.call_logs enable row level security;
alter table public.call_sessions enable row level security;
alter table public.meta_lead_capture_configs enable row level security;
alter table public.meta_lead_capture_events enable row level security;
alter table public.whatsapp_payment_configuration_events enable row level security;
alter table public.workspace_team_members enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.email_connections enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_campaigns enable row level security;

drop policy if exists app_profiles_self_access on public.app_profiles;
create policy app_profiles_self_access
on public.app_profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_channels_self_access on public.meta_channels;
create policy meta_channels_self_access
on public.meta_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists instagram_channels_self_access on public.instagram_channels;
create policy instagram_channels_self_access
on public.instagram_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists messenger_channels_self_access on public.messenger_channels;
create policy messenger_channels_self_access
on public.messenger_channels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_templates_self_access on public.meta_templates;
create policy meta_templates_self_access
on public.meta_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_conversational_automation_configs_self_access on public.meta_conversational_automation_configs;
create policy meta_conversational_automation_configs_self_access
on public.meta_conversational_automation_configs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists conversation_threads_self_access on public.conversation_threads;
create policy conversation_threads_self_access
on public.conversation_threads
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists conversation_messages_self_access on public.conversation_messages;
create policy conversation_messages_self_access
on public.conversation_messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_lead_capture_configs_self_access on public.meta_lead_capture_configs;
create policy meta_lead_capture_configs_self_access
on public.meta_lead_capture_configs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meta_lead_capture_events_self_access on public.meta_lead_capture_events;
create policy meta_lead_capture_events_self_access
on public.meta_lead_capture_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists whatsapp_payment_configuration_events_self_access on public.whatsapp_payment_configuration_events;
create policy whatsapp_payment_configuration_events_self_access
on public.whatsapp_payment_configuration_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists credit_ledger_self_access on public.credit_ledger;
create policy credit_ledger_self_access
on public.credit_ledger
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists call_logs_self_access on public.call_logs;
create policy call_logs_self_access
on public.call_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists call_sessions_self_access on public.call_sessions;
create policy call_sessions_self_access
on public.call_sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists workspace_team_members_access on public.workspace_team_members;
create policy workspace_team_members_access
on public.workspace_team_members
for all
using (
  auth.uid() = workspace_owner_user_id
  or auth.uid() = member_user_id
)
with check (auth.uid() = workspace_owner_user_id);

drop policy if exists user_notifications_self_access on public.user_notifications;
create policy user_notifications_self_access
on public.user_notifications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_notification_preferences_self_access on public.user_notification_preferences;
create policy user_notification_preferences_self_access
on public.user_notification_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists email_connections_self_access on public.email_connections;
create policy email_connections_self_access
on public.email_connections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists email_templates_self_access on public.email_templates;
create policy email_templates_self_access
on public.email_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists email_campaigns_self_access on public.email_campaigns;
create policy email_campaigns_self_access
on public.email_campaigns
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_threads'
    ) then
      alter publication supabase_realtime add table public.conversation_threads;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_messages'
    ) then
      alter publication supabase_realtime add table public.conversation_messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_logs'
    ) then
      alter publication supabase_realtime add table public.call_logs;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_sessions'
    ) then
      alter publication supabase_realtime add table public.call_sessions;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_notifications'
    ) then
      alter publication supabase_realtime add table public.user_notifications;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_notification_preferences'
    ) then
      alter publication supabase_realtime add table public.user_notification_preferences;
    end if;
  end if;
end
$$;
