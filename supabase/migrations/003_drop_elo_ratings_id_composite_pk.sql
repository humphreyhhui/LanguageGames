-- Drop elo_ratings surrogate id, use (user_id, game_type) as composite PK (3NF audit)
ALTER TABLE public.elo_ratings DROP CONSTRAINT elo_ratings_pkey;
ALTER TABLE public.elo_ratings DROP CONSTRAINT elo_ratings_user_id_game_type_key;
ALTER TABLE public.elo_ratings DROP COLUMN id;
ALTER TABLE public.elo_ratings ADD PRIMARY KEY (user_id, game_type);
