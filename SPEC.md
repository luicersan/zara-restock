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

**No hay consulta síncrona a Zara en el alta** (§7 explica por qué: Zara solo
se puede consultar desde el script local, no desde el Worker). Al dar de alta:

1. Se extrae de la URL el identificador de producto y el de variante (§5). Si
   no se puede extraer el `product_id`, se rechaza el alta (esto sí es
   validación local, sin red).
2. Se guarda el artículo con `available = 0` y `last_checked_at = NULL`. Sin
   `last_checked_at`, el artículo se muestra como **`Pendiente`** en el
   listado (§3.2): no se sabe todavía si la talla existe ni si está
   disponible.
3. La primera comprobación real la hace el script local en su siguiente
   ronda (hasta 120 segundos después). Si la talla no existe entre las
   tallas del producto, esa ronda deja el artículo en estado `Error` con un
   mensaje que incluye la lista de tallas que sí existen — igual que
   cualquier otro error de comprobación (§3.4). No se borra solo: el usuario
   lo borra a mano al ver el error.

Esto es una relajación consciente de "no se guardan artículos que no se han
podido verificar": ahora sí se guardan, y la verificación llega poco después,
asíncrona. La alternativa (bloquear el alta hasta la siguiente ronda del
script local) complicaría la interfaz sin aportar nada para dos personas
vigilando seis artículos.

### 3.2 Listado

Tabla con una fila por artículo:

| Campo | Contenido |
|---|---|
| Artículo | Nombre del producto, enlazando a la URL original (mientras esté `Pendiente` y no se conozca el nombre, se muestra la URL) |
| Talla | La talla vigilada |
| Estado | `Disponible` / `Agotado` / `Pendiente` / `Error` |
| Última comprobación | Fecha y hora, en horario de Madrid. Vacío si sigue `Pendiente` |
| — | Botón de borrar |

`Pendiente`: `last_checked_at` es `NULL`, es decir, el artículo se acaba de dar
de alta y el script local todavía no ha hecho su primera ronda (§3.1).

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

**No es un cron del Worker.** Por lo explicado en §7, la comprobación real
contra Zara la hace un proceso en un ordenador (`check-local.js`), no el
Worker. El Worker no pierde su papel de decidir y notificar: solo deja de ser
quien habla con Zara.

Cada **120 segundos**, `check-local.js`:

1. Pide a la API del Worker (`GET /api/items`) la lista de artículos vigilados.
2. Para cada uno, en serie, consulta su disponibilidad real en Zara (vía
   Puppeteer headless, §7).
3. Envía el resultado de cada artículo (disponibilidad cruda y, si ha
   fallado, el error) al Worker (`POST /api/check-results`, §4.1).

El Worker, al recibir cada resultado:

- Decide si hay transición agotado → disponible y actualiza `available` y
  `last_checked_at`.
- Si la talla no existe en la respuesta de Zara, dado que no se validó al dar
  de alta (§3.1), guarda el error correspondiente con la lista de tallas
  válidas.
- Envía el correo si corresponde (§3.5).

Reglas (se mantienen igual, solo cambia quién habla con Zara):

- Se considera **disponible** si el estado del SKU de esa talla es `in_stock` o
  `low_on_stock`. Cualquier otro valor (`out_of_stock`, `coming_soon`,
  `back_soon`, o que la talla haya desaparecido del catálogo) cuenta como agotado.
- Se envía correo **solo en la transición agotado → disponible**. Si sigue
  disponible en las siguientes rondas, no se repite el correo. Si vuelve a
  agotarse y se repone otra vez, se avisa de nuevo.
- Un fallo de red o un error de Zara (incluido el propio `check-local.js`, p.
  ej. si Puppeteer no consigue cargar la página) **no cambia** el estado de
  disponibilidad: se registra en `last_error` y se reintenta a los 120
  segundos. Un 503 puntual no debe provocar un correo espurio ni borrar el
  estado conocido.
