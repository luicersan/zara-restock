# CLAUDE.md

Lee `SPEC.md` antes de tocar nada. Es la fuente de verdad de los requisitos.

## Qué es esto

Avisador de reposiciones de artículos de Zara. Un único Cloudflare Worker que
sirve la interfaz, expone una API y ejecuta un cron cada 2 minutos.

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
- Ni dependencias de npm más allá de `wrangler` y `vitest`. El SDK de Resend
  tampoco: es un `fetch` a una URL.

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
├── ZARA-API.md        LO ESCRIBES TÚ en el paso 0
├── wrangler.toml
├── package.json
├── schema.sql
├── seed.sql
├── src/
│   ├── index.js       fetch() + scheduled() + enrutado
│   ├── zara.js        fetchProduct() y parseUrl(). AISLADO.
│   ├── check.js       lógica de comprobación y decisión de notificar
│   ├── mail.js        sendRestockEmail()
│   └── ui.js          devuelve la cadena HTML de la interfaz
└── test/
    └── zara.test.js
```

`src/zara.js` es el único fichero que sabe cómo funciona Zara por dentro. Nada
fuera de él conoce rutas, cabeceras ni formatos de respuesta.

## Orden de construcción

No te saltes el orden. En particular, **no escribas la aplicación antes de tener
funcionando la detección de disponibilidad**: es el único punto donde el proyecto
puede fracasar, y todo lo demás es trivial en comparación.

1. **Paso 0 — descubrimiento.** Sigue `SPEC.md` §7.1. Con `curl` desde la
   terminal, consigue el nombre del producto y la lista de tallas con su estado
   para `p05584397` / `v1=517756025`. Si `curl` no basta, pide al usuario que haga
   el paso de DevTools y te pegue el resultado. **Escribe `ZARA-API.md`.**
   No sigas al paso 1 hasta que esto funcione.
2. `src/zara.js` + `test/zara.test.js`, con los tests en verde.
3. `schema.sql` aplicado a D1 en local y en remoto.
4. `src/index.js` con la API y `src/ui.js` con la interfaz. Prueba con
   `wrangler dev`.
5. `src/mail.js` y el envío. Verifica que llega un correo de verdad.
6. `src/check.js` y el `scheduled()` del cron.
7. Primer `wrangler deploy`.
8. Carga de `seed.sql` y prueba de aceptación completa (`SPEC.md` §10).

## Git

Hay repo local, sin remoto. Haz `git commit` al terminar cada paso de la lista,
con un mensaje descriptivo. Es el único mecanismo de vuelta atrás que hay.

No hagas `git push`. No existe remoto.

## Reglas de código

- Manejo de errores explícito. Nada de `catch {}` vacíos.
- Un error al consultar Zara **nunca** modifica el estado `available` guardado.
  Solo escribe `last_error` y `last_checked_at`.
- Todas las consultas a D1 con parámetros vinculados (`.bind()`), nunca
  concatenando cadenas.
- La API key de Resend se lee de `env.RESEND_API_KEY`, que es un secret. **Nunca
  aparece en el código, en `wrangler.toml`, ni en un commit.**
- Comentarios y textos de la interfaz en español.
- Fechas guardadas en ISO 8601 UTC; se convierten a `Europe/Madrid` solo al pintar.

## Interfaz

Una sola página, tres bloques, en este orden:

1. Formulario de alta: campo de URL, campo de talla, botón "Añadir".
2. Tabla de artículos con el botón de borrar en cada fila, y un botón
   "Comprobar ahora" encima.
3. Campo de correo de notificación con su botón "Guardar".

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
```

## Cuando algo se rompa

Si la comprobación deja de funcionar, el sitio por donde empezar es siempre
`ZARA-API.md` y `src/zara.js`. Zara habrá cambiado algo. El resto de la aplicación
no se toca.
