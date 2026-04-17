-- Add api_mode preference to user_credits table
alter table public.user_credits
  add column if not exists api_mode text not null default 'auto'
  check (api_mode in ('quick', 'auto', 'manual'));
