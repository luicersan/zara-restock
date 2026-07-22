# SPEC.md — Avisador de reposiciones de Zara

Fuente de verdad de los requisitos. Si algo de este documento contradice al código,
manda este documento. Si hace falta cambiar un requisito, se cambia aquí primero.

## 1. Qué es

Aplicación web privada que vigila artículos de zara.com agotados en una talla
concreta y envía un correo cuando vuelven a estar disponibles.

Uso real: 2 personas, 5–6 artículos simultáneos como máximo. No es un producto,
es una herramienta doméstica. **La simplicidad prima sobre cualquier otra
consideración**: sobre la extensibilidad, sobre la elegancia arquitectónica y
sobre la cobertura de casos raros.

## 2. Alcance

Dentro:

- Alta de artículo por URL de zara.com + talla.
- Listado de artículos con estado y borrado.
- Configuración de la dirección de correo de notificación.
- Comprobación periódica automática.
- Correo en el momento en que un artículo pasa de agotado a disponible.

Fuera (no se implementa, no se deja "preparado", no se abstrae por si acaso):

- Modificar un artículo existente (se borra y se añade de nuevo).
- Usuarios, login, sesiones, autenticación.
- Otras tiendas que no sean Zara.
- Historial, estadísticas, gráficas.
- Notificaciones por Telegram, push o SMS.
- Aviso de bajadas de precio.
- Múltiples destinatarios.

## 3. Comportamiento funcional

### 3.1 Alta de artículo

Entrada: URL completa del artículo (tal cual se copia desde la web o la app de
Zara, con sus parámetros `utm_*`) y una talla escrita a mano.

Al dar de alta, **de forma síncrona**:

1. Se extrae de la URL el identificador de producto y el de variante (§5).
2. Se consulta la disponibilidad del producto.
3. Si la talla indicada no existe entre las tallas del producto, se rechaza el
   alta con un mensaje que incluye la lista de tallas que sí existen.
4. Si existe, se guarda el artículo junto con el nombre del producto y su
   disponibilidad **real en ese momento**.

El punto 4 importa: si se da de alta un artículo que ya está disponible, se guarda
como disponible y **no** se envía correo. Solo se notifican transiciones reales.

Si la consulta a Zara falla en el alta, el alta falla y se muestra el error. No se
guardan artículos que no se han podido verificar.

### 3.2 Listado

Tabla con una fila por artículo:

| Campo | Contenido |
|---|---|
| Artículo | Nombre del producto, enlazando a la URL original |
| Talla | La talla vigilada |
| Estado | `Disponible` / `Agotado` / `Error` |
| Última comprobación | Fecha y hora, en horario de Madrid |
| — | Botón de borrar |

Si el último intento falló, el estado es `Error` y se muestra el mensaje. Esto es
el único diagnóstico de la aplicación: si Zara cambia algo y las comprobaciones
dejan de funcionar, tiene que verse aquí y no en unos logs que nadie mira.

### 3.3 Ajustes

Un único campo: la dirección de correo de notificación. Se guarda en base de datos,
no en una variable de entorno, para poder cambiarla sin redesplegar.

Si no hay dirección configurada, las comprobaciones se siguen ejecutando y el
estado se sigue actualizando, pero no se envía correo. La interfaz avisa de que
no hay dirección configurada.

### 3.4 Comprobación periódica

Cada **120 segundos** (`*/2 * * * *`) se recorren todos los artículos, en serie,
y se actualiza su estado.

Reglas:

- Se considera **disponible** si el estado del SKU de esa talla es `in_stock` o
  `low_on_stock`. Cualquier otro valor (`out_of_stock`, `coming_soon`,
  `back_soon`, o que la talla haya desaparecido del catálogo) cuenta como agotado.
- Se envía correo **solo en la transición agotado → disponible**. Si sigue
  disponible en las siguientes rondas, no se repite el correo. Si vuelve a
  agotarse y se repone otra vez, se avisa de nuevo.
- Un fallo de red o un error de Zara **no cambia** el estado de disponibilidad:
  se registra en `last_error` y se reintenta a los 120 segundos. Un 503 puntual
  no debe provocar un correo espurio ni borrar el estado conocido.
- Un error en un artículo no interrumpe el recorrido de los demás.
- Si el envío del correo falla, el estado `available` **no** se marca como
  actualizado, para que el siguiente ciclo reintente la notificación.

### 3.5 Correo

