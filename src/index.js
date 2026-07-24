// fetch() + enrutado. Sin scheduled(): la comprobación real vive en
// checker.js (SPEC.md §7.3), no aquí, porque Zara bloquea cualquier petición
// que no sea un navegador real ejecutando JavaScript (ZARA-API.md).

import { renderUI } from "./ui.js";
import { normalize, parseUrl } from "./zara.js";
import { decidirNotificacion, dentroDeVentana, horaMadrid } from "./check.js";
import { sendRestockEmail } from "./mail.js";

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

// El único endpoint que escribe disponibilidad y puede disparar un correo.
// El repo es público (SPEC.md §7.3/§4.2), así que va protegido con un token
// compartido en vez de dejarlo abierto.
function checkerAutorizado(request, env) {
  const token = request.headers.get("X-Checker-Token");
  return !!env.CHECKER_TOKEN && token === env.CHECKER_TOKEN;
}

async function handleStatus(env) {
  const paused = (await getSetting(env, "paused")) === "1";
  const dentro = dentroDeVentana();
  const run = !paused && dentro;
  return jsonResponse({
    run,
    paused,
    dentro_de_ventana: dentro,
    hora_madrid: horaMadrid(),
  });
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

  return jsonResponse({ items });
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
  const paused = (await getSetting(env, "paused")) === "1";
  return jsonResponse({ email: email ?? "", paused });
}

async function handlePutSettings(request, env) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  await setSetting(env, "notification_email", email);
  return jsonResponse({ email });
}

// El PIN no es un mecanismo de seguridad (SPEC.md §3.3): solo evita cambiar
// el interruptor por un toque accidental en el móvil. Comparación directa,
// sin hash ni límite de intentos.
async function handlePause(request, env) {
  const body = await request.json();
  const paused = !!body.paused;
  const pin = typeof body.pin === "string" ? body.pin : "";

  const pinGuardado = await getSetting(env, "pause_pin");
  if (pin !== pinGuardado) {
    return jsonResponse({ error: "PIN incorrecto" }, 403);
  }

  await setSetting(env, "paused", paused ? "1" : "0");
  return jsonResponse({ paused });
}

// Persiste los resultados crudos que envía checker.js: decide si hay que
// avisar (solo transición agotado → disponible, SPEC.md §3.4) y envía el
// correo antes de dar la comprobación por buena. Un error de Zara nunca toca
// `available`, solo `last_error`/`last_checked_at` (CLAUDE.md).
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

    const item = await env.DB.prepare("SELECT url, size, name, available FROM items WHERE id = ?")
      .bind(result.itemId)
      .first();
    if (!item) continue; // el artículo se borró mientras se comprobaba

    const nombre = result.name ?? item.name;
    const disponibleAntes = !!item.available;
    const disponibleAhora = !!result.available;

    if (decidirNotificacion(disponibleAntes, disponibleAhora)) {
      const email = await getSetting(env, "notification_email");
      if (email) {
        try {
          await sendRestockEmail({ to: email, name: nombre, size: item.size, url: item.url }, env);
        } catch (err) {
          // Si falla el envío, no se marca available como actualizado: el
          // siguiente ciclo debe reintentar la notificación (SPEC.md §3.4).
          await env.DB.prepare("UPDATE items SET last_error = ? WHERE id = ?")
            .bind(`No se pudo enviar el correo: ${err.message}`, result.itemId)
            .run();
          continue;
        }
      }
    }

    await env.DB.prepare(
      `UPDATE items
       SET available = ?, last_checked_at = ?, last_error = NULL, name = COALESCE(?, name)
       WHERE id = ?`
    )
      .bind(disponibleAhora ? 1 : 0, now, result.name ?? null, result.itemId)
      .run();
  }

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
      if (pathname === "/api/status" && method === "GET") {
        return await handleStatus(env);
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
      if (pathname === "/api/pause" && method === "POST") {
        return await handlePause(request, env);
      }
      if (pathname === "/api/check-results" && method === "POST") {
        if (!checkerAutorizado(request, env)) {
          return jsonResponse({ error: "No autorizado" }, 401);
        }
        return await handleCheckResults(request, env);
      }
      return jsonResponse({ error: "No encontrado" }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};
