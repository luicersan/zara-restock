// Único fichero que sabe cómo funciona Zara por dentro. Ver ZARA-API.md.
//
// fetchProduct() usa Puppeteer y solo se ejecuta desde check-local.js: un
// Worker de Cloudflare no puede lanzar un navegador, y Zara bloquea con un
// challenge de Akamai cualquier petición que no sea un navegador real
// ejecutando JavaScript. parseUrl() y normalize() no dependen de Puppeteer:
// también las usa el Worker.

import puppeteer from "puppeteer";

const PRODUCT_ID_RE = /-p(\d+)\.html/;
const VIEW_PAYLOAD_RE = /window\.zara\.viewPayload\s*=\s*(\{[\s\S]*?\});<\/script>/;

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

/**
 * Consulta la disponibilidad real de un producto en zara.com.
 *
 * @returns {Promise<{name: string, sizes: Array<{label: string, status: string}>}>}
 */
export async function fetchProduct(productId, variantId) {
  const url = `https://www.zara.com/es/es/producto-p${productId}.html${variantId ? `?v1=${variantId}` : ""}`;

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "es-ES,es;q=0.9" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // El challenge de Akamai y la telemetría de fondo hacen que la red nunca
    // quede inactiva, así que no se puede esperar a networkidle2.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const html = await page.content();
    const match = html.match(VIEW_PAYLOAD_RE);
    if (!match) {
      throw new Error(`No se ha encontrado window.zara.viewPayload para el producto ${productId}`);
    }

    const payload = JSON.parse(match[1]);
    const colors = payload?.product?.detail?.colors ?? [];
    const color = variantId
      ? colors.find((c) => String(c.productId) === String(variantId))
      : colors[0];
    if (!color) {
      throw new Error(`No se ha encontrado la variante ${variantId} del producto ${productId}`);
    }

    return {
      name: payload.product.name,
      sizes: (color.sizes ?? []).map((s) => ({ label: s.name, status: s.availability })),
    };
  } finally {
    await browser.close();
  }
}
