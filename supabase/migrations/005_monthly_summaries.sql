-- Monthly Financial Summaries
-- Stores AI-generated and manually edited monthly summary content.
-- One row per (org_id, period); upsert on save.

CREATE TABLE IF NOT EXISTS monthly_summaries (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            UUID        NOT NULL,
  period            TEXT        NOT NULL,  -- YYYY-MM
  overall_headline  TEXT        DEFAULT '',
  overall_narrative TEXT        DEFAULT '',
  monthly_activity  TEXT        DEFAULT '',
  takeaways         JSONB       DEFAULT '[]'::JSONB,
  watch_areas       JSONB       DEFAULT '[]'::JSONB,
  reserves          TEXT        DEFAULT '',
  reserves_note     TEXT        DEFAULT '',
  saved_at          TIMESTAMPTZ DEFAULT NOW(),
  saved_by          TEXT        DEFAULT 'system',
  deleted           BOOLEAN     DEFAULT FALSE,
  UNIQUE(org_id, period)
);

-- Fast lookup by org + period
CREATE INDEX IF NOT EXISTS monthly_summaries_org_period_idx
  ON monthly_summaries(org_id, period)
  WHERE NOT deleted;

-- RLS: enable so anon key can read/write own org rows
ALTER TABLE monthly_summaries ENABLE ROW LEVEL SECURITY;

-- Policy: allow all operations for now (no auth yet)
CREATE POLICY "allow_all_monthly_summaries"
  ON monthly_summaries
  FOR ALL
  USING (true)
  WITH CHECK (true);
