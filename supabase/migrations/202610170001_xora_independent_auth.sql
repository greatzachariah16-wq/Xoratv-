-- XoraTV independent authentication schema.
-- Existing Firebase RTDB tables/rules and existing Supabase chat/content tables are untouched.
create table if not exists public.xora_auth_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  legacy_firebase_uid text unique,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.xora_profiles (
  id uuid primary key references public.xora_auth_accounts(id) on delete cascade,
  username text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  website text,
  location text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.xora_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.xora_auth_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists xora_auth_sessions_user_id_idx on public.xora_auth_sessions(user_id);
create index if not exists xora_auth_sessions_expiry_idx on public.xora_auth_sessions(expires_at);
create table if not exists public.xora_auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.xora_auth_accounts(id) on delete cascade,
  token_hash text not null unique,
  token_type text not null check (token_type in ('verify_email','reset_password')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists xora_auth_tokens_user_type_idx on public.xora_auth_tokens(user_id, token_type);
alter table public.xora_auth_accounts enable row level security;
alter table public.xora_profiles enable row level security;
alter table public.xora_auth_sessions enable row level security;
alter table public.xora_auth_tokens enable row level security;
revoke all on public.xora_auth_accounts from anon, authenticated;
revoke all on public.xora_profiles from anon, authenticated;
revoke all on public.xora_auth_sessions from anon, authenticated;
revoke all on public.xora_auth_tokens from anon, authenticated;
