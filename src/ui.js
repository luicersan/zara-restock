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
  .aviso { font-size: 0.85rem; color: #666; margin: 0.5rem 0 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.75rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #8883; font-size: 0.9rem; }
  .estado-disponible { color: #1e7d34; font-weight: bold; }
  .estado-agotado { color: #666; }
  .estado-pendiente { color: #a15c00; }
  .estado-error { color: #c0392b; font-weight: bold; }
  .tabla-envoltorio { overflow-x: auto; }
  .fila-error-msg { font-size: 0.8rem; color: #c0392b; }
  .banda {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
    border: 1px solid #8883;
  }
  .banda-activo { background: color-mix(in srgb, #1e7d34 15%, transparent); }
  .banda-pausado { background: color-mix(in srgb, #a15c00 15%, transparent); }
  .banda-fuera { background: color-mix(in srgb, #888 15%, transparent); }
</style>
</head>
<body>
  <h1>Avisador de reposiciones de Zara</h1>

  <div id="banda-estado" class="banda">
    <span id="banda-texto">Cargando estado…</span>
    <button id="boton-pausa" type="button">Pausar</button>
  </div>
  <div id="estado-mensaje"></div>

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
    <p class="aviso">Los artículos nuevos quedan como <strong>Pendiente</strong> hasta la próxima ronda de comprobación (unos 5 minutos; si se añaden de noche, hasta las 08:00).</p>
    <div id="alta-mensaje"></div>
  </section>

  <section id="seccion-listado">
    <h2>Artículos vigilados</h2>
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

async function cargarEstado() {
  const respuesta = await fetch("/api/status");
  const datos = await respuesta.json();

  const banda = document.getElementById("banda-estado");
  const texto = document.getElementById("banda-texto");
  const boton = document.getElementById("boton-pausa");

  banda.classList.remove("banda-activo", "banda-pausado", "banda-fuera");

  if (datos.paused) {
    texto.textContent = "En pausa";
    banda.classList.add("banda-pausado");
    boton.textContent = "Reanudar";
  } else if (!datos.dentro_de_ventana) {
    texto.textContent = "Fuera de horario (activo de 08:00 a 23:00)";
    banda.classList.add("banda-fuera");
    boton.textContent = "Pausar";
  } else {
    texto.textContent = "Activo";
    banda.classList.add("banda-activo");
    boton.textContent = "Pausar";
  }

  return datos;
}

document.getElementById("boton-pausa").addEventListener("click", async () => {
  mostrarMensaje("estado-mensaje", "");
  const estadoActual = await cargarEstado();
  const quierePausar = !estadoActual.paused;
  const pin = prompt(quierePausar ? "PIN para pausar:" : "PIN para reanudar:");
  if (pin === null) return;

  const respuesta = await fetch("/api/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused: quierePausar, pin }),
  });
  const datos = await respuesta.json();

  if (!respuesta.ok) {
    mostrarMensaje("estado-mensaje", datos.error || "No se ha podido cambiar el estado.", "error");
    return;
  }
  await cargarEstado();
});

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

cargarEstado();
cargarItems();
cargarAjustes();
</script>
</body>
</html>`;
}
