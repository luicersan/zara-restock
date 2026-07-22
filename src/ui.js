// Devuelve la cadena HTML de la interfaz. Una sola página, sin build, sin
// dependencias: HTML llano + CSS en un <style> y JS vanilla en un <script>.

export function renderUI() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avisador de reposiciones de Zara</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 780px;
    margin: 0 auto;
    padding: 1rem;
    line-height: 1.4;
  }
  h1 { font-size: 1.3rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; }
  section {
    border: 1px solid #8883;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
  label { display: flex; flex-direction: column; font-size: 0.85rem; gap: 0.2rem; flex: 1 1 160px; }
  input { padding: 0.4rem; font-size: 1rem; }
  button {
    padding: 0.5rem 0.9rem;
    font-size: 1rem;
    cursor: pointer;
  }
  .error { color: #c0392b; margin-top: 0.5rem; }
  .warning { color: #a15c00; margin-top: 0.5rem; }
  .ok { color: #1e7d34; margin-top: 0.5rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.75rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #8883; font-size: 0.9rem; }
  .estado-disponible { color: #1e7d34; font-weight: bold; }
  .estado-agotado { color: #666; }
  .estado-pendiente { color: #a15c00; }
  .estado-error { color: #c0392b; font-weight: bold; }
  .tabla-envoltorio { overflow-x: auto; }
  .fila-error-msg { font-size: 0.8rem; color: #c0392b; }
</style>
</head>
<body>
  <h1>Avisador de reposiciones de Zara</h1>

  <section id="seccion-alta">
    <h2>Añadir artículo</h2>
    <form id="form-alta">
      <label>URL del artículo
        <input type="text" id="input-url" name="url" placeholder="https://www.zara.com/es/es/...html?v1=..." required>
      </label>
      <label>Talla
        <input type="text" id="input-talla" name="size" placeholder="S, 37, XL..." required>
      </label>
      <button type="submit">Añadir</button>
    </form>
    <div id="alta-mensaje"></div>
  </section>

  <section id="seccion-listado">
    <h2>Artículos vigilados</h2>
    <button id="boton-comprobar">Comprobar ahora</button>
    <div id="comprobar-mensaje"></div>
    <div class="tabla-envoltorio">
      <table>
        <thead>
          <tr>
            <th>Artículo</th>
            <th>Talla</th>
            <th>Estado</th>
            <th>Última comprobación</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="tabla-cuerpo">
          <tr><td colspan="5">Cargando…</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="seccion-ajustes">
    <h2>Ajustes</h2>
    <form id="form-ajustes">
      <label>Correo de notificación
        <input type="email" id="input-email" name="email" placeholder="tu@correo.com">
      </label>
      <button type="submit">Guardar</button>
    </form>
    <div id="ajustes-mensaje"></div>
  </section>

<script>
const ESTADO_TEXTO = {
  disponible: "Disponible",
  agotado: "Agotado",
  pendiente: "Pendiente",
  error: "Error",
};

function formatearFecha(iso) {
  if (!iso) return "—";
  const fecha = new Date(iso);
  return fecha.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function mostrarMensaje(elementoId, texto, clase) {
  const el = document.getElementById(elementoId);
  el.textContent = texto;
  el.className = clase || "";
}

async function cargarItems() {
  const respuesta = await fetch("/api/items");
  const datos = await respuesta.json();
  const cuerpo = document.getElementById("tabla-cuerpo");
  cuerpo.innerHTML = "";

  if (datos.items.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="5">Todavía no hay artículos.</td></tr>';
    return;
  }

  for (const item of datos.items) {
    const fila = document.createElement("tr");

    const celdaArticulo = document.createElement("td");
    const enlace = document.createElement("a");
    enlace.href = item.url;
    enlace.target = "_blank";
    enlace.rel = "noopener";
    enlace.textContent = item.name || item.url;
    celdaArticulo.appendChild(enlace);
    fila.appendChild(celdaArticulo);

    const celdaTalla = document.createElement("td");
    celdaTalla.textContent = item.size;
    fila.appendChild(celdaTalla);

    const celdaEstado = document.createElement("td");
    const spanEstado = document.createElement("span");
    spanEstado.className = "estado-" + item.status;
    spanEstado.textContent = ESTADO_TEXTO[item.status] || item.status;
    celdaEstado.appendChild(spanEstado);
    if (item.status === "error" && item.lastError) {
      const detalle = document.createElement("div");
      detalle.className = "fila-error-msg";
      detalle.textContent = item.lastError;
      celdaEstado.appendChild(detalle);
    }
    fila.appendChild(celdaEstado);

    const celdaFecha = document.createElement("td");
    celdaFecha.textContent = formatearFecha(item.lastCheckedAt);
    fila.appendChild(celdaFecha);

    const celdaBorrar = document.createElement("td");
    const botonBorrar = document.createElement("button");
    botonBorrar.textContent = "Borrar";
    botonBorrar.addEventListener("click", () => borrarItem(item.id));
    celdaBorrar.appendChild(botonBorrar);
    fila.appendChild(celdaBorrar);

    cuerpo.appendChild(fila);
  }
}

async function borrarItem(id) {
  await fetch("/api/items/" + id, { method: "DELETE" });
  await cargarItems();
}

async function cargarAjustes() {
  const respuesta = await fetch("/api/settings");
  const datos = await respuesta.json();
  document.getElementById("input-email").value = datos.email || "";
  if (!datos.email) {
    mostrarMensaje("ajustes-mensaje", "No hay dirección de correo configurada: no se enviarán avisos.", "warning");
  }
}

document.getElementById("form-alta").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMensaje("alta-mensaje", "");
  const url = document.getElementById("input-url").value.trim();
  const size = document.getElementById("input-talla").value.trim();

  const respuesta = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, size }),
  });
  const datos = await respuesta.json();

  if (!respuesta.ok) {
    mostrarMensaje("alta-mensaje", datos.error || "No se ha podido añadir el artículo.", "error");
    return;
  }

  document.getElementById("form-alta").reset();
  if (datos.warning) {
    mostrarMensaje("alta-mensaje", datos.warning, "warning");
  } else {
    mostrarMensaje("alta-mensaje", "Artículo añadido. Quedará como Pendiente hasta la próxima comprobación.", "ok");
  }
  await cargarItems();
});

document.getElementById("boton-comprobar").addEventListener("click", async () => {
  await fetch("/api/check", { method: "POST" });
  mostrarMensaje("comprobar-mensaje", "Comprobación solicitada: se hará en cuanto el proceso local la recoja.", "ok");
});

document.getElementById("form-ajustes").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mostrarMensaje("ajustes-mensaje", "");
  const email = document.getElementById("input-email").value.trim();

  const respuesta = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const datos = await respuesta.json();

  if (!respuesta.ok) {
    mostrarMensaje("ajustes-mensaje", datos.error || "No se ha podido guardar.", "error");
    return;
  }
  mostrarMensaje("ajustes-mensaje", email ? "Guardado." : "Guardado. Sin dirección configurada, no se enviarán avisos.", "ok");
});

cargarItems();
cargarAjustes();
</script>
</body>
</html>`;
}
