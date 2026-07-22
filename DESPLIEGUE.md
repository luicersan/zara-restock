# DESPLIEGUE.md

## Antes de empezar

Necesitas, en este orden:

1. **Cuenta de Cloudflare.** `dash.cloudflare.com` → Sign up. Correo y contraseña,
   verificas el correo. No pide tarjeta y no hace falta dominio: la aplicación
   vivirá en `zara-restock.TU-SUBDOMINIO.workers.dev`.
2. **Cuenta de Resend**, creada **con la dirección de correo que va a recibir los
   avisos**. Sin dominio verificado, Resend solo permite enviar a la dirección de
   la propia cuenta; si la cuenta está a nombre de otro correo, los envíos fallarán.
   Después: `API Keys` → `Create API Key`, permiso *Sending access*. Copia la clave
   `re_...`, que solo se muestra una vez.
3. Node.js LTS, Git y Claude Code instalados.

## Puesta en marcha

```bash
mkdir zara-restock && cd zara-restock
git init
# copiar aquí los ficheros de este paquete
npm install
npx wrangler login          # abre el navegador, autoriza
```

Crear la base de datos:

```bash
npx wrangler d1 create zara-restock
```

Devuelve un bloque con un `database_id`. **Pégalo en `wrangler.toml`**, sustituyendo
`PEGAR_AQUI_EL_ID`.

Aplicar el esquema, en local y en remoto:

```bash
npm run db:local
npm run db:remote
```

Guardar la clave de Resend como secret (no va en ningún fichero del repo):

```bash
npx wrangler secret put RESEND_API_KEY
# pega la clave cuando la pida
```

Desarrollo local:

```bash
npm run dev     # http://localhost:8787
```

Desplegar:

```bash
npx wrangler deploy
```

La primera vez pedirá elegir un subdominio `workers.dev`. Al terminar imprime la
URL pública. El cron queda activo automáticamente por el `[triggers]` del
`wrangler.toml`.

Último paso: abrir la URL, guardar el correo de notificación y dar de alta los
cinco artículos desde la interfaz.

## Comprobar que funciona

```bash
npx wrangler tail       # logs en vivo, incluidas las ejecuciones del cron
```

Para forzar una comprobación sin esperar: botón "Comprobar ahora" de la interfaz,
o `curl -X POST https://TU-URL/api/check`.

Prueba del correo de extremo a extremo, según `SPEC.md` §10.6: añade un artículo
que esté disponible ahora mismo, fuérzalo a agotado en la base de datos y dispara
una comprobación.

```bash
npx wrangler d1 execute zara-restock --remote \
  --command "UPDATE items SET available = 0 WHERE id = 1"
```

Debe llegar el correo. Si es la primera vez, mirar también la carpeta de spam y
marcarlo como correo deseado.

---

# Runbook

## Cambiar el intervalo de comprobación

Editar la línea `crons` de `wrangler.toml` y `npx wrangler deploy`.

## Cambiar la dirección de notificación

Desde la interfaz. Pero recuerda: **tiene que seguir siendo la dirección de la
cuenta de Resend**, o los envíos fallarán silenciosamente para la aplicación
(se verán como error en la respuesta de la API).

Para enviar a varias direcciones hace falta verificar un dominio propio en Resend
(unos 10 €/año en Cloudflare Registrar). No requiere cambios en la aplicación más
allá del remitente en `src/mail.js`.

## Dejan de llegar avisos

Mirar la columna Estado del listado. Casos:

- **Todos en `Error`** → Zara ha cambiado algo, o está bloqueando las peticiones.
  Ver el mensaje de error. Si es 403 o 429, es bloqueo: subir el intervalo a 5
  minutos y volver a probar. Si persiste, plan B (abajo).
- **Estados correctos pero sin correo** → problema de Resend. Revisar el panel de
  Resend (registro de envíos) y que la clave sea válida. Comprobar spam.
- **Un solo artículo en `Error`** → el artículo probablemente ya no existe en el
  catálogo. Borrarlo.

Ante un cambio de Zara, el fichero a tocar es `src/zara.js`, guiándose por
`ZARA-API.md`. El resto de la aplicación no se toca.

## Plan B: Cloudflare bloqueado por Zara

Síntoma: `curl` funciona desde tu ordenador pero el Worker desplegado recibe 403
en todos los artículos.

La aplicación no cambia. Se mueve solo el fetch:

1. Escribir `check-local.js`, un script de Node que importa `src/zara.js`, consulta
   los artículos vía `GET /api/items`, comprueba disponibilidad y envía los
   resultados a un endpoint nuevo del Worker.
2. Programarlo con `cron` (Linux/macOS) o el Programador de tareas (Windows).
3. Quitar el bloque `[triggers]` de `wrangler.toml` y volver a desplegar.

Requiere tener el ordenador encendido. Es la contrapartida.

## Añadir otra tienda

No está contemplado y no debería intentarse sobre esta aplicación. Si algún día
hace falta, se replantea desde los requisitos.
