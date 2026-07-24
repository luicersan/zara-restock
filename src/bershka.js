// Parte de "cómo funciona Bershka por dentro" que no depende de Puppeteer: la
// usa tanto el Worker como checker.js. Ver BERSHKA-API.md.
//
// fetchProduct() (la parte que sí habla con Bershka) vive aparte, en
// src/bershka-fetch.js, por la misma razón que src/zara-fetch.js está
// separado de src/zara.js: importa Puppeteer, que el bundler de Workers no
// puede empaquetar (CLAUDE.md).

const PRODUCT_ID_RE = /c0p(\d+)\.html/;

/**
 * Extrae product_id y colorId de una URL de ficha de producto de Bershka, y
 * devuelve la URL limpia (sin utm_* ni otros parámetros de seguimiento).
 *
 * @returns {{ productId: string, variantId: string|null, cleanUrl: string }}
 */
export function parseUrl(rawUrl) {
  const url = new URL(rawUrl.trim());
  const match = url.pathname.match(PRODUCT_ID_RE);
  if (!match) {
    throw new Error(`No se ha podido extraer el identificador de producto de la URL: ${rawUrl}`);
  }
  const productId = match[1];
  const variantId = url.searchParams.get("colorId");
  url.search = variantId ? `?colorId=${variantId}` : "";
  return { productId, variantId, cleanUrl: url.toString() };
}

/**
 * Normaliza una etiqueta de talla para poder compararla. Copia exacta de la
 * de src/zara.js: es una función de tres líneas, y CLAUDE.md prefiere esta
 * duplicación a compartir un módulo "genérico" entre tiendas.
 */
export function normalize(s) {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}
