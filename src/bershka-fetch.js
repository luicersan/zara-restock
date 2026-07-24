// La parte de "cómo funciona Bershka por dentro" que sí habla con Bershka.
// Usa Puppeteer, así que **solo la importa checker.js**, nunca src/index.js
// ni nada que se despliegue al Worker (ver la nota en src/bershka.js).
//
// Confirmado en el paso 0 (BERSHKA-API.md): Bershka bloquea con el mismo
// challenge de Akamai que Zara. La diferencia es dónde vive la
// disponibilidad: no es JSON estático en el HTML, es `window.__NUXT__`, una
// función autoejecutada que reconstruye el estado en tiempo de ejecución. No
// se puede sacar con una regex — hay que leerla con page.evaluate() una vez
// que el navegador ya la ha ejecutado.

import puppeteer from "puppeteer";

/**
 * Consulta la disponibilidad real de un producto en bershka.com.
 *
 * Igual que fetchProduct() de src/zara-fetch.js, acepta un `browser` de
 * Puppeteer ya lanzado para reutilizarlo entre artículos de la misma ronda
 * (checker.js). Sin ese argumento, lanza y cierra su propio navegador.
 *
 * @returns {Promise<{name: string, sizes: Array<{label: string, status: string}>}>}
 */
export async function fetchProduct(productId, variantId, browser) {
  const url = `https://www.bershka.com/es/c0p${productId}.html${variantId ? `?colorId=${variantId}` : ""}`;

  const browserPropio = !browser;
  const b = browser ?? (await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }));
  try {
    const page = await b.newPage();
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({ "Accept-Language": "es-ES,es;q=0.9" });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Igual que en Zara: el challenge de Akamai y la telemetría de fondo
      // hacen que la red nunca quede inactiva, así que no se espera a
      // networkidle2 (BERSHKA-API.md).
      await new Promise((resolve) => setTimeout(resolve, 4000));

      const currentProduct = await page.evaluate(
        () => window.__NUXT__?.pinia?.productDetail?.currentProduct ?? null
      );
      if (!currentProduct) {
        throw new Error(`No se ha encontrado window.__NUXT__.pinia.productDetail.currentProduct para el producto ${productId}`);
      }

      const colors = currentProduct.colors ?? [];
      const color = variantId
        ? colors.find((c) => String(c.id) === String(variantId))
        : colors[0];
      if (!color) {
        throw new Error(`No se ha encontrado el color ${variantId} del producto ${productId}`);
      }

      return {
        name: currentProduct.name,
        // Descarta la talla fantasma "lilBsk" (BERSHKA-API.md): no es una
        // talla real, es una clave de traducción sin resolver.
        sizes: (color.sizes ?? [])
          .filter((s) => !s.isLilBsk)
          .map((s) => ({ label: s.name, status: s.stock })),
      };
    } finally {
      await page.close();
    }
  } finally {
    if (browserPropio) await b.close();
  }
}
