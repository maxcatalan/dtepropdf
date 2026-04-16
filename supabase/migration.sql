-- ─────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────────

-- 1. Credits per user
create table if not exists public.user_credits (
  user_id    uuid references auth.users(id) on delete cascade primary key,
  ocr_credits integer not null default 0,
  xml_credits integer not null default 0,
  updated_at  timestamptz default now()
);

-- 2. Usage log
create table if not exists public.usage_log (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  action     text not null,   -- 'ocr_extraction' | 'custom_extraction' | 'xml_extraction'
  filename   text,
  created_at timestamptz default now()
);

-- 3. Row-level security
alter table public.user_credits enable row level security;
alter table public.usage_log    enable row level security;

-- Users can only read their own data (server uses service role key, bypasses RLS)
create policy "own credits" on public.user_credits
  for select using (auth.uid() = user_id);

create policy "own usage" on public.usage_log
  for select using (auth.uid() = user_id);

-- 4. Atomic check-and-decrement function
create or replace function public.use_credit(
  p_user_id    uuid,
  p_credit_type text   -- 'ocr' | 'xml'
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_credits integer;
begin
  if p_credit_type = 'ocr' then
    select ocr_credits into v_credits
      from public.user_credits
     where user_id = p_user_id
       for update;
    if coalesce(v_credits, 0) <= 0 then return false; end if;
    update public.user_credits
       set ocr_credits = ocr_credits - 1, updated_at = now()
     where user_id = p_user_id;

  elsif p_credit_type = 'xml' then
    select xml_credits into v_credits
      from public.user_credits
     where user_id = p_user_id
       for update;
    if coalesce(v_credits, 0) <= 0 then return false; end if;
    update public.user_credits
       set xml_credits = xml_credits - 1, updated_at = now()
     where user_id = p_user_id;
  end if;

  return true;
end;
$$;

-- 5. Auto-create credits row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_credits (user_id, ocr_credits, xml_credits)
  values (new.id, 0, 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
