-- Add materiality threshold to org_settings
-- Used by AI summary generation to filter watch areas
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS materiality_threshold DECIMAL DEFAULT 0.10;
