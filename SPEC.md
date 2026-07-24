# SPEC.md — Avisador de reposiciones (Zara y Bershka)

Fuente de verdad de los requisitos. Si algo de este documento contradice al código,
manda este documento. Si hace falta cambiar un requisito, se cambia aquí primero.

## 1. Qué es

Aplicación web privada que vigila artículos de zara.com y bershka.com agotados
en una talla concreta y envía un correo cuando vuelven a estar disponibles.

Uso real: 2 personas, del orden de una decena de artículos simultáneos entre
las dos tiendas. No es un producto, es una herramienta doméstica. **La
simplicidad prima sobre cualquier otra consideración**: sobre la
extensibilidad, sobre la elegancia arquitectónica y sobre la cobertura de
casos raros.

## 2. Alcance

Dentro:

- Alta de artículo por URL de zara.com o de bershka.com + talla.
- Listado de artículos con estado y borrado, separado por tienda en la interfaz.
- Configuración de la dirección de correo de notificación.
- Comprobación periódica automática.
- Correo en el momento en que un artículo pasa de agotado a disponible.

Fuera (no se implementa, no se deja "preparado", no se abstrae por si acaso):

- Modificar un artículo existente (se borra y se añade de nuevo).
- Usuarios, login, sesiones, autenticación.
- Tiendas que no sean Zara o Bershka. Bershka se añadió porque se pidió
  explícitamente y porque comparte infraestructura con Zara (ambas de
  Inditex, mismo bloqueo de Akamai — `BERSHKA-API.md`); esto no abre la
  puerta a un sistema genérico de "añadir tiendas": una tercera tienda
  se plantearía desde cero, sin dar por hecho que el patrón de dos
  encaja.
- Historial, estadísticas, gráficas.
- Notificaciones por Telegram, push o SMS.
- Aviso de bajadas de precio.
- Múltiples destinatarios.

## 3. Comportamiento funcional

### 3.1 Alta de artículo

Entrada: **la tienda** (Zara o Bershka, según la sección de la interfaz usada),
la URL completa del artículo (tal cual se copia desde la web o la app, con sus
parámetros `utm_*`) y una talla escrita a mano.

**No hay consulta síncrona a Zara/Bershka en el alta** (§7 explica por qué:
solo se pueden consultar desde `checker.js`, no desde el Worker). Al dar de
alta:

1. Se extrae de la URL el identificador de producto y el de variante, con el
   `parseUrl()` de la tienda correspondiente (§5). Si no se puede extraer el
   `product_id`, se rechaza el alta (esto sí es validación local, sin red).
2. Se guarda el artículo con `available = 0` y `last_checked_at = NULL`. Sin
   `last_checked_at`, el artículo se muestra como **`Pendiente`** en el
   listado (§3.2): no se sabe todavía si la talla existe ni si está
   disponible.
3. La primera comprobación real la hace `checker.js` en su siguiente ronda
   (hasta ~5 minutos después; más si el alta ocurre fuera de la ventana
   horaria, en cuyo caso el artículo sigue `Pendiente` hasta las 08:00). Si la
   talla no existe entre las tallas del producto, esa ronda deja el artículo en
   estado `Error` con un mensaje que incluye la lista de tallas que sí existen —
   igual que cualquier otro error de comprobación (§3.4). No se borra solo: el
   usuario lo borra a mano al ver el error.

Esto es una relajación consciente de "no se guardan artículos que no se han
podido verificar": ahora sí se guardan, y la verificación llega poco después,
asíncrona. La alternativa (bloquear el alta hasta la siguiente ronda) complicaría
la interfaz sin aportar nada para dos personas vigilando seis artículos.

La interfaz debe dejar claro que `Pendiente` es normal y no un error, y que si
se añade un artículo de noche no se verificará hasta la mañana siguiente.

### 3.2 Listado

Una tabla por tienda (Zara y Bershka), cada una con una fila por artículo de
esa tienda:

