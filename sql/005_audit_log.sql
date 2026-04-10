-- Historial de cambios en gastos (auditoría) + índices
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(16) NOT NULL,
  summary TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}',
  request_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_entity_type_chk CHECK (entity_type IN ('expense')),
  CONSTRAINT audit_log_action_chk CHECK (action IN ('create', 'update', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_time ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
