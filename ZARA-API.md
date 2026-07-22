# ZARA-API.md — cómo se consulta la disponibilidad

Resultado del paso 0 (`SPEC.md` §7.1). Producto de prueba: `p05584397` / `v1=517756025`
("TOP HALTER PUNTO STRETCH").

## Hallazgo principal: no hay endpoint JSON, y `curl` no sirve

Zara **no** hace ninguna llamada AJAX/XHR para las tallas: los datos están
embebidos en el HTML de la propia ficha de producto, en un `<script>` inline.
No existe (o al menos no se usa desde la propia web) ningún endpoint bajo
`itxrest/...` para esto — no se ha inventado ninguna ruta.

**Bloqueo de Akamai.** La ficha de producto está detrás de un challenge JS de
Akamai Bot Manager (prueba de trabajo + `bm-verify`). Probado y confirmado:

- `curl`, con o sin cabeceras completas de navegador (`User-Agent`,
  `Accept-Language`, `sec-ch-ua`, `Sec-Fetch-*`...), **siempre** recibe una
  página de interstitial (~2.3 KB, `<iframe src="/interstitial/ic.html">`) en
  vez del HTML real. Esto ocurre incluso desde una IP residencial normal, no
  solo desde IPs de centro de datos — es más estricto de lo que anticipa
  `SPEC.md` §7.3.
- Un **navegador real** (probado con la extensión Claude en Chrome) carga la
  página sin problema.
- **Puppeteer en modo headless** (Node + Chromium), probado 4/4 veces con
  éxito, tanto `headless: true` (modo nuevo) como `headless: 'shell'` (modo
  clásico): consigue la página real de forma consistente. La clave es no
  esperar a `networkidle2` (el challenge JS y la telemetría de fondo hacen que
  la red nunca quede inactiva) sino a `domcontentloaded` + una espera corta
  (~3-4 s) para que el script embebido ya esté en el DOM.

**Conclusión práctica:** un `fetch()` puro —lo único que puede hacer un
Cloudflare Worker— nunca pasará este challenge. La única vía que funciona es
un navegador real ejecutando JavaScript, headless o no. Esto obliga al **Plan
B de `SPEC.md` §7.3 desde el principio**, no como contingencia futura: la
consulta a Zara se hace con Puppeteer desde un ordenador, no desde el Worker.
Ver la sección "Implicación de arquitectura" más abajo y `DESPLIEGUE.md`.

## Método que funciona

1. Lanzar Chromium headless con Puppeteer.
2. Navegar a la URL limpia del producto:
   `https://www.zara.com/es/es/{slug}-p{productId}.html?v1={variantId}`
   (el `slug` es cosmético, Zara redirige igual si se pone cualquier cosa
   delante de `-p{productId}.html`, pero se guarda la URL tal cual la pega el
   usuario).
3. Esperar a `domcontentloaded` y una pausa adicional de ~3-4 segundos.
4. Leer el HTML de la página (`page.content()`).
5. Extraer el JSON embebido con una expresión regular sobre el `<script>` que
   lo contiene:

   ```js
   const match = html.match(/window\.zara\.viewPayload\s*=\s*(\{[\s\S]*?\});<\/script>/);
   const payload = JSON.parse(match[1]);
   ```

   El script que contiene `window.zara.viewPayload = {...};` no tiene ninguna
   otra asignación dentro: termina justo con `};` seguido de `</script>`, así
   que el corte no ambiguo.

## Cabeceras usadas

Con Puppeteer basta con fijar:

- `User-Agent`: uno de Chrome de escritorio reciente.
- `Accept-Language: es-ES,es;q=0.9`

No ha hecho falta nada más (ni cookies previas, ni Referer) porque es
Puppeteer quien resuelve el challenge de Akamai al ejecutar el JS de la
página, no las cabeceras.

## Estructura del JSON (recortada, datos reales)

```json
{
  "product": {
    "id": 512922916,
    "name": "TOP HALTER PUNTO STRETCH"
  },
  "detail": {
    "colors": [
      {
        "id": "641",
        "productId": 517756025,
        "name": "Rojo oscuro",
        "sizes": [
          { "name": "S", "availability": "out_of_stock", "sku": 517752017 },
          { "name": "M", "availability": "out_of_stock", "sku": 517752018 },
          { "name": "L", "availability": "out_of_stock", "sku": 517752019 }
        ]
      }
    ]
  }
}
```

Ruta completa en el objeto: `window.zara.viewPayload.product.detail.colors`.

## De dónde sale cada dato

| Dato buscado | Campo |
|---|---|
| Nombre del producto | `product.name` |
| Variante (para verificar que es la correcta, `v1` de la URL) | `product.detail.colors[].productId` (comparar como número o cadena, da igual) |
| Etiqueta de talla | `product.detail.colors[].sizes[].name` |
| Estado de la talla | `product.detail.colors[].sizes[].availability` |

`availability` observado: `"out_of_stock"`. Según `SPEC.md` §3.4, se considera
**disponible** solo `in_stock` o `low_on_stock`; cualquier otro valor
(`out_of_stock`, `coming_soon`, `back_soon`, o que la talla no aparezca en el
array `sizes`) cuenta como agotado. No se han observado aún en pruebas reales
los valores `in_stock` / `low_on_stock` / `coming_soon` / `back_soon`, pero la
lógica de `check.js` debe tratarlos igual: solo esos dos cuentan como
disponible, todo lo demás no.

Si `product.detail.colors` no contiene ningún color con `productId` igual al
`v1` pedido, o si ese color no tiene ninguna talla cuyo `name` normalizado
coincida (`SPEC.md` §6), se trata igual que talla inexistente / agotada según
corresponda.

## Implicación de arquitectura (pendiente de reflejar en `SPEC.md`)

`src/zara.js` con la firma `fetchProduct(productId, variantId)` **no puede
ejecutarse dentro del Worker**: Cloudflare Workers no puede lanzar un proceso
Chromium. La función tiene que vivir en un contexto Node (el script
`check-local.js` del Plan B), usando Puppeteer.

Esto afecta a partes de `SPEC.md` que asumían que el Worker consulta a Zara
directamente:

- **Alta de artículo (§3.1)**: la comprobación síncrona de disponibilidad al
  dar de alta un artículo no la puede hacer el Worker. Hay que decidir cómo se
  resuelve (p. ej., que el alta la dispare el script local, o que el alta se
  guarde "pendiente de verificar" hasta la siguiente ronda del script local).
- **`POST /api/check` (§4.1)**: dice que "ejecuta exactamente el mismo código
  que el cron". Si el cron ya no vive en el Worker, este endpoint tiene que
  pasar a ser una señal hacia el script local, no una comprobación inmediata.
- **`DESPLIEGUE.md` "Plan B"**: su síntoma descrito ("`curl` funciona desde tu
  ordenador pero el Worker recibe 403") no es lo que ha pasado — `curl` está
  bloqueado también en local. El texto de esa sección debe actualizarse.

No se ha tocado `SPEC.md` ni `DESPLIEGUE.md` todavía: son decisiones de
requisitos, y `CLAUDE.md` pide cambiarlos ahí primero y con el propietario
delante antes de escribir código.