| Campo | Contenido |
|---|---|
| Artículo | Nombre del producto, enlazando a la URL original (mientras esté `Pendiente` y no se conozca el nombre, se muestra la URL) |
| Talla | La talla vigilada |
| Estado | `Disponible` / `Agotado` / `Pendiente` / `Error` |
| — | Botón de borrar |

No hay columna de "última comprobación": todos los artículos se comprueban en
la misma ronda, así que una fecha por fila repetiría el mismo valor en todas y
solo servía para que la tabla no cupiera en un móvil, que es donde se usa.

`Pendiente`: `last_checked_at` es `NULL`, es decir, el artículo se acaba de dar
de alta y el script local todavía no ha hecho su primera ronda (§3.1).

Si el último intento falló, el estado es `Error` y se muestra el mensaje. Esto es
el único diagnóstico de la aplicación: si Zara cambia algo y las comprobaciones
dejan de funcionar, tiene que verse aquí y no en unos logs que nadie mira.

### 3.3 Ajustes

Tres cosas, todas guardadas en la tabla `settings` (no en variables de entorno,
para poder cambiarlas sin redesplegar):

**Dirección de notificación.** Si no hay dirección configurada, las
comprobaciones se siguen ejecutando y el estado se sigue actualizando, pero no
se envía correo. La interfaz avisa de que no hay dirección configurada.

**Interruptor de pausa, protegido por PIN.** Un botón `Pausar` / `Reanudar` en
la interfaz. Al pulsarlo se pide un PIN de 4 dígitos; si coincide con
`settings.pause_pin`, se cambia `settings.paused`. Sirve para vacaciones o para
un día en que no interesa que corra nada.

El PIN **no es un mecanismo de seguridad** y no debe presentarse como tal: la
aplicación no tiene autenticación y cualquiera que llegue a la URL puede borrar
artículos sin PIN alguno. Su única función es evitar cambiar el estado por un
toque accidental en el móvil. Comparación directa de cadenas en el Worker, sin
hash, sin sesiones, sin límite de intentos.

**Ventana horaria activa.** Fuera de ella no se consulta a Zara. Por defecto
**08:00–01:00 hora de Madrid**, definida como dos constantes en el código
(`VENTANA_INICIO = 8`, `VENTANA_FIN = 1`). No se expone en la interfaz: se
cambia en el código y se redespliega.

La ventana **cruza la medianoche** (`VENTANA_FIN < VENTANA_INICIO`), así que la
comparación no puede ser un simple `inicio <= hora < fin`; ver el código de
abajo. Es el caso que hay que tener presente al tocar `dentroDeVentana()`.

Motivo: las horas de sueño son ~7 de cada 24 en las que un correo no se va a
leer, y cada consulta nocturna es tráfico contra el detector de bots de Zara sin
ninguna contrapartida.

**El cálculo de ventana y pausa vive en el Worker, en un solo sitio**, expuesto
en `GET /api/status` (§4.1). El checker no sabe nada de horarios: pregunta y
obedece. Así la lógica no se duplica, funciona igual desde GitHub Actions o
desde el portátil, y el cambio de hora CET/CEST lo resuelve `Intl` sin código
propio:

```js
const hora = Number(new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid", hour: "numeric", hourCycle: "h23",
}).format(new Date()));

// La ventana cruza la medianoche, de ahí el OR en vez del AND.
const dentroDeVentana = VENTANA_INICIO <= VENTANA_FIN
  ? hora >= VENTANA_INICIO && hora < VENTANA_FIN
  : hora >= VENTANA_INICIO || hora < VENTANA_FIN;
```

### 3.4 Comprobación periódica

**No es un cron del Worker.** Por lo explicado en §7, la comprobación real
contra Zara la hace `checker.js`, un script de Node con Puppeteer que corre
fuera de Cloudflare. El Worker no pierde su papel de decidir y notificar: solo
deja de ser quien habla con Zara.

