-- XoraTV subscriptions are stored in Supabase. User authentication remains handled by the existing Xora auth session.
create table if not exists public.xora_subscriptions (
  user_id uuid not null references public.xora_auth_accounts(id) on delete cascade,
  creator_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, creator_id),
  constraint xora_subscriptions_no_self_follow check (creator_id <> user_id::text)
);
create index if not exists xora_subscriptions_creator_id_idx
  on public.xora_subscriptions (creator_id);
create index if not exists xora_subscriptions_user_created_idx
  on public.xora_subscriptions (user_id, created_at desc);
alter table public.xora_subscriptions enable row level security;
revoke all on public.xora_subscriptions from anon, authenticated;
