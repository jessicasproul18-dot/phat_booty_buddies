-- Phat Booty Buddies: paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- ───────────── Tables ─────────────
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  reward text default '',
  reward_weeks int not null default 4 check (reward_weeks between 1 and 52),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  goal int not null default 4 check (goal between 1 and 7),
  wager text not null default '',
  couple_id uuid references public.couples(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  day date not null,
  activity text not null default 'Workout',
  note text not null default '',
  photo_path text,
  status text not null default 'ok' check (status in ('ok','pending','declined')),
  reviewed_by uuid references auth.users(id)
);
create index if not exists checkins_couple_idx on public.checkins (couple_id, created_at desc);

create table if not exists public.likes (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (checkin_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text unique not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- ───────────── Helpers ─────────────
create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

-- New sign-ups get a profile automatically
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Start a pair: makes a 6-character invite code
create or replace function public.create_couple() returns text
language plpgsql security definer set search_path = public as $$
declare c text; cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select couple_id into cid from profiles where id = auth.uid();
  if cid is not null then
    select code into c from couples where id = cid; return c;
  end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from couples where code = c);
  end loop;
  insert into couples (code) values (c) returning id into cid;
  update profiles set couple_id = cid where id = auth.uid();
  return c;
end $$;

-- Join a pair with the code (max two people per pair)
create or replace function public.join_couple(join_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid; n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into cid from couples where code = upper(trim(join_code));
  if cid is null then raise exception 'That code doesn''t match any pair.'; end if;
  select count(*) into n from profiles where couple_id = cid and id <> auth.uid();
  if n >= 2 then raise exception 'That pair already has two people.'; end if;
  update profiles set couple_id = cid where id = auth.uid();
  return true;
end $$;

grant execute on function public.create_couple() to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.my_couple() to authenticated;

-- ───────────── Privacy rules (Row Level Security) ─────────────
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.nudges enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "pair reads couple" on public.couples;
create policy "pair reads couple" on public.couples for select using (id = public.my_couple());
drop policy if exists "pair edits couple" on public.couples;
create policy "pair edits couple" on public.couples for update using (id = public.my_couple());

drop policy if exists "see self and partner" on public.profiles;
create policy "see self and partner" on public.profiles for select
  using (id = auth.uid() or (couple_id is not null and couple_id = public.my_couple()));
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update using (id = auth.uid());

drop policy if exists "pair reads checkins" on public.checkins;
create policy "pair reads checkins" on public.checkins for select using (couple_id = public.my_couple());
drop policy if exists "post own checkins" on public.checkins;
create policy "post own checkins" on public.checkins for insert
  with check (user_id = auth.uid() and couple_id = public.my_couple());
drop policy if exists "pair updates checkins" on public.checkins;
create policy "pair updates checkins" on public.checkins for update using (couple_id = public.my_couple());
drop policy if exists "delete own checkins" on public.checkins;
create policy "delete own checkins" on public.checkins for delete using (user_id = auth.uid());

drop policy if exists "pair reads likes" on public.likes;
create policy "pair reads likes" on public.likes for select using (couple_id = public.my_couple());
drop policy if exists "add own likes" on public.likes;
create policy "add own likes" on public.likes for insert with check (user_id = auth.uid() and couple_id = public.my_couple());
drop policy if exists "remove own likes" on public.likes;
create policy "remove own likes" on public.likes for delete using (user_id = auth.uid());

drop policy if exists "pair reads comments" on public.comments;
create policy "pair reads comments" on public.comments for select using (couple_id = public.my_couple());
drop policy if exists "add own comments" on public.comments;
create policy "add own comments" on public.comments for insert with check (user_id = auth.uid() and couple_id = public.my_couple());
drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments for delete using (user_id = auth.uid());

drop policy if exists "pair reads nudges" on public.nudges;
create policy "pair reads nudges" on public.nudges for select using (couple_id = public.my_couple());
drop policy if exists "send nudges" on public.nudges;
create policy "send nudges" on public.nudges for insert with check (from_user = auth.uid() and couple_id = public.my_couple());
drop policy if exists "mark nudges seen" on public.nudges;
create policy "mark nudges seen" on public.nudges for update using (to_user = auth.uid());

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Photo storage (private bucket, one folder per pair) ─────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

drop policy if exists "pair reads photos" on storage.objects;
create policy "pair reads photos" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
drop policy if exists "pair uploads photos" on storage.objects;
create policy "pair uploads photos" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
drop policy if exists "owner deletes photos" on storage.objects;
create policy "owner deletes photos" on storage.objects for delete
  using (bucket_id = 'photos' and owner = auth.uid());

-- ───────────── Live updates ─────────────
do $$
declare t text;
begin
  foreach t in array array['checkins','likes','comments','nudges','profiles','couples'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
