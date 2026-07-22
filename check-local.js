// Corre en el ordenador, no se despliega al Worker (CLAUDE.md). Es el único
// proceso que habla con Zara: usa Puppeteer vía src/zara-fetch.js, porque
// Zara bloquea con un challenge de Akamai cualquier petición que no sea un
// navegador real ejecutando JavaScript (ZARA-API.md). El Worker sigue siendo
// quien decide si hay que avisar y quien envía el correo (src/check.js,
// src/mail.js): este script solo consulta disponibilidad y envía resultados
// crudos.
//
// Uso: WORKER_URL=https://tu-worker.workers.dev node check-local.js

import { fetchProduct } from "./src/zara-fetch.js";
import { evaluateSize } from "./src/check.js";

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8787";
const ROUND_INTERVAL_MS = 120_000;
const TICK_INTERVAL_MS = 15_000;

function log(mensaje) {
  console.log(`[${new Date().toISOString()}] ${mensaje}`);
}

async function fetchItems() {
  const response = await fetch(`${WORKER_URL}/api/items`);
  if (!response.ok) {
    throw new Error(`GET /api/items respondió ${response.status}`);
  }
  return response.json();
}

async function postResults(results) {
  const response = await fetch(`${WORKER_URL}/api/check-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/check-results respondió ${response.status}`);
  }
}

async function checkItem(item) {
  try {
    const product = await fetchProduct(item.productId, item.variantId);
    const available = evaluateSize(product.sizes, item.size);
    return { itemId: item.id, available, name: product.name, error: null };
  } catch (err) {
    return { itemId: item.id, available: null, name: null, error: err.message };
  }
}

async function runRound(items) {
  log(`comprobando ${items.length} artículo(s)...`);
  const results = [];
  // En serie, no en paralelo: un artículo con error no debe interrumpir a
  // los demás (SPEC.md §3.4), y varias instancias de Chromium a la vez es
  // justo la clase de complejidad que este proyecto quiere evitar.
  for (const item of items) {
    const result = await checkItem(item);
    results.push(result);
    const detalle = result.error ? `ERROR: ${result.error}` : result.available ? "disponible" : "agotado";
    log(`  #${item.id} talla ${item.size} (${item.productId}/${item.variantId ?? "sin v1"}): ${detalle}`);
  }
  await postResults(results);
}

async function main() {
  log(`arrancando, WORKER_URL=${WORKER_URL}`);
  let lastRound = 0;

  for (;;) {
    let items = [];
    let checkRequested = false;
    try {
      ({ items, checkRequested } = await fetchItems());
    } catch (err) {
      log(`no se ha podido consultar /api/items: ${err.message}`);
    }

    const tocaRonda = Date.now() - lastRound >= ROUND_INTERVAL_MS || checkRequested;
    if (tocaRonda && items.length > 0) {
      try {
        await runRound(items);
      } catch (err) {
        log(`error en la ronda de comprobación: ${err.message}`);
      }
      lastRound = Date.now();
    } else if (tocaRonda) {
      lastRound = Date.now();
    }

    await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
  }
}

main();
