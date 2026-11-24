ALTER TABLE player_profiles
ADD COLUMN total_earned_points integer NOT NULL DEFAULT 0;

-- Existing profiles begin tracking from their last known wallet balance.
UPDATE player_profiles
SET total_earned_points = total_points;