`checker.js` es **de un solo disparo**: hace una ronda y termina. No es un
demonio, no tiene bucle interno, no duerme. La periodicidad la pone quien lo
lanza (§7.3). Esto permite que el mismo fichero, sin cambios, corra tanto en
GitHub Actions como en un ordenador de casa.

Cadencia: cada **5 minutos** dentro de la ventana activa. Para el caso de uso
—enterarse de una reposición en rebajas— es indistinguible de 2 minutos.

**Esos 5 minutos no los marca el `schedule` de GitHub Actions.** Su planificador
es *best effort*: no solo retrasa los eventos programados, sino que descarta la
mayoría. Medido en este repo con `cron: '*/5'`, de ~50 disparos esperados en 4
horas se entregaron **2**, ambos al mismo segundo exacto y con dos horas de
separación. Un `*/5` de GitHub no es una ronda cada 5 minutos: es una ronda cada
hora o dos, y no es configurable.

Por eso el cron es **horario** (un solo disparo, con muchas más probabilidades de
llegar) y las rondas de 5 minutos las marca un bucle dentro del propio job: 10
rondas espaciadas 5 minutos, ~45 minutos de cobertura por disparo. Si GitHub se
salta un disparo se pierde una hora, no el día entero.

Ese bucle vive en `.github/workflows/checker.yml`, **no en `checker.js`**, que
sigue siendo de un solo disparo. Es lo que permite que el mismo fichero, sin
cambios, siga valiendo para el alojamiento B (§7.3), donde la periodicidad la
pone `systemd` y no hay bucle ninguno.

`workflow_dispatch` ejecuta **una sola ronda**, no el bucle: es el mecanismo para
forzar una comprobación inmediata (§4.1) y bloquearlo 45 minutos lo inutilizaría.

Cada ronda, `checker.js`:

1. Llama a `GET /api/status`. **Si `run` es `false` (por pausa o por estar
   fuera de la ventana horaria), termina inmediatamente sin abrir Puppeteer ni
   tocar zara.com.** Esta es la primera instrucción del script: nada se lanza
   antes de saber si hay que trabajar.
2. Pide a la API del Worker (`GET /api/items`) la lista de artículos vigilados.
3. Para cada uno, en serie, consulta su disponibilidad real en Zara (vía
   Puppeteer headless, §7), reutilizando una única instancia del navegador para
   todos los artículos de la ronda.
4. Envía el resultado de cada artículo (disponibilidad cruda y, si ha
   fallado, el error) al Worker (`POST /api/check-results`, §4.1), con la
   cabecera `X-Checker-Token` (§4.2).

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
- Un fallo de red o un error de Zara (incluido el propio `checker.js`, p. ej.
  si Puppeteer no consigue cargar la página) **no cambia** el estado de
  disponibilidad: se registra en `last_error` y se reintenta en la siguiente
  ronda. Un 503 puntual no debe provocar un correo espurio ni borrar el estado
  conocido.
- Un error en un artículo no interrumpe el recorrido de los demás.
- Si el envío del correo falla, el estado `available` **no** se marca como
  actualizado, para que el siguiente ciclo reintente la notificación.

Dónde corre `checker.js` (GitHub Actions o un ordenador propio) es una decisión
de despliegue, no de arquitectura: §7.3 y `DESPLIEGUE.md`.

### 3.5 Correo

- De: `Avisos Zara <onboarding@resend.dev>`
- Asunto: `¡Disponible! {nombre del producto} (talla {talla})`
- Cuerpo: nombre, talla, y el enlace al artículo. Texto plano o HTML mínimo.
  Sin plantillas, sin imágenes, sin CSS.

Un correo por artículo repuesto.

## 4. Arquitectura

Dos piezas. Un Cloudflare Worker que sirve la interfaz, la API y el correo, y un
script de Node (`checker.js`) que es el único que habla con Zara.

