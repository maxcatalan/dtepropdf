-- API keys for external extract endpoint
create table if not exists public.api_keys (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  name        text        not null,
  key_hash    text        not null unique,   -- SHA-256 of the raw key, never stored plain
  key_prefix  text        not null,          -- first 12 chars for display (e.g. "sk_live_AbCd")
  is_active   boolean     not null default true,
  created_at  timestamptz default now(),
  last_used_at timestamptz
);

alter table public.api_keys enable row level security;

create policy "own api keys"
  on public.api_keys for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists api_keys_user_idx on public.api_keys (user_id);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash);
