// Devuelve la cadena HTML de la interfaz. Una sola página, sin build, sin
// dependencias: HTML llano + CSS en un <style> y JS vanilla en un <script>.

export function renderUI() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avisador de reposiciones (Zara y Bershka)</title>
<style>
  :root {
    color-scheme: light dark;

    --color-marron: #A57548;
    --color-melocoton: #FCD7AD;
    --color-arena: #F6C28B;
    --color-turquesa: #5296A5;
    --color-cielo: #82DDF0;

    --fondo: #faf6f1;
    --superficie: #ffffff;
    --texto: #2b2420;
    --texto-tenue: #6b6058;
    --borde: #e7dbca;

    --acento-zara: var(--color-marron);
    --acento-bershka: var(--color-turquesa);
    --acento-ajustes: var(--color-arena);

    --boton-fondo: var(--color-marron);
    --boton-fondo-hover: #8a6039;
    --boton-texto: #fff5ea;

    --anillo-foco: var(--color-cielo);

    --estado-disponible: #2f7d78;
    --estado-agotado: var(--texto-tenue);
    --estado-pendiente: #a1650f;
    --estado-error: #c0392b;

    --sombra: 0 1px 2px rgba(30, 20, 10, 0.05), 0 4px 10px rgba(30, 20, 10, 0.05);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --fondo: #1b1713;
      --superficie: #262019;
      --texto: #f3ece1;
      --texto-tenue: #b9ac9c;
      --borde: #3c3226;

      --boton-fondo: var(--color-arena);
      --boton-fondo-hover: #f2b06a;
      --boton-texto: #2b2420;

      --estado-disponible: #7fd6c4;
      --estado-agotado: var(--texto-tenue);
      --estado-pendiente: var(--color-arena);
      --estado-error: #ff9086;

      --sombra: none;
    }
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--fondo);
    color: var(--texto);
    font-family: 'Montserrat', sans-serif;
  }

  .contenedor {
    max-width: 840px;
    margin: 0 auto;
    padding: 1.75rem 1rem 3rem;
    line-height: 1.5;
  }

  header.cabecera { margin-bottom: 1.25rem; }
  h1 { font-size: 1.5rem; margin: 0; font-weight: 700; }
  .subtitulo { margin: 0.2rem 0 0; color: var(--texto-tenue); font-size: 0.95rem; }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .punto {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .punto-zara { background: var(--acento-zara); }
  .punto-bershka { background: var(--acento-bershka); }
  .punto-ajustes { background: var(--acento-ajustes); }

  .tarjeta {
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: 14px;
    box-shadow: var(--sombra);
    padding: 1.25rem 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
  }
  .tarjeta-zara { border-left: 4px solid var(--acento-zara); }
  .tarjeta-bershka { border-left: 4px solid var(--acento-bershka); }
  .tarjeta-ajustes { border-left: 4px solid var(--acento-ajustes); }

  form { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: flex-end; }
  label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    color: var(--texto-tenue);
    gap: 0.3rem;
    flex: 1 1 180px;
  }
  input[type="text"], input[type="email"] {
    padding: 0.5rem 0.6rem;
    font-size: 1rem;
    color: var(--texto);
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: 8px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus {
    outline: none;
    border-color: var(--color-turquesa);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--anillo-foco) 45%, transparent);
  }

  button {
    padding: 0.55rem 1rem;
    font-size: 0.95rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s, transform 0.05s;
  }
  button:active { transform: translateY(1px); }

  .btn-primario { background: var(--boton-fondo); color: var(--boton-texto); }
  .btn-primario:hover { background: var(--boton-fondo-hover); }

  .btn-secundario {
    background: transparent;
    color: var(--texto-tenue);
    border: 1px solid var(--borde);
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }
  .btn-secundario:hover { border-color: var(--estado-error); color: var(--estado-error); }

  .btn-pausa { background: var(--color-turquesa); color: #fff; }
  .btn-pausa:hover { background: #457c89; }

  .mensaje { margin-top: 0.65rem; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.88rem; }
  .error { background: color-mix(in srgb, var(--estado-error) 14%, transparent); color: var(--estado-error); }
  .warning { background: color-mix(in srgb, var(--color-arena) 30%, transparent); color: var(--estado-pendiente); }
  .ok { background: color-mix(in srgb, var(--color-turquesa) 20%, transparent); color: var(--estado-disponible); }

  .aviso { font-size: 0.85rem; color: var(--texto-tenue); margin: 0.65rem 0 0; }

  .tabla-envoltorio {
    overflow-x: auto;
    margin-top: 1rem;
    border: 1px solid var(--borde);
    border-radius: 10px;
  }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.55rem 0.65rem; }
  td { border-top: 1px solid var(--borde); }
  thead th {
    font-weight: 600;
    background: color-mix(in srgb, var(--color-melocoton) 35%, var(--superficie));
  }
  .tabla-bershka thead th {
    background: color-mix(in srgb, var(--color-cielo) 30%, var(--superficie));
  }
  tbody tr:hover { background: color-mix(in srgb, var(--texto) 4%, transparent); }

  .estado-disponible { color: var(--estado-disponible); font-weight: bold; }
  .estado-agotado { color: var(--estado-agotado); }
  .estado-pendiente { color: var(--estado-pendiente); }
  .estado-error { color: var(--estado-error); font-weight: bold; }
  .fila-error-msg { font-size: 0.8rem; color: var(--estado-error); margin-top: 0.15rem; }

  .banda {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 1rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
    font-weight: 600;
    border: 1px solid var(--borde);
  }
  .banda-activo { background: color-mix(in srgb, var(--color-cielo) 30%, var(--superficie)); }
  .banda-pausado { background: color-mix(in srgb, var(--color-arena) 35%, var(--superficie)); }
  .banda-fuera { background: color-mix(in srgb, var(--texto-tenue) 15%, var(--superficie)); }

  @media (max-width: 480px) {
    form button[type="submit"] { flex: 1 1 100%; }
  }
</style>
</head>
<body>
  <div class="contenedor">

    <header class="cabecera">
      <h1>Avisador de reposiciones</h1>
      <p class="subtitulo">Zara y Bershka</p>
    </header>

    <div id="banda-estado" class="banda">
      <span id="banda-texto">Cargando estado…</span>
      <button id="boton-pausa" type="button" class="btn-pausa">Pausar</button>
    </div>
    <div id="estado-mensaje"></div>

    <section id="tarjeta-zara" class="tarjeta tarjeta-zara">
      <h2><span class="punto punto-zara"></span>Zara</h2>
      <form id="form-alta-zara" data-store="zara">
        <label>URL del artículo
          <input type="text" name="url" placeholder="https://www.zara.com/es/es/...html?v1=..." required>
        </label>
        <label>Talla
          <input type="text" name="size" placeholder="S, 37, XL..." required>
        </label>
        <button type="submit" class="btn-primario">Añadir</button>
      </form>
      <p class="aviso">Los artículos nuevos quedan como <strong>Pendiente</strong> hasta la próxima ronda de comprobación (unos 5 minutos; si se añaden de noche, hasta las 08:00).</p>
      <div id="alta-zara-mensaje"></div>

      <div class="tabla-envoltorio">
        <table class="tabla-zara">
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Talla</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tabla-zara-cuerpo">
            <tr><td colspan="4">Cargando…</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="tarjeta-bershka" class="tarjeta tarjeta-bershka">
      <h2><span class="punto punto-bershka"></span>Bershka</h2>
      <form id="form-alta-bershka" data-store="bershka">
        <label>URL del artículo
          <input type="text" name="url" placeholder="https://www.bershka.com/es/...html?colorId=..." required>
        </label>
        <label>Talla
          <input type="text" name="size" placeholder="S, 37, XL..." required>
        </label>
        <button type="submit" class="btn-primario">Añadir</button>
      </form>
      <p class="aviso">Los artículos nuevos quedan como <strong>Pendiente</strong> hasta la próxima ronda de comprobación (unos 5 minutos; si se añaden de noche, hasta las 08:00).</p>
      <div id="alta-bershka-mensaje"></div>

      <div class="tabla-envoltorio">
        <table class="tabla-bershka">
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Talla</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tabla-bershka-cuerpo">
            <tr><td colspan="4">Cargando…</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="tarjeta-ajustes" class="tarjeta tarjeta-ajustes">
      <h2><span class="punto punto-ajustes"></span>Ajustes</h2>
      <form id="form-ajustes">
        <label>Correo de notificación
          <input type="email" id="input-email" name="email" placeholder="tu@correo.com">
        </label>
        <button type="submit" class="btn-primario">Guardar</button>
      </form>
      <div id="ajustes-mensaje"></div>
    </section>

  </div>

<script>
const ESTADO_TEXTO = {
  disponible: "Disponible",
  agotado: "Agotado",
  pendiente: "Pendiente",
  error: "Error",
};

function mostrarMensaje(elementoId, texto, clase) {
  const el = document.getElementById(elementoId);
  el.textContent = texto;
  el.className = texto ? "mensaje " + (clase || "") : "";
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
    texto.textContent = "Fuera de horario (activo de 08:00 a 01:00)";
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

function renderTabla(tbodyId, items) {
  const cuerpo = document.getElementById(tbodyId);
  cuerpo.innerHTML = "";

  if (items.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="4">Todavía no hay artículos.</td></tr>';
    return;
  }

  for (const item of items) {
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

    const celdaBorrar = document.createElement("td");
    const botonBorrar = document.createElement("button");
    botonBorrar.className = "btn-secundario";
    botonBorrar.textContent = "Borrar";
    botonBorrar.addEventListener("click", () => borrarItem(item.id));
    celdaBorrar.appendChild(botonBorrar);
    fila.appendChild(celdaBorrar);

    cuerpo.appendChild(fila);
  }
}

async function cargarItems() {
  const respuesta = await fetch("/api/items");
  const datos = await respuesta.json();
  renderTabla("tabla-zara-cuerpo", datos.items.filter((item) => item.store === "zara"));
  renderTabla("tabla-bershka-cuerpo", datos.items.filter((item) => item.store === "bershka"));
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

function conectarFormularioAlta(formId, mensajeId) {
  const form = document.getElementById(formId);
  const store = form.dataset.store;

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    mostrarMensaje(mensajeId, "");
    const url = form.querySelector('[name="url"]').value.trim();
    const size = form.querySelector('[name="size"]').value.trim();

    const respuesta = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, size, store }),
    });
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mostrarMensaje(mensajeId, datos.error || "No se ha podido añadir el artículo.", "error");
      return;
    }

    form.reset();
    if (datos.warning) {
      mostrarMensaje(mensajeId, datos.warning, "warning");
    } else {
      mostrarMensaje(mensajeId, "Artículo añadido. Quedará como Pendiente hasta la próxima comprobación.", "ok");
    }
    await cargarItems();
  });
}

conectarFormularioAlta("form-alta-zara", "alta-zara-mensaje");
conectarFormularioAlta("form-alta-bershka", "alta-bershka-mensaje");

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
