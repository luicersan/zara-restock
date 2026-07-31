# DESPLIEGUE.md

Sustituye por completo a la versión anterior, que daba por hecho un cron de
Cloudflare y una VM siempre encendida. Ninguna de las dos cosas se usa ya.

## Antes de empezar

1. **Cuenta de Cloudflare.** `dash.cloudflare.com` → Sign up. No pide tarjeta y
   no hace falta dominio: la aplicación vivirá en
   `zara-restock.TU-SUBDOMINIO.workers.dev`.
2. **Cuenta de Resend**, creada **con la dirección de correo que va a recibir los
   avisos**. Sin dominio verificado, Resend solo permite enviar a la dirección de
   la propia cuenta. Después: `API Keys` → `Create API Key`, permiso
   *Sending access*. Copia la clave `re_...`, que solo se muestra una vez.
3. **Cuenta de GitHub**, con un repositorio **público** (`SPEC.md` §7.3: es lo
   que hace que los minutos de Actions sean ilimitados).
4. Node.js LTS, Git y Claude Code instalados.

## 1. El Worker

```bash
git clone <tu-repo> && cd zara-restock
npm install
npx wrangler login
npx wrangler d1 create zara-restock
```

El último comando devuelve un `database_id`. **Pégalo en `wrangler.toml`.**

```bash
npm run db:local
npm run db:remote

npx wrangler secret put RESEND_API_KEY     # la clave re_... de Resend
npx wrangler secret put CHECKER_TOKEN      # ver abajo

npx wrangler deploy
```

Para generar el token del checker (un valor aleatorio largo, no lo inventes a
mano):

```bash
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

Guárdalo: hace falta también en GitHub.

`wrangler deploy` imprime al final la URL pública. Apúntala.

Último paso del Worker: abre la URL, guarda el correo de notificación y
**cambia el PIN de pausa**, que se siembra a `0000`:

```bash
npx wrangler d1 execute zara-restock --remote \
  --command "UPDATE settings SET value = '1234' WHERE key = 'pause_pin'"
```

## 2. El checker — alojamiento A: GitHub Actions

**Pruébalo antes que nada** (`CLAUDE.md`, paso 2 del orden de construcción). Si
Akamai rechaza las IPs de los runners, este camino no sirve y hay que ir al B.

En el repo de GitHub, `Settings` → `Secrets and variables` → `Actions` → dos
secrets:

| Nombre | Valor |
|---|---|
| `WORKER_URL` | `https://zara-restock.TU-SUBDOMINIO.workers.dev` |
| `CHECKER_TOKEN` | el mismo valor que pusiste en Cloudflare |

Haz `git push` con `.github/workflows/checker.yml` y ve a la pestaña `Actions`.
Lanza el workflow a mano con **Run workflow** y mira la salida.

- Si los artículos pasan de `Pendiente` a su estado real, ha funcionado y no
  necesitas hardware.
- Si el log muestra el challenge de Akamai, un captcha o un HTML sin
  `viewPayload`, ve al alojamiento B.

**GitHub desactiva los workflows programados de un repositorio público tras 60
días sin actividad.** Lo avisa por correo. Un commit trivial lo reactiva; si te
molesta, ponlo en el calendario cada dos meses.

### Por qué el cron es horario y no cada 5 minutos

Porque un `cron: '*/5'` **no funciona**, y no es un fallo de configuración: el
planificador de GitHub descarta la mayoría de los eventos programados. Medido en
este repo, de ~50 disparos esperados en 4 horas llegaron 2.

Así que el cron dispara **una vez por hora** y el job hace un bucle de 10 rondas
separadas 5 minutos (~45 min de cobertura). Lo que verás en la pestaña `Actions`
es, por tanto, **una ejecución por hora de ~45 minutos**, no doce de un minuto.
Eso es lo correcto; si vuelves a ver ejecuciones cortas y frecuentes, alguien ha
revertido el workflow.

`Run workflow` a mano hace **una sola ronda** y termina en un minuto, para que
siga sirviendo como comprobación inmediata.

## 3. El checker — alojamiento B: ordenador propio (Ubuntu Server)

Solo si el A ha fallado, o si prefieres no depender de GitHub. `checker.js` no
cambia respecto al A: es de un solo disparo y sin estado (`SPEC.md` §7.3). Lo
único que cambia es quién lo lanza y cada cuánto.

Este alojamiento ya está montado en un Asus F555LA con Ubuntu Server 24.04 LTS
(hostname `homeserver`, usuario `homeserver`, IP fija `192.168.1.60` por WiFi,
suspensión al cerrar la tapa desactivada, SSH activo). Accede con
`ssh homeserver@192.168.1.60`. El repo ya está clonado ahí vía SSH a GitHub; lo
que falta es Node.js, las dependencias de sistema que Puppeteer necesita, y las
unidades de systemd.

