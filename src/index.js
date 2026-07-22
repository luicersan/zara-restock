// fetch() + enrutado. Sin scheduled(): el cron vive en check-local.js
// (SPEC.md §7.3), no aquí, porque Zara bloquea cualquier petición que no sea
// un navegador real ejecutando JavaScript (ZARA-API.md).

import { renderUI } from "./ui.js";
import { normalize, parseUrl } from "./zara.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function computeStatus(row) {
  if (!row.last_checked_at) return "pendiente";
  if (row.last_error) return "error";
  return row.available ? "disponible" : "agotado";
}

async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(key, value)
    .run();
}

async function handleListItems(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, url, product_id, variant_id, size, name, available, last_checked_at, last_error, created_at FROM items ORDER BY id"
  ).all();

  const items = results.map((row) => ({
    id: row.id,
    url: row.url,
    productId: row.product_id,
    variantId: row.variant_id,
    size: row.size,
    name: row.name,
    available: !!row.available,
    status: computeStatus(row),
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
  }));

  const checkRequested = (await getSetting(env, "check_requested")) === "true";
  return jsonResponse({ items, checkRequested });
}

async function handleCreateItem(request, env) {
  const body = await request.json();
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  const rawSize = typeof body.size === "string" ? body.size.trim() : "";
  if (!rawUrl || !rawSize) {
    return jsonResponse({ error: "Faltan la URL o la talla" }, 400);
  }

  let parsed;
  try {
    parsed = parseUrl(rawUrl);
  } catch (err) {
    return jsonResponse({ error: err.message }, 400);
  }

  const size = normalize(rawSize);
  const now = new Date().toISOString();

  try {
    const result = await env.DB.prepare(
      `INSERT INTO items (url, product_id, variant_id, size, available, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    )
      .bind(parsed.cleanUrl, parsed.productId, parsed.variantId, size, now)
      .run();

    const warning = parsed.variantId
      ? null
      : "La URL no incluye el color (v1): se vigilará el color por defecto del producto.";

    return jsonResponse({ id: result.meta.last_row_id, warning }, 201);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return jsonResponse({ error: "Ya tienes ese artículo con esa talla en la lista" }, 400);
    }
    throw err;
  }
}

async function handleDeleteItem(env, id) {
  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}

async function handleGetSettings(env) {
  const email = await getSetting(env, "notification_email");
  return jsonResponse({ email: email ?? "" });
}

async function handlePutSettings(request, env) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  await setSetting(env, "notification_email", email);
  return jsonResponse({ email });
}

async function handleRequestCheck(env) {
  await setSetting(env, "check_requested", "true");
  return jsonResponse({ ok: true });
}

// Persiste los resultados crudos que envía check-local.js. De momento solo
// actualiza el estado (paso 4); la decisión de notificar y el envío de
// correo se añaden en el paso 6, cuando existan check.js y mail.js.
async function handleCheckResults(request, env) {
  const body = await request.json();
  const results = Array.isArray(body.results) ? body.results : [];
  const now = new Date().toISOString();

  for (const result of results) {
    if (!result.itemId) continue;

    if (result.error) {
      await env.DB.prepare("UPDATE items SET last_checked_at = ?, last_error = ? WHERE id = ?")
        .bind(now, result.error, result.itemId)
        .run();
      continue;
    }

    await env.DB.prepare(
      `UPDATE items
       SET available = ?, last_checked_at = ?, last_error = NULL, name = COALESCE(?, name)
       WHERE id = ?`
    )
      .bind(result.available ? 1 : 0, now, result.name ?? null, result.itemId)
      .run();
  }

  await setSetting(env, "check_requested", "false");
  return jsonResponse({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    try {
      if (pathname === "/" && method === "GET") {
        return htmlResponse(renderUI());
      }
      if (pathname === "/api/items" && method === "GET") {
        return await handleListItems(env);
      }
      if (pathname === "/api/items" && method === "POST") {
        return await handleCreateItem(request, env);
      }
      const itemMatch = pathname.match(/^\/api\/items\/(\d+)$/);
      if (itemMatch && method === "DELETE") {
        return await handleDeleteItem(env, itemMatch[1]);
      }
      if (pathname === "/api/settings" && method === "GET") {
        return await handleGetSettings(env);
      }
      if (pathname === "/api/settings" && method === "PUT") {
        return await handlePutSettings(request, env);
      }
      if (pathname === "/api/check" && method === "POST") {
        return await handleRequestCheck(env);
      }
      if (pathname === "/api/check-results" && method === "POST") {
        return await handleCheckResults(request, env);
      }
      return jsonResponse({ error: "No encontrado" }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};
