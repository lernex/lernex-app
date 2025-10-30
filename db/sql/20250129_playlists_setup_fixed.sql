-- Playlists Setup Migration (FIXED - No Circular Dependencies)
-- Created: 2025-01-29
-- Fixed: 2025-01-30
-- Description: Creates tables and RLS policies for playlist functionality without infinite recursion

-- ========================================
-- 1. CREATE TABLES
-- ========================================

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playlist items (lessons in playlists)
CREATE TABLE IF NOT EXISTS playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(playlist_id, lesson_id) -- Prevent duplicate lessons in same playlist
);

-- Playlist memberships (sharing and collaboration)
CREATE TABLE IF NOT EXISTS playlist_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(playlist_id, profile_id) -- One membership per user per playlist
);

-- ========================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON playlists(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_lesson_id ON playlist_items(lesson_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON playlist_items(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_playlist_memberships_playlist_id ON playlist_memberships(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_memberships_profile_id ON playlist_memberships(profile_id);

-- ========================================
-- 3. CREATE TRIGGERS FOR UPDATED_AT
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_playlists_updated_at ON playlists;
CREATE TRIGGER update_playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ========================================

ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_memberships ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 5. DROP EXISTING POLICIES (IF ANY)
-- ========================================

DROP POLICY IF EXISTS "Users can view their own playlists" ON playlists;
DROP POLICY IF EXISTS "Users can view playlists they are members of" ON playlists;
DROP POLICY IF EXISTS "Users can view public playlists" ON playlists;
DROP POLICY IF EXISTS "Users can create their own playlists" ON playlists;
DROP POLICY IF EXISTS "Users can update their own playlists" ON playlists;
DROP POLICY IF EXISTS "Moderators can update playlists" ON playlists;
DROP POLICY IF EXISTS "Users can delete their own playlists" ON playlists;

DROP POLICY IF EXISTS "Users can view items in their playlists" ON playlist_items;
DROP POLICY IF EXISTS "Users can view items in playlists they are members of" ON playlist_items;
DROP POLICY IF EXISTS "Users can view items in public playlists" ON playlist_items;
DROP POLICY IF EXISTS "Users can add items to their own playlists" ON playlist_items;
DROP POLICY IF EXISTS "Moderators can add items to playlists" ON playlist_items;
DROP POLICY IF EXISTS "Users can update items in their own playlists" ON playlist_items;
DROP POLICY IF EXISTS "Moderators can update items in playlists" ON playlist_items;
DROP POLICY IF EXISTS "Users can delete items from their own playlists" ON playlist_items;
DROP POLICY IF EXISTS "Moderators can delete items from playlists" ON playlist_items;

DROP POLICY IF EXISTS "Users can view memberships for their playlists" ON playlist_memberships;
DROP POLICY IF EXISTS "Users can view their own memberships" ON playlist_memberships;
DROP POLICY IF EXISTS "Users can create memberships for their playlists" ON playlist_memberships;
DROP POLICY IF EXISTS "Users can update memberships for their playlists" ON playlist_memberships;
DROP POLICY IF EXISTS "Users can delete memberships from their playlists" ON playlist_memberships;

-- Service role policies
DROP POLICY IF EXISTS "Service role has full access to playlists" ON playlists;
DROP POLICY IF EXISTS "Service role has full access to playlist_items" ON playlist_items;
DROP POLICY IF EXISTS "Service role has full access to playlist_memberships" ON playlist_memberships;

-- ========================================
-- 6. HELPER FUNCTIONS (SECURITY DEFINER)
-- ========================================
-- These functions bypass RLS to avoid circular dependencies

-- Check if user has membership access to a playlist
CREATE OR REPLACE FUNCTION has_playlist_membership(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM playlist_memberships
    WHERE playlist_id = p_playlist_id
      AND profile_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a moderator of a playlist
CREATE OR REPLACE FUNCTION is_playlist_moderator(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM playlist_memberships
    WHERE playlist_id = p_playlist_id
      AND profile_id = p_user_id
      AND role = 'moderator'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if playlist is public
CREATE OR REPLACE FUNCTION is_playlist_public(p_playlist_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM playlists
    WHERE id = p_playlist_id
      AND is_public = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user owns playlist
CREATE OR REPLACE FUNCTION owns_playlist(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM playlists
    WHERE id = p_playlist_id
      AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 7. CREATE RLS POLICIES FOR PLAYLISTS
-- ========================================
-- FIXED: Using SECURITY DEFINER functions to avoid circular dependencies

-- SELECT policies (reading playlists)
CREATE POLICY "Users can view their own playlists"
  ON playlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view playlists they are members of"
  ON playlists FOR SELECT
  USING (has_playlist_membership(id, auth.uid()));

CREATE POLICY "Users can view public playlists"
  ON playlists FOR SELECT
  USING (is_public = true);

-- INSERT policies (creating playlists)
CREATE POLICY "Users can create their own playlists"
  ON playlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE policies (editing playlists)
CREATE POLICY "Users can update their own playlists"
  ON playlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Moderators can update playlists"
  ON playlists FOR UPDATE
  USING (is_playlist_moderator(id, auth.uid()))
  WITH CHECK (is_playlist_moderator(id, auth.uid()));

-- DELETE policies (deleting playlists)
CREATE POLICY "Users can delete their own playlists"
  ON playlists FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- 8. CREATE RLS POLICIES FOR PLAYLIST_ITEMS
-- ========================================
-- FIXED: Using SECURITY DEFINER functions to avoid circular dependencies

-- SELECT policies (reading playlist items)
CREATE POLICY "Users can view items in their playlists"
  ON playlist_items FOR SELECT
  USING (owns_playlist(playlist_id, auth.uid()));

CREATE POLICY "Users can view items in playlists they are members of"
  ON playlist_items FOR SELECT
  USING (has_playlist_membership(playlist_id, auth.uid()));

CREATE POLICY "Users can view items in public playlists"
  ON playlist_items FOR SELECT
  USING (is_playlist_public(playlist_id));

-- INSERT policies (adding items to playlists)
CREATE POLICY "Users can add items to their own playlists"
  ON playlist_items FOR INSERT
  WITH CHECK (owns_playlist(playlist_id, auth.uid()));

CREATE POLICY "Moderators can add items to playlists"
  ON playlist_items FOR INSERT
  WITH CHECK (is_playlist_moderator(playlist_id, auth.uid()));

-- UPDATE policies (updating playlist items)
CREATE POLICY "Users can update items in their own playlists"
  ON playlist_items FOR UPDATE
  USING (owns_playlist(playlist_id, auth.uid()))
  WITH CHECK (owns_playlist(playlist_id, auth.uid()));

CREATE POLICY "Moderators can update items in playlists"
  ON playlist_items FOR UPDATE
  USING (is_playlist_moderator(playlist_id, auth.uid()))
  WITH CHECK (is_playlist_moderator(playlist_id, auth.uid()));

-- DELETE policies (removing items from playlists)
CREATE POLICY "Users can delete items from their own playlists"
  ON playlist_items FOR DELETE
  USING (owns_playlist(playlist_id, auth.uid()));

CREATE POLICY "Moderators can delete items from playlists"
  ON playlist_items FOR DELETE
  USING (is_playlist_moderator(playlist_id, auth.uid()));

-- ========================================
-- 9. CREATE RLS POLICIES FOR PLAYLIST_MEMBERSHIPS
-- ========================================
-- FIXED: Simplified to avoid querying playlists table

-- SELECT policies (viewing memberships)
-- Allow users to see memberships for playlists they own (checked via function)
CREATE POLICY "Users can view memberships for their playlists"
  ON playlist_memberships FOR SELECT
  USING (owns_playlist(playlist_id, auth.uid()));

-- Allow users to see their own memberships
CREATE POLICY "Users can view their own memberships"
  ON playlist_memberships FOR SELECT
  USING (auth.uid() = profile_id);

-- INSERT policies (creating memberships)
CREATE POLICY "Users can create memberships for their playlists"
  ON playlist_memberships FOR INSERT
  WITH CHECK (owns_playlist(playlist_id, auth.uid()));

-- UPDATE policies (updating memberships)
CREATE POLICY "Users can update memberships for their playlists"
  ON playlist_memberships FOR UPDATE
  USING (owns_playlist(playlist_id, auth.uid()))
  WITH CHECK (owns_playlist(playlist_id, auth.uid()));

-- DELETE policies (removing memberships)
CREATE POLICY "Users can delete memberships from their playlists"
  ON playlist_memberships FOR DELETE
  USING (owns_playlist(playlist_id, auth.uid()));

-- ========================================
-- 10. SERVICE ROLE BYPASS POLICIES
-- ========================================
-- These allow the API routes to work with the service role key

CREATE POLICY "Service role has full access to playlists"
  ON playlists
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to playlist_items"
  ON playlist_items
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to playlist_memberships"
  ON playlist_memberships
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ========================================
-- 11. ADDITIONAL HELPER FUNCTIONS
-- ========================================

-- Function to check if user has permission to modify playlist
CREATE OR REPLACE FUNCTION user_can_modify_playlist(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN owns_playlist(p_playlist_id, p_user_id)
    OR is_playlist_moderator(p_playlist_id, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get playlist with permission info
CREATE OR REPLACE FUNCTION get_playlist_with_permissions(p_playlist_id UUID, p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  is_public BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID,
  user_role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.is_public,
    p.created_at,
    p.updated_at,
    p.user_id,
    CASE
      WHEN p.user_id = p_user_id THEN 'owner'
      WHEN pm.role = 'moderator' THEN 'moderator'
      WHEN pm.role = 'viewer' THEN 'viewer'
      ELSE 'public_viewer'
    END as user_role
  FROM playlists p
  LEFT JOIN playlist_memberships pm
    ON pm.playlist_id = p.id AND pm.profile_id = p_user_id
  WHERE p.id = p_playlist_id
    AND (
      p.user_id = p_user_id
      OR p.is_public = true
      OR pm.profile_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON playlists TO authenticated;
GRANT ALL ON playlist_items TO authenticated;
GRANT ALL ON playlist_memberships TO authenticated;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION has_playlist_membership(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_playlist_moderator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_playlist_public(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION owns_playlist(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_can_modify_playlist(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_playlist_with_permissions(UUID, UUID) TO authenticated;

-- Verify tables were created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playlists') THEN
    RAISE NOTICE 'Table playlists created successfully';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playlist_items') THEN
    RAISE NOTICE 'Table playlist_items created successfully';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'playlist_memberships') THEN
    RAISE NOTICE 'Table playlist_memberships created successfully';
  END IF;
  RAISE NOTICE 'RLS policies configured without circular dependencies';
END $$;
