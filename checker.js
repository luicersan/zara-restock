// Corre fuera del Worker: en GitHub Actions o en un ordenador propio
// (CLAUDE.md, SPEC.md §7.3). Es el único proceso que habla con Zara, vía
// Puppeteer (src/zara-fetch.js), porque Zara bloquea con un challenge de
// Akamai cualquier petición que no sea un navegador real ejecutando
// JavaScript (ZARA-API.md). El Worker sigue siendo quien decide si hay que
// avisar y quien envía el correo (src/check.js, src/mail.js): este script
// solo consulta disponibilidad y envía resultados crudos.
//
// DE UN SOLO DISPARO: hace una ronda y termina con código 0. Sin bucle, sin
// setInterval, sin demonio — la periodicidad la pone quien lo lanza (el
// `schedule` de GitHub Actions o un systemd timer). No añadas un `while
// (true)` aquí (CLAUDE.md).
//
// Uso: WORKER_URL=https://tu-worker.workers.dev CHECKER_TOKEN=... node checker.js

import puppeteer from "puppeteer";
import { fetchProduct } from "./src/zara-fetch.js";
import { evaluateSize } from "./src/check.js";

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8787";
const CHECKER_TOKEN = process.env.CHECKER_TOKEN || "";

function log(mensaje) {
  console.log(`[${new Date().toISOString()}] ${mensaje}`);
}

async function fetchStatus() {
  const response = await fetch(`${WORKER_URL}/api/status`);
  if (!response.ok) {
    throw new Error(`GET /api/status respondió ${response.status}`);
  }
  return response.json();
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
    headers: {
      "Content-Type": "application/json",
      "X-Checker-Token": CHECKER_TOKEN,
    },
    body: JSON.stringify({ results }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/check-results respondió ${response.status}`);
  }
}

async function checkItem(item, browser) {
  try {
    const product = await fetchProduct(item.productId, item.variantId, browser);
    const available = evaluateSize(product.sizes, item.size);
    return { itemId: item.id, available, name: product.name, error: null };
  } catch (err) {
    return { itemId: item.id, available: null, name: null, error: err.message };
  }
}

async function runRound(items) {
  log(`comprobando ${items.length} artículo(s)...`);
  const results = [];
  const browser = await puppeteer.launch({ headless: true });
  try {
    // En serie, no en paralelo: un artículo con error no debe interrumpir a
    // los demás (SPEC.md §3.4). Un único navegador para toda la ronda, una
    // pestaña por artículo (SPEC.md §3.4).
    for (const item of items) {
      const result = await checkItem(item, browser);
      results.push(result);
      const detalle = result.error ? `ERROR: ${result.error}` : result.available ? "disponible" : "agotado";
      log(`  #${item.id} talla ${item.size} (${item.productId}/${item.variantId ?? "sin v1"}): ${detalle}`);
    }
  } finally {
    await browser.close();
  }
  await postResults(results);
}

async function main() {
  log(`arrancando, WORKER_URL=${WORKER_URL}`);

  const status = await fetchStatus();
  if (!status.run) {
    log(`fuera de servicio (paused=${status.paused}, dentro_de_ventana=${status.dentro_de_ventana}): salgo sin abrir Puppeteer.`);
    return;
  }

  const { items } = await fetchItems();
  if (items.length === 0) {
    log("no hay artículos que comprobar.");
    return;
  }

  await runRound(items);
  log("ronda completada.");
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] error en la ronda: ${err.message}`);
  process.exitCode = 1;
});