```
Navegador ──► Worker ──► D1 (SQLite)
                 ▲
                 │ GET /api/status, GET /api/items, POST /api/check-results
                 │
checker.js (cada 5 min, ventana 08:00–01:00) ──► Puppeteer headless ──► zara.com
                 │
                 (el Worker, no checker.js, habla con:)
                 └──► Resend API ──► correo
```

Zara bloquea con un challenge de Akamai cualquier petición que no venga de un
navegador real ejecutando JavaScript (`ZARA-API.md`); un Worker no puede lanzar
un navegador. Por eso la consulta se hace desde `checker.js` y no desde el
propio Worker. El Worker sigue siendo el único que decide si hay que notificar,
el único que calcula la ventana horaria y el estado de pausa, y el único que
envía correo (mantiene `RESEND_API_KEY`, que `checker.js` no necesita ni ve).

- **Sin build de frontend.** La interfaz es una cadena HTML devuelta por el Worker,
  con JavaScript vanilla en un `<script>` en línea. Sin React, sin Tailwind,
  sin bundler, sin `npm run build`.
- **Sin autenticación de usuario.** La URL es pública. Decisión consciente del
  propietario: no hay datos sensibles. El PIN de pausa (§3.3) y el token del
  checker (§4.2) no contradicen esto: el primero evita pulsaciones accidentales,
  el segundo protege un endpoint de escritura concreto.
- **JavaScript, no TypeScript.** Menos fricción para una aplicación de este tamaño.

### 4.1 API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | La interfaz |
| GET | `/api/status` | `{ run, paused, dentro_de_ventana, hora_madrid }`. `run` es `true` solo si no está en pausa **y** se está dentro de la ventana. Lo consulta `checker.js` antes de nada (§3.4) y la interfaz para pintar el estado |
| GET | `/api/items` | Lista de artículos de ambas tiendas (cada uno con su `store`). La usan tanto la interfaz como `checker.js` |
| POST | `/api/items` | Alta. Cuerpo: `{ url, size, store }`, con `store` en `"zara"` \| `"bershka"`. Guarda en `Pendiente`, sin consultar la tienda (§3.1) |
| DELETE | `/api/items/:id` | Borrado |
| GET | `/api/settings` | `{ email, paused }`. **Nunca devuelve `pause_pin`** |
| PUT | `/api/settings` | Cuerpo: `{ email }` |
| POST | `/api/pause` | Cuerpo: `{ paused, pin }`. Cambia el interruptor si el PIN coincide; si no, 403 y un mensaje legible |
| POST | `/api/check-results` | Usado por `checker.js`. Requiere `X-Checker-Token` (§4.2). Cuerpo: lista de resultados crudos por artículo. El Worker aplica aquí la lógica de transición y el envío de correo |

No existe `POST /api/check` ni botón "Comprobar ahora". Con una ronda cada 5
minutos, un botón que solo deja una señal para que la recoja el siguiente ciclo
promete inmediatez que no puede cumplir. Para forzar una ronda: el botón
*Run workflow* de GitHub Actions, o `node checker.js` a mano.

### 4.2 Token del checker

`POST /api/check-results` es el único endpoint que escribe estado de
disponibilidad y puede desencadenar un correo. Como el repositorio es público
(§7.3) y la URL del Worker es descubrible, sin protección cualquiera podría
inyectar resultados falsos y provocar avisos de reposición inexistentes.

Mecanismo, deliberadamente mínimo:

- Un valor aleatorio largo guardado como secret de Cloudflare (`CHECKER_TOKEN`)
  y como GitHub Secret con el mismo nombre.
- `checker.js` lo envía en la cabecera `X-Checker-Token`.
- El Worker compara y devuelve 401 si no coincide.

Sin JWT, sin firmas, sin caducidad. La URL del Worker también va en un GitHub
Secret (`WORKER_URL`), no escrita en el fichero del workflow.

