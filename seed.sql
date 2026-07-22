-- Articulos iniciales. Cargar DESPUES de que la aplicacion funcione.
--
-- Estos INSERT dejan name a NULL y available a 0: la primera ejecucion del cron
-- rellenara el nombre y el estado real. Si algun articulo ya esta disponible en
-- ese momento, se recibira un correo. Es lo esperado.
--
-- Alternativa recomendada: dar de alta los cinco desde la interfaz. Asi se
-- valida la talla y se guarda el nombre en el momento del alta.
--
--   npx wrangler d1 execute zara-restock --remote --file=seed.sql

INSERT INTO items (url, product_id, variant_id, size, available, created_at) VALUES
('https://www.zara.com/es/es/top-halter-punto-stretch-p05584397.html?v1=517756025',
 '05584397', '517756025', 'S',  0, datetime('now')),

('https://www.zara.com/es/es/mule-pespuntes-tacon-p12306710.html?v1=495698459',
 '12306710', '495698459', '37', 0, datetime('now')),

('https://www.zara.com/es/es/falda-pantalon-p03152400.html?v1=502289178',
 '03152400', '502289178', 'XS', 0, datetime('now')),

('https://www.zara.com/es/es/bota-kitten-serraje-p13009610.html?v1=495716764',
 '13009610', '495716764', '37', 0, datetime('now')),

('https://www.zara.com/es/es/vestido-mini-halter-brillos-p05063313.html?v1=527349681',
 '05063313', '527349681', 'S',  0, datetime('now'));
