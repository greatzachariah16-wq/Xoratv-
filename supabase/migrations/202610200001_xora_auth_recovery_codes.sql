-- Add hashed recovery-code support to XoraTV's independent auth accounts.
-- Existing Firebase rules and existing Supabase chat/content tables remain untouched.
alter table public.xora_auth_accounts
  add column if not exists recovery_code_hash text;

comment on column public.xora_auth_accounts.recovery_code_hash is
  'SHA-256 hash of the one-time-display recovery code; never store the raw code.';