## 5. Formato de las URL

Cada tienda tiene su propio `parseUrl()` (`src/zara.js`, `src/bershka.js`):
formatos de URL distintos, sin intentar unificarlos en un parser genérico.

### Zara

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

### Bershka

```
https://www.bershka.com/es/c0p209096041.html?colorId=812&utm_campaign=...
                            ^^^^^^^^^          ^^^
                            productId          variante (color)
```

- `product_id`: se extrae con `/c0p(\d+)\.html/`.
- `variant_id`: se extrae del parámetro de consulta `colorId`.

Mismo tratamiento que el `v1` de Zara: no opcional en la práctica, se acepta
sin él con el mismo aviso de "color por defecto" (`BERSHKA-API.md`).

Para ambas tiendas: los parámetros `utm_*` se descartan al guardar, y se
acepta el slug delante del identificador de producto (cosmético, cada tienda
redirige igual sin él) — se guarda la URL tal cual la pega el usuario, sin
slug.

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

**Ni Zara ni Bershka tienen API pública.** Este módulo es el único riesgo real
del proyecto y por eso está aislado, con una firma idéntica para las dos
tiendas:

```js
/**
 * @returns {Promise<{name: string, sizes: Array<{label: string, status: string}>}>}
 */
export async function fetchProduct(productId, variantId, browser?)
```

- Zara: `src/zara.js` (`parseUrl`, sin dependencias) + `src/zara-fetch.js`
  (`fetchProduct`, con Puppeteer).
- Bershka: `src/bershka.js` (`parseUrl`, sin dependencias) + `src/bershka-fetch.js`
  (`fetchProduct`, con Puppeteer).

Cada `fetchProduct()` acepta un `browser` de Puppeteer ya lanzado, opcional:
`checker.js` lo reutiliza para toda la ronda (una pestaña por artículo) en
vez de arrancar un Chromium por artículo (§3.4).

Todo lo demás de la aplicación (incluida `evaluateSize()` en `src/check.js`)
consume el resultado de `fetchProduct()` y no sabe nada de cómo funciona cada
tienda por dentro ni de cuál produjo el dato: opera sobre la forma abstracta
`{label, status}`. Si una tienda cambia su web, se toca el fichero de esa
tienda y ninguno más.

**Confirmado en el paso 0 de cada tienda (`ZARA-API.md`, `BERSHKA-API.md`):
ambas bloquean con el mismo challenge de Akamai cualquier petición que no sea
un navegador real ejecutando JavaScript** (lógico: son marcas del mismo grupo,
Inditex, y comparten esa protección). `curl`/`fetch` nunca lo pasan, ni
siquiera desde una IP residencial normal. Un Cloudflare Worker no puede
lanzar un navegador, así que **`fetchProduct()` no puede ejecutarse dentro
del Worker** para ninguna de las dos. Lo invoca `checker.js` (un script de
Node que sí puede lanzar Chromium headless vía Puppeteer), que reparte cada
artículo a la tienda que le corresponde (§3.4). Ver §4.

Aunque el bloqueo es el mismo, la extracción del dato no lo es: Zara lo
embebe como JSON estático en el HTML (se saca con una regex + `JSON.parse`);
Bershka lo reconstruye en tiempo de ejecución vía Nuxt/Pinia (`window.__NUXT__`
es una función autoejecutada, no JSON — hay que leerla con `page.evaluate()`
dentro de Puppeteer). Por eso hay dos ficheros `*-fetch.js` en vez de uno
parametrizable: la única parte realmente común entre las dos tiendas es la
forma de salida, no el método de extracción.

### 7.1 Paso 0: descubrimiento (antes de escribir código de cada tienda) — hecho para las dos