- Un error en un artículo no interrumpe el recorrido de los demás.
- Si el envío del correo falla, el estado `available` **no** se marca como
  actualizado, para que el siguiente ciclo reintente la notificación.

Requiere que el ordenador con `check-local.js` esté encendido. Es la
contrapartida de que Zara bloquee las peticiones sin navegador real (§7,
`ZARA-API.md`).

### 3.5 Correo

- De: `Avisos Zara <onboarding@resend.dev>`
- Asunto: `¡Disponible! {nombre del producto} (talla {talla})`
- Cuerpo: nombre, talla, y el enlace al artículo. Texto plano o HTML mínimo.
  Sin plantillas, sin imágenes, sin CSS.

Un correo por artículo repuesto.

## 4. Arquitectura

Un único Cloudflare Worker que sirve la interfaz y la API, más un script de
Node (`check-local.js`) en un ordenador que es el único que habla con Zara.

```
Navegador ──► Worker ──► D1 (SQLite)
                 ▲
                 │ GET /api/items, POST /api/check-results
                 │
check-local.js (cada 120s) ──► Puppeteer headless ──► zara.com
                 │
                 (el Worker, no check-local.js, habla con:)
                 └──► Resend API ──► correo
```

Zara bloquea con un challenge de Akamai cualquier petición que no venga de un
navegador real ejecutando JavaScript (`ZARA-API.md`); un Worker no puede
lanzar un navegador. Por eso la consulta se hace desde un ordenador con
`check-local.js` y no desde el propio Worker. El Worker sigue siendo el único
que decide si hay que notificar y el único que envía correo (mantiene
`RESEND_API_KEY`, que `check-local.js` no necesita ni ve).

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
| GET | `/api/items` | Lista de artículos. La usan tanto la interfaz como `check-local.js` |
| POST | `/api/items` | Alta. Cuerpo: `{ url, size }`. Guarda en `Pendiente`, sin consultar Zara (§3.1) |
| DELETE | `/api/items/:id` | Borrado |
| GET | `/api/settings` | `{ email }` |
| PUT | `/api/settings` | Cuerpo: `{ email }` |
| POST | `/api/check` | Marca una señal (`check_requested` en `settings`) para que `check-local.js` haga una ronda en cuanto la vea, sin esperar a completar los 120s en curso |
| POST | `/api/check-results` | Usado por `check-local.js`. Cuerpo: lista de resultados crudos por artículo (disponibilidad o error). El Worker aplica aquí la lógica de transición y el envío de correo |

`POST /api/check` **no** ejecuta una comprobación inmediata (el Worker no
puede consultar Zara). Es una señal para `check-local.js`, que la revisa en
cada vuelta de su bucle; la comprobación real llega en cuanto ese proceso la
atiende, no al instante.

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

**Confirmado en el paso 0 (`ZARA-API.md`): Zara bloquea con un challenge de
Akamai cualquier petición que no sea un navegador real ejecutando JavaScript.**
`curl`/`fetch` nunca lo pasan, ni siquiera desde una IP residencial normal —no
solo desde IPs de centro de datos, que era la única hipótesis contemplada
aquí originalmente. Un Cloudflare Worker no puede lanzar un navegador, así
que **`fetchProduct()` no puede ejecutarse dentro del Worker**. Vive en
`check-local.js` (un script de Node que sí puede lanzar Chromium headless vía
Puppeteer) y usa el mismo `src/zara.js` para todo lo que no depende del
entorno (parseo de URL, normalización de tallas). Ver §4 y §3.4.

### 7.1 Paso 0: descubrimiento (antes de escribir nada de la aplicación) — hecho

Ninguna ruta concreta estaba confirmada en este documento a propósito, porque
cambian con el tiempo y una ruta inventada cuesta más que no tener ninguna.
Resultado documentado en `ZARA-API.md`: no hay endpoint JSON por separado —
los datos van embebidos en el HTML de la ficha de producto, en
`window.zara.viewPayload`— y hace falta un navegador real (headless vale) para
conseguir ese HTML.

