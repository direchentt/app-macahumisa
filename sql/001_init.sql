-- PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  profile_picture_url TEXT,
  currency VARCHAR(3) DEFAULT 'USD',
  timezone VARCHAR(50),
  language VARCHAR(10),
  dark_mode BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  tags TEXT[],
  notes TEXT,
  source VARCHAR(50),
  is_income BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency VARCHAR(20),
  merchant VARCHAR(255),
  receipt_url TEXT,
  status VARCHAR(20),
  shared_with TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_expenses_user_date ON expenses (user_id, date DESC) WHERE deleted_at IS NULL;

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  category VARCHAR(50) NOT NULL,
  limit_amount DECIMAL(12, 2) NOT NULL,
  period VARCHAR(20) NOT NULL,
  alert_threshold INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shared_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  members TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  list_id UUID NOT NULL REFERENCES shared_lists(id),
  role VARCHAR(20) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, list_id)
);
