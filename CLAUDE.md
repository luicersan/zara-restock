# CLAUDE.md

Lee `SPEC.md` antes de tocar nada. Es la fuente de verdad de los requisitos.

## Qué es esto

Avisador de reposiciones de artículos de Zara. Dos piezas: un Cloudflare Worker
que sirve la interfaz, expone una API y envía los correos; y `checker.js`, un
script de Node con Puppeteer que consulta Zara cada 5 minutos y le manda los
resultados al Worker. El Worker **no** tiene cron propio.

## Regla número uno

**Simplicidad por encima de todo.** Esta aplicación la usan dos personas para
vigilar seis artículos. Cada abstracción que añadas es tiempo perdido y una cosa
más que se puede romper.

Concretamente, no hagas nada de esto salvo que se te pida:

- Ni React, ni Vue, ni Tailwind, ni bundler, ni paso de build del frontend.
- Ni ORM, ni capa de repositorio, ni inyección de dependencias.
- Ni sistema de plugins "por si mañana añadimos H&M".
- Ni logging estructurado, ni métricas, ni healthchecks.
- Ni Docker.
- Ni dependencias de npm más allá de `wrangler`, `vitest` y `puppeteer`. El SDK
  de Resend tampoco: es un `fetch` a una URL.

`puppeteer` es la única excepción, y solo para `checker.js` (ver `ZARA-API.md`
y `SPEC.md` §7): Zara bloquea con un challenge de Akamai cualquier petición sin
navegador real ejecutando JavaScript, confirmado en el paso 0. El Worker en sí
**no** importa `puppeteer` ni lo necesita — sigue sin más dependencias que
`wrangler` y `vitest`.

Si dudas entre dos soluciones, elige la que tenga menos ficheros.

## Stack

- Cloudflare Workers (JavaScript, módulos ES). **No TypeScript.**
- Cloudflare D1 para persistencia.
- Cron Triggers para la comprobación periódica.
- Resend vía `fetch` para el correo.
- Vitest para los tests.

## Estructura

```
├── CLAUDE.md          este fichero
├── SPEC.md            requisitos
├── DESPLIEGUE.md      pasos de despliegue y runbook
├── ZARA-API.md        resultado del paso 0
├── wrangler.toml
├── package.json
├── schema.sql
├── seed.sql
├── checker.js         UN SOLO DISPARO: una ronda y sale. Sin bucle, sin
│                      demonio. Único fichero que importa zara-fetch.js
├── .github/workflows/
│   └── checker.yml    lanza checker.js cada 5 min (alojamiento A)
├── checker.timer      \ unidades systemd para el alojamiento B
├── checker.service    /  (ordenador propio). Ver DESPLIEGUE.md
├── src/
│   ├── index.js       fetch() + enrutado. SIN scheduled(): no hay cron de
│   │                  Worker (SPEC.md §7.3)
│   ├── zara.js        parseUrl() y normalize(). Sin dependencias.
│   ├── zara-fetch.js  fetchProduct(), con Puppeteer. AISLADO.
│   ├── check.js       transición/notificación + dentroDeVentana()
│   ├── mail.js        sendRestockEmail()
│   └── ui.js          devuelve la cadena HTML de la interfaz
└── test/
    └── zara.test.js
```

`src/zara.js` + `src/zara-fetch.js` son los únicos ficheros que saben cómo
funciona Zara por dentro. Nada fuera de ellos conoce rutas, cabeceras ni
formatos de respuesta. Están separados en dos ficheros por una razón muy
concreta, comprobada con `wrangler dev` al construir el paso 4: `fetchProduct()`
usa Puppeteer, y Puppeteer importa módulos nativos de Node (`fs`, `crypto`,
`child_process`...) que el bundler de Workers no puede empaquetar. Si
`fetchProduct()` viviera en el mismo fichero que `parseUrl()`/`normalize()`,
el Worker fallaría al compilar en cuanto `index.js` importase cualquier cosa
de ese fichero, aunque nunca llamase a `fetchProduct()`. Por eso:

- `src/zara.js`: sin dependencias. Lo importan tanto el Worker como `checker.js`.
- `src/zara-fetch.js`: importa `puppeteer`. Solo lo importa `checker.js`, nunca
  `src/index.js` ni nada que llegue al Worker.

**`checker.js` no tiene bucle.** Hace una ronda y termina con código 0. Quien
marca la periodicidad es el planificador de fuera (cron de GitHub Actions o
`systemd timer`). No añadas un `setInterval` ni un `while (true)`: rompe el
alojamiento A y complica el B.

**`checker.js` no sabe nada de horarios ni de pausas.** Lo primero que hace es
`GET /api/status`; si `run` es `false`, sale inmediatamente sin abrir Puppeteer.
Toda la lógica de ventana y pausa vive en el Worker (`SPEC.md` §3.3).

## Orden de construcción

No te saltes el orden. Los dos primeros puntos son los que deciden si el
proyecto es viable; todo lo demás es trivial en comparación.

1. **Paso 0 — descubrimiento. Hecho.** `curl` está bloqueado por un challenge de
   Akamai pase lo que pase (no solo por IP de datacenter); solo un navegador real
   (Puppeteer headless probado y confirmado) consigue la página. Ver
   `ZARA-API.md` y `SPEC.md` §7.