Ninguna ruta concreta estaba confirmada en estos documentos a propósito,
porque cambian con el tiempo y una ruta inventada cuesta más que no tener
ninguna. Resultado documentado en `ZARA-API.md` y `BERSHKA-API.md`
respectivamente: ningún endpoint JSON por separado en ninguna de las dos —
Zara lo embebe estático en el HTML, Bershka lo reconstruye en tiempo de
ejecución — y en ambos casos hace falta un navegador real (headless vale)
para conseguirlo.

### 7.2 Registrar los hallazgos

`ZARA-API.md` y `BERSHKA-API.md` contienen, cada uno para su tienda: el
método que funciona, un ejemplo recortado de la respuesta, y de qué campos se
sacan el nombre, la etiqueta de talla y el estado. Sin esto, el día que se
rompa hay que repetir toda la investigación desde cero.

### 7.3 Dónde corre `checker.js`

Esto ya no es un plan de contingencia ("si Cloudflare está bloqueado"): es la
arquitectura desde el principio, porque el bloqueo de Akamai no depende de si la
IP es de datacenter o residencial, sino de si quien pregunta ejecuta JavaScript
de verdad (§7, `ZARA-API.md`).

`checker.js` es de un solo disparo y no guarda estado, así que **le da igual
dónde se ejecute**. Hay dos alojamientos soportados y el orden importa:

**Opción A — GitHub Actions (probar primero).** En repositorios públicos los
runners estándar son gratis y sin límite de minutos, y un runner `ubuntu-latest`
ejecuta Puppeteer sin ninguna preparación especial. Cero hardware, cero
consumo eléctrico, cero mantenimiento. Fichero
`.github/workflows/checker.yml`, `schedule` horario + bucle de 10 rondas de 5
minutos dentro del job (§3.4: un `*/5` no funciona, GitHub descarta casi todos
los disparos).

**Riesgo no verificado:** los runners salen por IPs de Azure y Akamai podría
rechazarlas. Es incierto y hay indicios de que no ocurrirá —el discriminante
observado en el paso 0 fue la ejecución de JavaScript, no la procedencia de la
IP, ya que `curl` también fallaba desde IP residencial—, pero no está probado.
**Es lo primero que hay que comprobar, y cuesta veinte minutos.** Si el
workflow devuelve el challenge de Akamai en vez de la ficha de producto, se pasa
a la opción B sin tocar una línea de la aplicación.

Consecuencia de la opción A: **el repositorio tiene que ser público** para que
los minutos sean ilimitados. De ahí el token de §4.2. En el repo no puede haber
ni la URL del Worker, ni la clave de Resend, ni el token, ni el PIN: todo eso
son secrets.

**Opción B — un ordenador propio (respaldo).** Un portátil antiguo con Linux y
un `systemd timer` cada 5 minutos que lanza `node checker.js`. Requiere la
máquina encendida y unos 20 €/año de electricidad. Ver `DESPLIEGUE.md`.

Ninguna de las dos opciones cambia el Worker, la base de datos, la interfaz ni
`checker.js`. Cambia únicamente quién lo lanza y cada cuánto.

## 8. Modelo de datos

