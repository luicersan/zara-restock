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

Para probar el envío de correo en local (`wrangler dev` no lee secrets de
producción), crea un `.dev.vars` en la raíz del proyecto —**nunca se comitea**,
ya está en `.gitignore`— con:

```
RESEND_API_KEY=re_...
```

Desplegar:

```bash
npx wrangler deploy
```

La primera vez pedirá elegir un subdominio `workers.dev`. Al terminar imprime la
URL pública. **El Worker no tiene cron propio** (`SPEC.md` §7.3): quien habla
con Zara es `check-local.js`, en tu ordenador, no el Worker desplegado.

Último paso: abrir la URL, guardar el correo de notificación y dar de alta los
cinco artículos desde la interfaz (quedan en estado `Pendiente` hasta la
primera ronda de `check-local.js`, `SPEC.md` §3.1).

## Poner en marcha `check-local.js`

Esto no es opcional ni es un plan B: es la única forma de que la aplicación
funcione. Zara bloquea con un challenge de Akamai cualquier petición que no
sea un navegador real ejecutando JavaScript (`ZARA-API.md`), así que el Worker
nunca podrá consultar la disponibilidad por sí mismo.

```bash
WORKER_URL=https://tu-worker.workers.dev node check-local.js
```

Necesita un proceso corriendo sin parar (hace su propia ronda cada 120
segundos internamente; no hace falta cron del sistema para eso). Como tiene
que estar encendido todo el rato, hay dos formas de tenerlo funcionando:

**Opción A — tu propio ordenador.** Lo más simple, con la contrapartida de
que las comprobaciones se paran mientras el ordenador esté apagado. Deja una
terminal abierta con el comando de arriba, o prográmalo con el Programador de
tareas de Windows para que arranque solo al iniciar sesión.

**Opción B — una VM gratuita que esté siempre encendida** (recomendado si no
quieres depender de tu ordenador). Con **Oracle Cloud "Always Free"** (gratis
sin límite de tiempo, a diferencia de AWS/GCP que solo dan 12 meses):

1. Crea una instancia Ampere (`VM.Standard.A1.Flex`, marcada como "Always Free
   eligible") con imagen Ubuntu, y conéctate por SSH.
2. Instala Node.js LTS y las librerías que Chromium necesita para arrancar en
   Linux:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt-get install -y nodejs \
     ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 \
     libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 libgbm1 \
     libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 \
     libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
     xdg-utils
   ```

   (Si al arrancar `check-local.js` Chromium se queja de alguna librería que
   falta, el propio mensaje de error dice cuál — se instala con `apt-get` y
   listo; los nombres exactos varían algo entre versiones de Ubuntu.)

3. Copia el proyecto entero a la VM (con `git clone` si le has puesto un
   remoto, o `scp -r`) y ejecuta `npm install` ahí también, para que se
   descargue Puppeteer con su Chromium.
4. Copia `check-local.service` a `/etc/systemd/system/check-local.service`.
   Revisa dentro `User`, `WorkingDirectory` y `WORKER_URL` si no coinciden con
   tu VM.
5. Actívalo:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now check-local
   sudo systemctl status check-local     # debe decir "active (running)"
   journalctl -u check-local -f          # logs en vivo
   ```

`Restart=always` en el servicio hace que se reinicie solo si se cae, y
`WantedBy=multi-user.target` que arranque solo si reinicias la VM.

Sea cual sea la opción, si el proceso deja de correr los artículos se quedan
congelados en su último estado conocido (no se generan errores ni correos
falsos): es la contrapartida de que Zara bloquee cualquier petición que no
sea un navegador real (`SPEC.md` §7.3).

## Comprobar que funciona

```bash
npx wrangler tail       # logs en vivo del Worker (altas, borrados, resultados recibidos)
```

Con `check-local.js` corriendo en otra terminal, mira su salida para ver las
rondas de comprobación.

Para forzar una comprobación sin esperar hasta 120s: botón "Comprobar ahora" de
la interfaz, o `curl -X POST https://TU-URL/api/check`. Esto solo marca una
señal; `check-local.js` la recoge en su siguiente vuelta, no es instantáneo
(`SPEC.md` §4.1).

Prueba del correo de extremo a extremo, según `SPEC.md` §10.6: añade un artículo
que esté disponible ahora mismo, fuérzalo a agotado en la base de datos y dispara
una comprobación (con `check-local.js` corriendo).

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

- **Todo en `Pendiente`** → `check-local.js` no está corriendo, o no consigue
  llegar al Worker. Revisar la terminal donde corre el script.
- **Todos en `Error`** → Zara ha cambiado algo, o el challenge de Akamai ha
  cambiado de forma. Ver el mensaje de error en la fila y, si hace falta,
  repetir el paso 0 (`SPEC.md` §7.1) para actualizar `ZARA-API.md`.
- **Estados correctos pero sin correo** → problema de Resend. Revisar el panel de
  Resend (registro de envíos) y que la clave sea válida. Comprobar spam.
- **Un solo artículo en `Error`** → el artículo probablemente ya no existe en el
  catálogo, o la talla no existe (revisar el mensaje: incluye la lista de
  tallas válidas). Borrarlo o corregirlo.

Ante un cambio de Zara, el fichero a tocar es `src/zara.js`, guiándose por
`ZARA-API.md`. El resto de la aplicación no se toca.

## Añadir otra tienda

No está contemplado y no debería intentarse sobre esta aplicación. Si algún día
hace falta, se replantea desde los requisitos.