### 7.2 Registrar los hallazgos

`ZARA-API.md` contiene: el método que funciona (Puppeteer headless + extraer
el JSON embebido), un ejemplo recortado de la respuesta, y de qué campos se
sacan el nombre, la etiqueta de talla y el estado. Sin esto, el día que se
rompa hay que repetir toda la investigación desde cero.

### 7.3 Consulta desde un ordenador, no desde el Worker

Esto ya no es un plan de contingencia ("si Cloudflare está bloqueado"): es la
arquitectura desde el principio, porque el bloqueo de Akamai no depende de si
la IP es de datacenter o residencial, sino de si quien pregunta ejecuta
JavaScript de verdad (§7, `ZARA-API.md`).

Documentado en `DESPLIEGUE.md`: una tarea programada (o un proceso de larga
duración) en el ordenador local ejecuta `check-local.js`, que usa `src/zara.js`
y Puppeteer, y envía los resultados a `POST /api/check-results` del Worker
(§4.1). El Worker no tiene `[triggers]` de cron para esto: la periodicidad la
marca `check-local.js`.

Requiere el ordenador encendido. Es la contrapartida aceptada.

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
2. `check-local.js` corriendo en el ordenador: los 5 artículos de `seed.sql`
   pasan de `Pendiente` a su estado real, con su hora de comprobación, en la
   siguiente ronda.
3. Añadir una talla inexistente se guarda como `Pendiente` y pasa a `Error`
   con la lista de tallas válidas en la siguiente ronda de `check-local.js`
   (hasta 120 segundos, no al instante — §3.1).
4. Borrar funciona.
5. Guardar el correo funciona y persiste al recargar.
6. Prueba de correo de extremo a extremo: se añade a mano un artículo **que esté
   disponible ahora mismo**, se le fuerza `available = 0` en la base de datos
   (`wrangler d1 execute`), se llama a `POST /api/check` (o simplemente se
   espera a la siguiente ronda de `check-local.js`) y llega el correo.

El punto 6 es el que de verdad valida la aplicación. Esperar a que Zara reponga
algo para descubrir que el correo no salía no es un plan de pruebas.

## 11. Decisiones tomadas y por qué

| Decisión | Motivo |
|---|---|
| Cloudflare Workers | Sirve interfaz y API gratis, sin servidor que administrar; no se duerme por inactividad |
| D1 | SQLite gestionado, gratis, sin servidor que administrar |
| Sin build de frontend | Es lo que permite tenerlo desplegado en una hora |
| Intervalo de 120 s | ~4.300 peticiones/día con 6 artículos: suficientemente rápido sin llamar la atención |
| Sin autenticación | Decisión del propietario; no hay datos sensibles |
| Resend | Única API HTTP de correo con alta instantánea; los Workers no pueden hablar SMTP |
| Cuenta de Resend a nombre de la destinataria | Sin dominio verificado, Resend solo envía a la dirección de la cuenta |
| Consulta a Zara desde `check-local.js` (Puppeteer), no desde el Worker | Confirmado en el paso 0 (`ZARA-API.md`): Zara bloquea con un challenge de Akamai cualquier petición sin navegador real ejecutando JS; un Worker no puede lanzar uno. Puppeteer headless sí lo pasa (probado 4/4) |
| Alta de artículo asíncrona (`Pendiente` → verificado en la siguiente ronda) | Consecuencia directa de la anterior: el Worker no puede validar la talla al momento porque no puede consultar Zara |
| `POST /api/check` marca una señal en vez de comprobar al instante | Misma razón: la comprobación real solo la puede hacer `check-local.js`, no el Worker que atiende la petición |
| Tallas como cadenas, sin tipos | Elimina toda la lógica de rangos de tallas sin perder funcionalidad |
