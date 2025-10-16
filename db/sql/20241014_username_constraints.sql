-- Ensure usernames remain unique regardless of letter casing and strip stray whitespace
UPDATE public.profiles
SET username = NULLIF(trim(username), '')
WHERE username IS NOT NULL
  AND username <> trim(username);

-- Enforce case-insensitive uniqueness (lowercasing within the index)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;
