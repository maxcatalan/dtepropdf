-- Extraction configs per user (up to 50 each)
create table if not exists public.extraction_configs (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  name       text        not null,
  fields     jsonb       not null default '[]',   -- [{key, label}]
  show_table boolean     not null default true,
  col_order  jsonb       not null default '[]',   -- [key, ...]
  triggers   jsonb       not null default '[]',   -- [{field_name, field_value}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.extraction_configs enable row level security;

create policy "own extraction configs"
  on public.extraction_configs for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists extraction_configs_user_idx
  on public.extraction_configs (user_id, created_at desc);
