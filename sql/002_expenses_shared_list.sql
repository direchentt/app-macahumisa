ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS shared_list_id UUID REFERENCES shared_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_shared_list
  ON expenses (shared_list_id)
  WHERE deleted_at IS NULL AND shared_list_id IS NOT NULL;
