-- Esquema de la base de datos D1.
-- Aplicar con:
--   npx wrangler d1 execute zara-restock --local  --file=schema.sql
--   npx wrangler d1 execute zara-restock --remote --file=schema.sql

DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS settings;

CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT    NOT NULL,              -- URL limpia, sin parametros utm_*
  product_id      TEXT    NOT NULL,              -- 05584397, de "...-p05584397.html"
  variant_id      TEXT,                          -- 517756025, del parametro v1 (color)
  size            TEXT    NOT NULL,              -- etiqueta de talla normalizada
  name            TEXT,                          -- nombre cacheado, para el correo
  available       INTEGER NOT NULL DEFAULT 0,    -- 0 agotado, 1 disponible
  last_checked_at TEXT,                          -- ISO 8601 UTC
  last_error      TEXT,                          -- NULL si la ultima comprobacion fue bien
  created_at      TEXT    NOT NULL
);

-- Evita dar de alta dos veces el mismo articulo, color y talla.
CREATE UNIQUE INDEX idx_items_unico ON items(product_id, variant_id, size);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES ('notification_email', '');
