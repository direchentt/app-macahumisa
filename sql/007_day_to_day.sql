-- Recordatorios, compras, notas del día a día (integrado con listas compartidas opcional)

CREATE TABLE user_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_list_id UUID REFERENCES shared_lists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  repeat_kind VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (repeat_kind IN ('none', 'daily', 'weekly', 'monthly')),
  reminder_kind VARCHAR(30) NOT NULL DEFAULT 'reminder'
    CHECK (reminder_kind IN ('reminder', 'expiration', 'agenda', 'routine')),
  meta JSONB,
  last_notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_reminders_user_due ON user_reminders (user_id, remind_at)
  WHERE completed_at IS NULL;
CREATE INDEX idx_user_reminders_list ON user_reminders (shared_list_id)
  WHERE shared_list_id IS NOT NULL AND completed_at IS NULL;

CREATE TABLE shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_list_id UUID REFERENCES shared_lists(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_items_user ON shopping_items (user_id, done, sort_order);
CREATE INDEX idx_shopping_items_list ON shopping_items (shared_list_id, done, sort_order)
  WHERE shared_list_id IS NOT NULL;

CREATE TABLE user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_list_id UUID REFERENCES shared_lists(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_notes_user ON user_notes (user_id, pinned DESC, created_at DESC);
CREATE INDEX idx_user_notes_list ON user_notes (shared_list_id, created_at DESC)
  WHERE shared_list_id IS NOT NULL;