```sql
CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store           TEXT    NOT NULL DEFAULT 'zara', -- 'zara' o 'bershka'
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

CREATE UNIQUE INDEX idx_items_unico ON items(store, product_id, variant_id, size);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Claves de `settings`:

| Clave | Valor | Notas |
|---|---|---|
| `notification_email` | dirección de correo | Vacía al arrancar |
| `paused` | `'0'` o `'1'` | Interruptor de pausa (§3.3) |
| `pause_pin` | 4 dígitos | Sembrado a `'0000'`. **Cambiarlo en el primer arranque** |

El índice único evita duplicados al añadir dos veces el mismo artículo y talla,
incluyendo `store`: dos tiendas distintas podrían coincidir en `product_id` por
azar. La interfaz debe traducir la violación de restricción a un mensaje
legible, no a un 500.

`GET /api/settings` nunca devuelve `pause_pin`. No es un secreto de peso (§3.3),
pero no hay razón para servirlo.

Fechas en ISO 8601 UTC. La conversión a horario de Madrid se hace al pintar.

## 9. Tests

Solo donde aportan. Con `vitest`:

- `parseUrl()` de Zara: extrae `product_id` y `variant_id` de las 5 URLs
  reales de `seed.sql`, incluida una sin `v1`.
- `parseUrl()` de Bershka: extrae `product_id` y `colorId` de las URLs reales
  dadas de alta, incluida una con espacios sueltos alrededor.
- `normalize()` y la coincidencia de tallas: `"s"` casa con `"S"`, `"37 "` casa
  con `"37"`, `"38"` no casa con `"37"`.
- `decidirNotificacion(anterior, actual)`: solo `false → true` devuelve `true`.
  Un error deja el estado intacto.
- `dentroDeVentana(fecha)`: con la ventana 08:00–01:00, `true` a las 08:00 y a
  las 23:59 hora de Madrid, `false` a las 07:59 y a la 01:00. Como la ventana
  cruza la medianoche, los casos de después de las 00:00 son obligatorios.
  **Incluir un caso en horario de verano y otro en horario de invierno** (p. ej.
  1 de julio y 1 de enero a la misma hora UTC) para verificar que el cambio de
  hora se maneja solo. Es el único punto del código donde una zona horaria puede
  morder.

No se testea la llamada real a Zara/Bershka ni el envío de correo. Se
comprueban a mano.

## 10. Criterio de terminado

1. `wrangler deploy` sin errores y la interfaz carga en la URL `workers.dev`.
2. **Prueba del alojamiento (lo primero de todo, §7.3):** el workflow de GitHub
   Actions, lanzado a mano con *Run workflow*, consigue el nombre y las tallas
   de un artículo. Si devuelve el challenge de Akamai, se pasa a la opción B
   antes de seguir.
3. `checker.js` corriendo: los 5 artículos de `seed.sql` pasan de `Pendiente` a
   su estado real, con su hora de comprobación, en la siguiente ronda.
4. Añadir una talla inexistente se guarda como `Pendiente` y pasa a `Error` con
   la lista de tallas válidas en la siguiente ronda (hasta ~5 minutos, no al
   instante — §3.1).
5. Borrar funciona.
6. Guardar el correo funciona y persiste al recargar.
7. **Pausa:** con el PIN correcto el interruptor cambia y la interfaz lo
   refleja; con un PIN incorrecto se rechaza con un mensaje legible. Con
   `paused = 1`, una ejecución manual de `checker.js` termina sin abrir
   Puppeteer.
8. **Ventana horaria:** forzando la hora (o con los tests de `dentroDeVentana`),
   `GET /api/status` devuelve `run: false` fuera de 08:00–01:00 Madrid, y
   `checker.js` sale sin tocar Zara.
9. **Token:** un `POST /api/check-results` sin la cabecera `X-Checker-Token`, o
   con un valor incorrecto, devuelve 401.
10. **Prueba de correo de extremo a extremo:** se añade a mano un artículo **que
    esté disponible ahora mismo**, se le fuerza `available = 0` en la base de
    datos (`wrangler d1 execute`), se lanza una ronda de `checker.js` y llega el
    correo.

El punto 10 es el que de verdad valida la aplicación. Esperar a que Zara reponga
algo para descubrir que el correo no salía no es un plan de pruebas.

## 11. Decisiones tomadas y por qué

| Decisión | Motivo |
|---|---|
| Cloudflare Workers | Sirve interfaz y API gratis, sin servidor que administrar; no se duerme por inactividad |
| D1 | SQLite gestionado, gratis, sin servidor que administrar |
| Sin build de frontend | Es lo que permite tenerlo desplegado en una tarde |
| Sin autenticación de usuario | Decisión del propietario; no hay datos sensibles |
| Resend | Única API HTTP de correo con alta instantánea; los Workers no pueden hablar SMTP |
| Cuenta de Resend a nombre de la destinataria | Sin dominio verificado, Resend solo envía a la dirección de la cuenta |
| Consulta a Zara desde `checker.js` (Puppeteer), no desde el Worker | Confirmado en el paso 0 (`ZARA-API.md`): Zara bloquea con un challenge de Akamai cualquier petición sin navegador real ejecutando JS; un Worker no puede lanzar uno. Puppeteer headless sí lo pasa (probado 4/4) |
| Alta de artículo asíncrona (`Pendiente` → verificado en la siguiente ronda) | Consecuencia directa de la anterior: el Worker no puede validar la talla al momento porque no puede consultar Zara |
| `checker.js` de un solo disparo, sin bucle | Con rondas de 5 minutos, un proceso permanente durmiendo es código de más. Permite que el mismo fichero corra en GitHub Actions y en un ordenador propio sin cambios |
| Intervalo de 5 minutos (antes 120 s) | Menos exposición al detector de bots sin pérdida práctica: enterarse de una reposición 5 minutos más tarde da igual |
| Cron horario + bucle en el job, en vez de `cron: '*/5'` | Medido: GitHub entregó 2 de ~50 disparos esperados de un `*/5` en 4 horas. Su planificador descarta la mayoría de los eventos programados y no es configurable. Un solo disparo horario sí llega, y el bucle reparte las rondas dentro del job |
| El bucle en el YAML, no en `checker.js` | `checker.js` sigue siendo de un solo disparo y sin estado, así que el alojamiento B (`systemd`, §7.3) lo usa sin cambios. Meter el bucle en el script rompería eso |
| Ventana 08:00–01:00 Madrid | ~7 h diarias en las que un correo no se lee. Quita tráfico nocturno sin coste funcional |
| Ventana y pausa calculadas en el Worker | Un único sitio para la lógica; el cambio de hora CET/CEST lo resuelve `Intl`; funciona igual con cualquier alojamiento del checker |
| PIN de 4 dígitos en la pausa | Evita cambiar el interruptor por un toque accidental en el móvil. **No es seguridad**: la app no tiene login y borrar no pide PIN |
| Sin `POST /api/check` ni botón "Comprobar ahora" | Con rondas de 5 minutos solo podría dejar una señal para el ciclo siguiente. Prometería inmediatez que no puede cumplir; se usa *Run workflow* o `node checker.js` |
| Token compartido en `/api/check-results` | El repo es público y la URL del Worker es descubrible; sin token, un tercero puede inyectar disponibilidad falsa y provocar correos espurios |
| GitHub Actions antes que hardware propio | Gratis, sin mantenimiento y sin consumo. Solo se pasa al ordenador propio si Akamai rechaza las IPs de los runners |
| Tallas como cadenas, sin tipos | Elimina toda la lógica de rangos de tallas sin perder funcionalidad |
| Bershka como segunda tienda, con `src/bershka.js`/`src/bershka-fetch.js` aparte en vez de generalizar `src/zara.js` | Pedido explícitamente por el propietario. Mismo bloqueo de Akamai que Zara (mismo grupo, Inditex), pero formato de URL y método de extracción distintos (JSON estático vs `window.__NUXT__` de Nuxt/Pinia); duplicar `parseUrl()`/`normalize()` es más simple que un parser configurable para dos casos |
| `evaluateSize()` compartida entre las dos tiendas sin cambios | Ya operaba sobre `{label, status}` sin saber de dónde venía; y el vocabulario de disponibilidad (`in_stock`, `low_on_stock`, `out_of_stock`, `coming_soon`) resultó ser idéntico en las dos tiendas |
| `store` en `items` y en el índice único | Necesario para que `checker.js` sepa a qué tienda preguntar por cada artículo, y para no chocar si dos tiendas coinciden por azar en `product_id` |