```bash
sudo apt update && sudo apt install -y nodejs npm
```

Puppeteer descarga su propio Chromium con `npm install` (no hace falta el
paquete `chromium-browser`: en 24.04 es un envoltorio de snap, y lo único que
falta de verdad son las bibliotecas compartidas que Chromium headless necesita
para arrancar en un servidor sin entorno gráfico). Ese `npm install` también
necesita `unzip` para extraer el Chromium descargado — un Ubuntu Server mínimo
no lo trae, y sin él falla con "no zip archiver is available":

```bash
sudo apt install -y unzip ca-certificates fonts-liberation libasound2t64 \
  libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libgbm1 libgtk-3-0 \
  libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
  libxrandr2 xdg-utils
```

```bash
cd ~/zara-restock && npm install
```

Las credenciales en un `.env` dentro del repo (está en `.gitignore`, así que no
se sube), con `WORKER_URL` y `CHECKER_TOKEN`:

```bash
printf 'WORKER_URL=https://...\nCHECKER_TOKEN=...\n' > ~/zara-restock/.env
chmod 600 ~/zara-restock/.env
```

Prueba una ronda a mano antes de automatizar:

```bash
node checker.js
```

Y después, `checker.timer` + `checker.service` (ya apuntan a `User=homeserver`
y `WorkingDirectory=/home/homeserver/zara-restock`; revísalos si el usuario o
la ruta del clon son distintos) con `OnUnitActiveSec=5min`:

```bash
sudo cp checker.service checker.timer /etc/systemd/system/
sudo systemctl enable --now checker.timer
systemctl list-timers checker.timer      # comprobar el próximo disparo
journalctl -u checker.service -f         # logs
```

En este alojamiento el intervalo ya no lo limita GitHub: puedes bajarlo a 2
minutos si quieres, cambiando `OnUnitActiveSec`. La ventana horaria la sigue
calculando el Worker, así que no hay nada que cambiar por ese lado.

Consumo estimado: unos 12 W continuos, en torno a 20 €/año.

---

# Runbook

## Pausar la aplicación

Botón `Pausar` de la interfaz, que pide el PIN. Con `paused = 1`, `checker.js`
sale sin abrir Puppeteer. El runner sigue arrancando cada hora y recorriendo sus
10 rondas, pero cada una termina en un par de segundos contra `/api/status`: es
gratis y no toca Zara.

## Cambiar la ventana horaria

Constantes `VENTANA_INICIO` / `VENTANA_FIN` en el código del Worker, y
`wrangler deploy`. Si la mueves mucho, ajusta también el rango de horas del cron
en `.github/workflows/checker.yml`, que es un superconjunto en UTC. **No pongas
la lógica de horarios en el workflow**: ahí solo hay una optimización, la
decisión la toma el Worker.

## Cambiar la dirección de notificación

Desde la interfaz. Tiene que seguir siendo la dirección de la cuenta de Resend, o
los envíos fallarán. Para varias direcciones hace falta un dominio propio
verificado (~10 €/año), sin cambios en la aplicación más allá del remitente.

## Dejan de llegar avisos

En orden, de lo más barato a lo más caro:

1. **¿Está en pausa o fuera de horario?** Banda de estado de la interfaz.
2. **¿Se están ejecutando los workflows?** Pestaña `Actions`. Debe haber **una
   ejecución por hora, de ~45 minutos**. Si llevan 60 días parados, GitHub los ha
   desactivado por inactividad. Que falte alguna hora suelta es normal: el
   planificador de GitHub descarta disparos y no hay forma de evitarlo.
3. **Columna Estado del listado.** Si todos están en `Error` con un challenge de
   Akamai, el problema es el alojamiento: pasa del A al B. Si es un solo
   artículo, probablemente ya no exista en el catálogo; bórralo.
4. **Estados correctos pero sin correo:** panel de Resend (registro de envíos),
   validez de la clave, y la carpeta de spam.
5. **Solo entonces**, `ZARA-API.md` y `src/zara-fetch.js`: Zara habrá cambiado
   algo. El resto de la aplicación no se toca.

## Rotar el token del checker

`npx wrangler secret put CHECKER_TOKEN` y actualizar el secret homónimo en
GitHub. Si solo cambias uno de los dos, `/api/check-results` devolverá 401 y
todos los artículos se quedarán con su último estado conocido.

## Añadir otra tienda

No está contemplado y no debería intentarse sobre esta aplicación. Si algún día
hace falta, se replantea desde los requisitos.
