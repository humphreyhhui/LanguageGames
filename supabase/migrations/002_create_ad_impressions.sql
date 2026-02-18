-- Ad Impressions: track ad shown to which user, for analytics
create table public.ad_impressions (
  id uuid primary key default uuid_generate_v4(),
  ad_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null,
  game_session_id uuid references public.game_sessions(id),
  shown_at timestamptz not null default now(),
  dismissed_at timestamptz,
  duration_viewed_ms integer
);

alter table public.ad_impressions enable row level security;

create policy "Users can view own impressions"
  on public.ad_impressions for select using (auth.uid() = user_id);

create policy "Users can insert own impressions"
  on public.ad_impressions for insert with check (auth.uid() = user_id);

create policy "Users can update own impressions"
  on public.ad_impressions for update using (auth.uid() = user_id);

create index idx_ad_impressions_user on public.ad_impressions(user_id);
create index idx_ad_impressions_ad on public.ad_impressions(ad_id);
