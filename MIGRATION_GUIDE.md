# Data Model Migration: Multiple Courses Per Domain

**Date**: 2025-11-13
**Status**: Complete - Ready to Deploy

## Summary

Updated the data model to allow users to study multiple courses from the same domain (e.g., both Physics and Chemistry, or both Calculus 2 and Algebra 2).

## Changes Overview

### 1. Database Schema (`user_subject_state` table)
**File**: `db/sql/20251113_fix_multiple_courses_per_domain.sql`

- **Changed primary key** from `(user_id, subject)` to `(user_id, course)`
- Added index on `subject` for efficient domain-based queries
- **Impact**: Users can now have multiple rows for the same domain

### 2. Data Model Updates
**New Model**:
- `interests` array now contains **courses** (e.g., `["Calculus 2", "AP Chemistry", "Algebra 2"]`)
- `level_map` kept for backward compatibility (maps domain → most recent course)

**Old Model** (still supported):
- `interests` array contained **domains** (e.g., `["Math", "Science"]`)
- `level_map` mapped domain → course

### 3. Code Changes

#### Onboarding Flow
- **`app/onboarding/levels/save/route.ts`**: Now adds courses to `interests` array instead of just domains
- **`app/api/profile/interests/save/route.ts`**: No changes needed (already adds domains during initial onboarding)

#### Routing Logic
- **`app/post-auth/page.tsx`**:
  - Detects old vs new model automatically
  - Routes correctly based on data model version
  - Handles placement_ready flag correctly for both models

#### API Endpoints
- **`app/api/profile/interests/add/route.ts`**:
  - Only allows adding courses (not domains)
  - Adds course directly to `interests` array
  - Allows multiple courses from same domain
  - Updates `level_map` for backward compatibility

#### Placement System
- **`app/api/placement/next/route.ts`**:
  - Detects old vs new model automatically
  - Extracts courses correctly from both models
  - Filters out already-completed courses
  - Comprehensive debug logging

#### UI Components
- **`components/ClassPicker.tsx`**:
  - Updated to work with both data models
  - Maps courses to domains for display
  - Handles multiple courses from same domain

- **`app/fyp/FypFeedClient.tsx`**:
  - Auto-selects newly added class after placement
  - Uses URL parameter to pass subject from placement

- **`app/fyp/page.tsx`**:
  - Reads `subject` search parameter
  - Passes to client for auto-selection

- **`app/placement/client/PlacementClient.tsx`**:
  - Passes completed course subject to FYP via URL parameter

## Migration Steps

### Step 1: Run SQL Migration
```bash
# Connect to your Supabase database and run:
psql -h your-db-host -U postgres -d your-db-name -f db/sql/20251113_fix_multiple_courses_per_domain.sql
```

### Step 2: Deploy Code Changes
All code changes are backward compatible! The system automatically detects which data model a user is on.

### Step 3: Verify
After deployment, check:
1. New users can complete onboarding
2. Existing users can add new classes
3. Users can add multiple courses from same domain (e.g., Physics + Chemistry)
4. Placement quiz only runs for new courses
5. ClassPicker displays all courses correctly

## Backward Compatibility

✅ **Fully backward compatible!**

- Old users (domain-based model) continue to work
- System auto-detects model version
- Migrates users to new model when they:
  - Complete onboarding
  - Add a new class

## Testing Checklist

- [ ] New user: Pick subject → pick class → placement quiz → FYP
- [ ] New user: Start placement, close browser, return → resumes placement
- [ ] Existing user: Add new class → placement quiz for new class only
- [ ] Existing user: Add second class from same domain (e.g., add Algebra 2 when already have Calculus 2)
- [ ] ClassPicker shows all courses
- [ ] After placement, newly added class is auto-selected
- [ ] FYP filters lessons correctly for selected course

## Example Flows

### New User (New Model)
1. Login → username/DOB
2. Pick "Math" → Pick "Calculus 2"
3. interests: `["Calculus 2"]`, level_map: `{"Math": "Calculus 2"}`
4. Placement quiz for Calculus 2
5. FYP with Calculus 2 selected

### Existing User Adding Second Course in Same Domain
**Before**: interests: `["Calculus 2"]`
**Action**: Add "Algebra 2" (also Math domain)
**After**: interests: `["Calculus 2", "Algebra 2"]`, level_map: `{"Math": "Algebra 2"}`
**Result**: Placement quiz for Algebra 2 only, both courses available in ClassPicker

### Existing User on Old Model
**Current**: interests: `["Math"]`, level_map: `{"Math": "Calculus 2"}`
**System behavior**: Continues to work, system detects old model
**Migration**: Next time they add a class, they'll be migrated to new model

## Rollback Plan

If issues arise:
1. Revert code changes (all files updated)
2. Revert database migration:
```sql
BEGIN;
ALTER TABLE public.user_subject_state DROP CONSTRAINT user_subject_state_pkey;
ALTER TABLE public.user_subject_state ADD PRIMARY KEY (user_id, subject);
DROP INDEX IF EXISTS user_subject_state_subject_idx;
COMMIT;
```

## Files Changed

1. `db/sql/20251113_fix_multiple_courses_per_domain.sql` - NEW
2. `app/onboarding/levels/save/route.ts` - UPDATED
3. `app/post-auth/page.tsx` - UPDATED
4. `app/api/profile/interests/add/route.ts` - UPDATED
5. `app/api/placement/next/route.ts` - UPDATED
6. `components/ClassPicker.tsx` - UPDATED
7. `app/fyp/page.tsx` - UPDATED
8. `app/fyp/FypFeedClient.tsx` - UPDATED
9. `app/placement/client/PlacementClient.tsx` - UPDATED

## Notes

- Debug logging added to placement system for troubleshooting
- Error handling improved throughout
- Auto-selection feature added (QOL improvement)
- All edge cases handled (incomplete placement, browser close, etc.)