- De: `Avisos Zara <onboarding@resend.dev>`
- Asunto: `¡Disponible! {nombre del producto} (talla {talla})`
- Cuerpo: nombre, talla, y el enlace al artículo. Texto plano o HTML mínimo.
  Sin plantillas, sin imágenes, sin CSS.

Un correo por artículo repuesto.

## 4. Arquitectura

Un único Cloudflare Worker que sirve la interfaz, la API y ejecuta el cron.

```
Navegador ──► Worker ──► D1 (SQLite)
                 │
Cron */2min ─────┼──► fetch zara.com
                 │
                 └──► Resend API ──► correo
```

- **Sin build de frontend.** La interfaz es una cadena HTML devuelta por el Worker,
  con JavaScript vanilla en un `<script>` en línea. Sin React, sin Tailwind,
  sin bundler, sin `npm run build`.
- **Sin autenticación.** La URL es pública. Decisión consciente del propietario:
  no hay datos sensibles.
- **JavaScript, no TypeScript.** Menos fricción para una aplicación de este tamaño.

### 4.1 API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | La interfaz |
| GET | `/api/items` | Lista de artículos |
| POST | `/api/items` | Alta. Cuerpo: `{ url, size }` |
| DELETE | `/api/items/:id` | Borrado |
| GET | `/api/settings` | `{ email }` |
| PUT | `/api/settings` | Cuerpo: `{ email }` |
| POST | `/api/check` | Dispara una comprobación manual de todos los artículos |

`POST /api/check` existe para depurar sin esperar al cron y para poder forzar una
comprobación desde la interfaz. Ejecuta exactamente el mismo código que el cron.

## 5. Formato de las URL de Zara

```
https://www.zara.com/es/es/top-halter-punto-stretch-p05584397.html?v1=517756025&utm_campaign=...
                                                    ^^^^^^^^          ^^^^^^^^^
                                                    productId         variante (color)
```

- `product_id`: se extrae con `/-p(\d+)\.html/`.
- `variant_id`: se extrae del parámetro de consulta `v1`.

**El `v1` no es opcional.** Identifica el color concreto, y la disponibilidad de
tallas es por color. Un artículo sin `v1` en la URL se acepta, pero se avisa en la
interfaz de que se vigilará el color por defecto del producto.

Los parámetros `utm_*` se descartan al guardar. Se guarda la URL limpia.

## 6. Tallas

**No se distingue entre tallas de ropa y de calzado.** Ni tablas de conversión, ni
detección de tipo de producto, ni ningún `if`.

Zara devuelve la lista de SKUs del producto, cada uno con su etiqueta de talla y su
estado. La comprobación es coincidencia exacta entre cadenas normalizadas:

```js
const normalize = (s) => s.trim().toUpperCase().replace(/\s+/g, "");
```

`"S"` casa con `"S"`, `"37"` casa con `"37"`, `"EU 39"` casa con `"EU39"`. Funciona
con cualquier rango de tallas presente o futuro sin tocar código.

## 7. Detección de disponibilidad — el punto crítico

**Zara no tiene API pública.** Este módulo es el único riesgo real del proyecto y
por eso está aislado en `src/zara.js` con la firma:

```js
/**
 * @returns {Promise<{name: string, sizes: Array<{label: string, status: string}>}>}
 */
export async function fetchProduct(productId, variantId)
```

Todo lo demás de la aplicación consume esta función y no sabe nada de cómo
funciona Zara por dentro. Si Zara cambia su web, se toca este fichero y ninguno más.

### 7.1 Paso 0: descubrimiento (antes de escribir nada de la aplicación)

Ninguna ruta concreta está confirmada en este documento a propósito, porque cambian
con el tiempo y una ruta inventada cuesta más que no tener ninguna. **Lo primero es
averiguar la buena, y documentarla en `ZARA-API.md`.**

Vía rápida y fiable, con el propietario delante:

1. Abrir en Chrome una de las URLs de `seed.sql`.
2. DevTools → pestaña Network → filtro XHR/Fetch.
3. Recargar y localizar la respuesta JSON que contiene las tallas y su estado
   (buscar en las respuestas por `in_stock`, `out_of_stock` o por una talla
   conocida como `"37"`).
4. Botón derecho sobre esa petición → *Copy as cURL*.

Vías a probar con `curl` desde la terminal, en este orden:

