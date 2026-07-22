// La parte de "cómo funciona Zara por dentro" que sí habla con Zara. Usa
// Puppeteer, así que **solo la importa check-local.js**, nunca src/index.js
// ni nada que se despliegue al Worker (ver la nota en src/zara.js).
//
// Confirmado en el paso 0 (ZARA-API.md): Zara bloquea con un challenge de
// Akamai cualquier petición que no sea un navegador real ejecutando
// JavaScript. Puppeteer headless lo pasa; un `fetch()` plano no.

import puppeteer from "puppeteer";

const VIEW_PAYLOAD_RE = /window\.zara\.viewPayload\s*=\s*(\{[\s\S]*?\});<\/script>/;

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
