// Parte de "cómo funciona Zara por dentro" que no depende de Puppeteer:
// la usan tanto el Worker como check-local.js. Ver ZARA-API.md.
//
// fetchProduct() (la parte que sí habla con Zara) vive aparte, en
// src/zara-fetch.js: importa Puppeteer, y Puppeteer usa módulos nativos de
// Node (fs, crypto, child_process...) que el bundler de Workers no puede
// empaquetar. Si fetchProduct() estuviera en este mismo fichero, `wrangler
// dev`/`deploy` fallarían en cuanto index.js importase normalize()/parseUrl()
// de aquí, aunque nunca llamase a fetchProduct(). Comprobado con wrangler dev.

const PRODUCT_ID_RE = /-p(\d+)\.html/;

/**
 * Extrae product_id y variant_id de una URL de ficha de producto de Zara, y
 * devuelve la URL limpia (sin utm_* ni otros parámetros de seguimiento).
 *
 * @returns {{ productId: string, variantId: string|null, cleanUrl: string }}
 */
export function parseUrl(rawUrl) {
  const url = new URL(rawUrl);
  const match = url.pathname.match(PRODUCT_ID_RE);
  if (!match) {
    throw new Error(`No se ha podido extraer el identificador de producto de la URL: ${rawUrl}`);
  }
  const productId = match[1];
  const variantId = url.searchParams.get("v1");
  url.search = variantId ? `?v1=${variantId}` : "";
  return { productId, variantId, cleanUrl: url.toString() };
}

/**
 * Normaliza una etiqueta de talla para poder compararla: sin espacios,
 * mayúsculas. "s" y "S" y "37 " y "37" casan; "38" y "37" no.
 */
export function normalize(s) {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}