1. **GET de la propia ficha de producto** y extracción del JSON embebido en el
   HTML. Suele ser lo más estable: si la página se ve en el navegador, el dato
   está ahí.
2. **Endpoints internos bajo `https://www.zara.com/itxrest/...`**, que es la
   familia de servicios que usa la propia web. Requieren un identificador de
   tienda además del de producto; el valor correcto para `es/es` sale del paso
   de DevTools.

En cualquier caso, enviar cabeceras de navegador real: `User-Agent` de Chrome,
`Accept-Language: es-ES,es;q=0.9`, `Accept: application/json` (o `text/html`).

### 7.2 Registrar los hallazgos

`ZARA-API.md` debe contener: la URL exacta que funciona, las cabeceras necesarias,
un ejemplo recortado de la respuesta, y de qué campos se sacan el nombre, la
etiqueta de talla y el estado. Sin esto, el día que se rompa hay que repetir toda
la investigación desde cero.

### 7.3 Si Cloudflare está bloqueado

Inditex sirve detrás de Akamai y puede rechazar peticiones desde IPs de centro de
datos. Si `curl` funciona desde el ordenador de casa pero el Worker desplegado
recibe 403, **la aplicación no cambia**: se mueve solo el fetch.

Plan B, documentado en `DESPLIEGUE.md`: una tarea programada en el ordenador local
que ejecuta `node check-local.js`, el cual usa el mismo `src/zara.js` y envía los
resultados a un endpoint del Worker. Se desactiva el cron de Cloudflare y el resto
sigue igual.

No implementar el plan B por adelantado. Solo si hace falta.

## 8. Modelo de datos

```sql
CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT    NOT NULL,
  product_id      TEXT    NOT NULL,
  variant_id      TEXT,
  size            TEXT    NOT NULL,
  name            TEXT,
  available       INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  last_error      TEXT,
  created_at      TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_items_unico ON items(product_id, variant_id, size);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

El índice único evita duplicados al añadir dos veces el mismo artículo y talla. La
interfaz debe traducir la violación de restricción a un mensaje legible, no a un 500.

Fechas en ISO 8601 UTC. La conversión a horario de Madrid se hace al pintar.

## 9. Tests

Solo donde aportan. Con `vitest`:

- `parseUrl()`: extrae `product_id` y `variant_id` de las 5 URLs reales de
  `seed.sql`, incluida una sin `v1`.
- `normalize()` y la coincidencia de tallas: `"s"` casa con `"S"`, `"37 "` casa
  con `"37"`, `"38"` no casa con `"37"`.
- `decidirNotificacion(anterior, actual)`: solo `false → true` devuelve `true`.
  Un error deja el estado intacto.

No se testea la llamada real a Zara ni el envío de correo. Se comprueban a mano.

## 10. Criterio de terminado

1. `wrangler deploy` sin errores y la interfaz carga en la URL `workers.dev`.
2. Los 5 artículos de `seed.sql` aparecen en la tabla con su estado real y su hora
   de comprobación.
3. Añadir una talla inexistente devuelve error con la lista de tallas válidas.
4. Borrar funciona.
5. Guardar el correo funciona y persiste al recargar.
6. Prueba de correo de extremo a extremo: se añade a mano un artículo **que esté
   disponible ahora mismo**, se le fuerza `available = 0` en la base de datos
   (`wrangler d1 execute`), se llama a `/api/check` y llega el correo.

El punto 6 es el que de verdad valida la aplicación. Esperar a que Zara reponga
algo para descubrir que el correo no salía no es un plan de pruebas.

## 11. Decisiones tomadas y por qué

| Decisión | Motivo |
|---|---|
| Cloudflare Workers | Cron gratuito con granularidad de 1 minuto; no se duerme por inactividad |
| D1 | SQLite gestionado, gratis, sin servidor que administrar |
| Sin build de frontend | Es lo que permite tenerlo desplegado en una hora |
| Intervalo de 120 s | ~4.300 peticiones/día con 6 artículos: suficientemente rápido sin llamar la atención |
| Sin autenticación | Decisión del propietario; no hay datos sensibles |
| Resend | Única API HTTP de correo con alta instantánea; los Workers no pueden hablar SMTP |
| Cuenta de Resend a nombre de la destinataria | Sin dominio verificado, Resend solo envía a la dirección de la cuenta |
| Tallas como cadenas, sin tipos | Elimina toda la lógica de rangos de tallas sin perder funcionalidad |