2. **Prueba del alojamiento A, ANTES de construir nada más.** Un workflow mínimo
   de GitHub Actions que solo instale Puppeteer, cargue una ficha de producto e
   imprima el nombre. Se lanza con *Run workflow*. Si sale el challenge de
   Akamai en vez del producto, el alojamiento A queda descartado y se va al B
   (`SPEC.md` §7.3) — pero eso no cambia ni una línea del resto. **Pregunta al
   usuario antes de dar por buena o por mala esta prueba.**
3. `src/zara.js` (`parseUrl`, `normalize`) + `src/zara-fetch.js`
   (`fetchProduct()`, con Puppeteer) + `test/zara.test.js`, en verde.
4. `schema.sql` aplicado a D1 en local y en remoto.
5. `src/check.js`: `decidirNotificacion()` y `dentroDeVentana()`, con sus tests
   (incluidos los casos de horario de verano e invierno, `SPEC.md` §9).
6. `src/index.js` con la API completa (`/api/status`, `/api/pause`,
   `/api/check-results` con su token) y `src/ui.js` con la interfaz. Prueba con
   `wrangler dev`. Sin `scheduled()`.
7. `src/mail.js` y el envío. Verifica que llega un correo de verdad.
8. `checker.js`, y el workflow definitivo `.github/workflows/checker.yml`.
9. `wrangler deploy` y secrets (`RESEND_API_KEY`, `CHECKER_TOKEN`).
10. Carga de `seed.sql` y prueba de aceptación completa (`SPEC.md` §10).

## Git

Repo **público** en GitHub: es lo que hace que los minutos de Actions sean
ilimitados (`SPEC.md` §7.3). Haz `git commit` al terminar cada paso de la lista,
con un mensaje descriptivo.

Como el repo es público, **nunca** deben aparecer en un fichero versionado: la
clave de Resend, el `CHECKER_TOKEN`, el PIN de pausa, la URL del Worker ni la
dirección de correo. Todo eso vive en secrets de Cloudflare y de GitHub. Un
`.gitignore` con `node_modules/`, `.dev.vars` y `.wrangler/` desde el primer
commit.

Si el alojamiento acaba siendo el B (ordenador propio), el repo puede pasar a
privado sin más consecuencia.

## Reglas de código

- Manejo de errores explícito. Nada de `catch {}` vacíos.
- Un error al consultar Zara **nunca** modifica el estado `available` guardado.
  Solo escribe `last_error` y `last_checked_at`.
- Todas las consultas a D1 con parámetros vinculados (`.bind()`), nunca
  concatenando cadenas.
- La API key de Resend se lee de `env.RESEND_API_KEY` y el token del checker de
  `env.CHECKER_TOKEN`, ambos secrets. **Nunca aparecen en el código, en
  `wrangler.toml`, ni en un commit.**
- `GET /api/settings` nunca devuelve `pause_pin`.
- El cálculo de la ventana horaria usa `Intl.DateTimeFormat` con
  `timeZone: "Europe/Madrid"`. **No restes horas a mano ni uses desfases fijos**:
  el cambio CET/CEST lo tiene que resolver la plataforma.
- Comentarios y textos de la interfaz en español.
- Fechas guardadas en ISO 8601 UTC; se convierten a `Europe/Madrid` solo al pintar.

## Interfaz

Una sola página, tres bloques, en este orden:

1. **Banda de estado** arriba del todo: `Activo` / `En pausa` / `Fuera de
   horario (activo de 08:00 a 23:00)`, según `GET /api/status`, con el botón
   `Pausar` / `Reanudar` que pide el PIN.
2. Formulario de alta: campo de URL, campo de talla, botón "Añadir". Con un aviso
   de que los artículos nuevos aparecen como `Pendiente` hasta la siguiente ronda.
3. Tabla de artículos con el botón de borrar en cada fila. **Sin botón
   "Comprobar ahora"** (`SPEC.md` §4.1).
4. Campo de correo de notificación con su botón "Guardar".

HTML plano, unas pocas reglas de CSS en un `<style>` en línea, `fetch` en un
`<script>` en línea. Legible en móvil, que es donde se van a añadir los artículos
después de verlos en la app de Zara. Los errores se muestran en la propia página,
no con `alert()` ni solo en la consola.

No inviertas tiempo en el aspecto visual más allá de que se lea bien.

## Comandos

```bash
npm run dev                                  # wrangler dev en local
npm test                                     # vitest
npx wrangler d1 execute zara-restock --local --file=schema.sql
npx wrangler d1 execute zara-restock --remote --file=schema.sql
npx wrangler deploy
npx wrangler tail                            # logs en vivo del Worker desplegado

npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CHECKER_TOKEN

node checker.js                              # una ronda a mano (necesita .env)
```

## Cuando algo se rompa

Si la comprobación deja de funcionar, descarta primero lo barato, en este orden:

1. ¿Está en pausa o fuera de la ventana? Mira la banda de estado.
2. ¿Se están ejecutando los workflows? GitHub desactiva los `schedule` de un
   repo público tras 60 días sin actividad.
3. ¿Qué dice la columna Estado del listado? Si todos están en `Error` con un
   challenge de Akamai, el problema es el alojamiento (§7.3), no el código.
4. Solo entonces: `ZARA-API.md` y `src/zara-fetch.js` (o `src/zara.js` si es un
   problema de parseo de URL/tallas). Zara habrá cambiado algo. El resto de la
   aplicación no se toca.
