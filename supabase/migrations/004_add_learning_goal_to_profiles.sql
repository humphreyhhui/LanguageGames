-- Add learning_goal to profiles for personalized vocabulary recommendations
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS learning_goal text NOT NULL DEFAULT 'general';

COMMENT ON COLUMN public.profiles.learning_goal IS 'User reason for learning: travel, work, school, culture, relationship, general';
