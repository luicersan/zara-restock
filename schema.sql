-- Esquema de la base de datos D1.
-- Aplicar con:
--   npx wrangler d1 execute zara-restock --local  --file=schema.sql
--   npx wrangler d1 execute zara-restock --remote --file=schema.sql

DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS settings;

CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store           TEXT    NOT NULL DEFAULT 'zara', -- 'zara' o 'bershka'
  url             TEXT    NOT NULL,              -- URL limpia, sin parametros utm_*
  product_id      TEXT    NOT NULL,              -- 05584397, de "...-p05584397.html"
  variant_id      TEXT,                          -- 517756025, del parametro v1/colorId
  size            TEXT    NOT NULL,              -- etiqueta de talla normalizada
  name            TEXT,                          -- nombre cacheado, para el correo
  available       INTEGER NOT NULL DEFAULT 0,    -- 0 agotado, 1 disponible
  last_checked_at TEXT,                          -- ISO 8601 UTC. NULL => "Pendiente"
  last_error      TEXT,                          -- NULL si la ultima comprobacion fue bien
  created_at      TEXT    NOT NULL
);

-- Evita dar de alta dos veces el mismo articulo, color y talla. Incluye
-- store: dos tiendas distintas podrian coincidir en product_id por azar.
CREATE UNIQUE INDEX idx_items_unico ON items(store, product_id, variant_id, size);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES
  ('notification_email', ''),
  ('paused',             '0'),
  -- PIN de pausa. CAMBIALO EN EL PRIMER ARRANQUE.
  -- No es un mecanismo de seguridad (SPEC.md 3.3): solo evita pulsaciones
  -- accidentales. La aplicacion no tiene login y borrar no pide PIN.
  ('pause_pin',          '0000');
