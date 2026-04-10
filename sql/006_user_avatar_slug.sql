-- Símbolo de perfil elegido por el usuario (slug → carácter Unicode en la app)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_slug VARCHAR(32);
