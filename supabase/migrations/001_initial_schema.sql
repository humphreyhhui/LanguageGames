-- ============================================
-- Language Games - Initial Database Schema
-- ============================================
-- Run this in your Supabase SQL editor or via CLI

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- Profiles (extends auth.users)
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  avatar_url text,
  native_language text not null default 'en',
  learning_language text not null default 'es',
  badge_frame text,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup via trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'player_' || left(new.id::text, 8)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- Elo Ratings (per game type)
-- ============================================
create table public.elo_ratings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null check (game_type in ('asteroid', 'race', 'match', 'wager')),
  elo integer not null default 1000,
  peak_elo integer not null default 1000,
  unique(user_id, game_type)
);

alter table public.elo_ratings enable row level security;

create policy "Elo ratings are viewable by everyone"
  on public.elo_ratings for select
  using (true);

create policy "Server can update elo ratings"
  on public.elo_ratings for update
  using (auth.uid() = user_id);

create policy "Users can insert own elo ratings"
  on public.elo_ratings for insert
  with check (auth.uid() = user_id);

-- Auto-create elo ratings for new profiles
create or replace function public.handle_new_profile()
returns trigger as $$
begin
  insert into public.elo_ratings (user_id, game_type) values
    (new.id, 'asteroid'),
    (new.id, 'race'),
    (new.id, 'match'),
    (new.id, 'wager');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.handle_new_profile();

-- ============================================
-- Game Sessions
-- ============================================
create table public.game_sessions (
  id uuid primary key default uuid_generate_v4(),
  game_type text not null check (game_type in ('asteroid', 'race', 'match', 'wager')),
  mode text not null check (mode in ('ranked', 'unranked', 'friend')),
  player1_id uuid not null references public.profiles(id),
  player2_id uuid references public.profiles(id),
  player1_score integer not null default 0,
  player2_score integer not null default 0,
  winner_id uuid references public.profiles(id),
  duration_ms integer,
  pair_set_id uuid,
  created_at timestamptz not null default now()
);

alter table public.game_sessions enable row level security;

create policy "Players can view their own games"
  on public.game_sessions for select
  using (auth.uid() = player1_id or auth.uid() = player2_id);

create policy "Authenticated users can insert game sessions"
  on public.game_sessions for insert
  with check (auth.uid() = player1_id);

-- ============================================
-- User Stats (aggregated)
-- ============================================
create table public.user_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null check (game_type in ('asteroid', 'race', 'match', 'wager')),
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  avg_time_ms integer not null default 0,
  best_score integer not null default 0,
  current_streak integer not null default 0,
  primary key (user_id, game_type)
);

alter table public.user_stats enable row level security;

create policy "Stats are viewable by everyone"
  on public.user_stats for select
  using (true);

create policy "Users can update own stats"
  on public.user_stats for update
  using (auth.uid() = user_id);

create policy "Users can insert own stats"
  on public.user_stats for insert
  with check (auth.uid() = user_id);

-- ============================================
-- Badges
-- ============================================
create table public.badges (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text not null,
  icon_url text not null default '',
  criteria_type text not null check (criteria_type in ('elo_threshold', 'games_played', 'win_streak')),
  criteria_value integer not null,
  game_type text check (game_type in ('asteroid', 'race', 'match', 'wager'))
);

alter table public.badges enable row level security;

create policy "Badges are viewable by everyone"
  on public.badges for select
  using (true);

-- Seed some default badges
insert into public.badges (name, description, criteria_type, criteria_value, game_type) values
  ('Bronze Translator', 'Reach 1200 Elo in any game', 'elo_threshold', 1200, null),
  ('Silver Translator', 'Reach 1400 Elo in any game', 'elo_threshold', 1400, null),
  ('Gold Translator', 'Reach 1600 Elo in any game', 'elo_threshold', 1600, null),
  ('Diamond Translator', 'Reach 1800 Elo in any game', 'elo_threshold', 1800, null),
  ('First Steps', 'Play 1 game', 'games_played', 1, null),
  ('Getting Started', 'Play 10 games', 'games_played', 10, null),
  ('Dedicated Learner', 'Play 50 games', 'games_played', 50, null),
  ('Language Warrior', 'Play 100 games', 'games_played', 100, null),
  ('Hot Streak', 'Win 5 games in a row', 'win_streak', 5, null),
  ('Unstoppable', 'Win 10 games in a row', 'win_streak', 10, null),
  ('Speed Demon', 'Reach 1400 Elo in Translation Race', 'elo_threshold', 1400, 'race'),
  ('Sharpshooter', 'Reach 1400 Elo in Asteroid Shooter', 'elo_threshold', 1400, 'asteroid'),
  ('Memory Master', 'Reach 1400 Elo in Memory Match', 'elo_threshold', 1400, 'match'),
  ('High Roller', 'Reach 1400 Elo in Wager Mode', 'elo_threshold', 1400, 'wager');

-- ============================================
-- User Badges (earned badges)
-- ============================================
create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;

create policy "User badges are viewable by everyone"
  on public.user_badges for select
  using (true);

create policy "Users can insert own badges"
  on public.user_badges for insert
  with check (auth.uid() = user_id);

-- ============================================
-- Custom Pair Sets (Quizlet mode)
-- ============================================
create table public.custom_pair_sets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  language_from text not null default 'en',
  language_to text not null default 'es',
  is_public boolean not null default false,
  pairs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.custom_pair_sets enable row level security;

create policy "Public pair sets are viewable by everyone"
  on public.custom_pair_sets for select
  using (is_public = true or auth.uid() = user_id);

create policy "Users can manage own pair sets"
  on public.custom_pair_sets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own pair sets"
  on public.custom_pair_sets for update
  using (auth.uid() = user_id);

create policy "Users can delete own pair sets"
  on public.custom_pair_sets for delete
  using (auth.uid() = user_id);

-- ============================================
-- Friends
-- ============================================
create table public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

alter table public.friends enable row level security;

create policy "Users can view own friendships"
  on public.friends for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can send friend requests"
  on public.friends for insert
  with check (auth.uid() = user_id);

create policy "Users can update friendships they're part of"
  on public.friends for update
  using (auth.uid() = friend_id);

-- ============================================
-- Indexes for performance
-- ============================================
create index idx_elo_ratings_user on public.elo_ratings(user_id);
create index idx_game_sessions_player1 on public.game_sessions(player1_id);
create index idx_game_sessions_player2 on public.game_sessions(player2_id);
create index idx_game_sessions_created on public.game_sessions(created_at desc);
create index idx_user_stats_user on public.user_stats(user_id);
create index idx_user_badges_user on public.user_badges(user_id);
create index idx_custom_pairs_user on public.custom_pair_sets(user_id);
create index idx_custom_pairs_public on public.custom_pair_sets(is_public) where is_public = true;
create index idx_friends_user on public.friends(user_id);
create index idx_friends_friend on public.friends(friend_id);
