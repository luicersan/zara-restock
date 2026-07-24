# BERSHKA-API.md — cómo se consulta la disponibilidad en Bershka

Resultado del "paso 0" para Bershka (segunda tienda, `SPEC.md` §2/§7). Producto
de prueba: `c0p209096041` / `colorId=812` ("Pantalón felpa").

## Mismo bloqueo que Zara, mismo mecanismo de salto

Un `curl` con cabeceras completas de navegador recibe un `301` a la URL con
slug y, al seguirlo, una página de interstitial de Akamai (~2.3 KB, con
`bm-verify` en la URL de refresco) — el mismo patrón exacto que en Zara
(`ZARA-API.md`). Tiene sentido: Bershka y Zara son ambas de Inditex y
comparten la protección de Akamai Bot Manager.

Puppeteer headless (mismo método que Zara: `domcontentloaded` + ~4s de
espera) consigue la página real sin problema. No hace falta descubrir nada
nuevo aquí: si el mecanismo de bypass funciona para Zara, funciona para
Bershka.

## Diferencia real: cómo está embebida la disponibilidad

Bershka **no** embebe JSON estático en el HTML como Zara. Su frontend es
Nuxt/Vue con Pinia como store. La variable global es:

```html
<script>window.__NUXT__=(function(a,b,c,...){ ... return {...} })(v1,v2,...)</script>
```

Es una función autoejecutada que reconstruye el estado para reducir el
tamaño del payload (valores repetidos convertidos en parámetros). **No es
JSON**: no se puede extraer con una regex + `JSON.parse` como
`window.zara.viewPayload`. Solo se puede leer una vez que el navegador ya ha
ejecutado ese script, con `page.evaluate(() => window.__NUXT__)` dentro de
Puppeteer — el propio navegador hace el trabajo de "deshacer" la función.

## Dónde está el producto dentro de `__NUXT__`

```
window.__NUXT__.pinia.productDetail.currentProduct
```

Estructura relevante (recortada):

```json
{
  "id": 209096041,
  "name": "Pantalón felpa",
  "colors": [
    {
      "id": "812",
      "name": "Gris",
      "sizes": [
        { "name": "product.properties.color.size.lilBsk:10-12", "stock": "out_of_stock", "isLilBsk": true },
        { "name": "XS", "stock": "out_of_stock", "isLilBsk": false },
        { "name": "S",  "stock": "out_of_stock", "isLilBsk": false }
      ]
    }
  ]
}
```

| Dato buscado | Campo |
|---|---|
| Nombre del producto | `currentProduct.name` |
| Color (para verificar que es el `colorId` de la URL) | `currentProduct.colors[].id` (comparar como cadena) |
| Etiqueta de talla | `currentProduct.colors[].sizes[].name` |
| Estado de la talla | `currentProduct.colors[].sizes[].stock` |

**Ruido a filtrar**: cada color trae una talla fantasma con
`isLilBsk: true` y un nombre que es literalmente una clave de traducción sin
resolver (`"product.properties.color.size.lilBsk:10-12"`), no una talla real.
`src/bershka-fetch.js` la descarta antes de devolver la lista de tallas, para
que no ensucie el mensaje de "tallas válidas" cuando una talla no existe.

## Vocabulario de disponibilidad: idéntico al de Zara

Confirmado por inspección directa: `out_of_stock`, `in_stock`, `coming_soon`,
`low_on_stock` — las mismas cuatro cadenas que usa Zara. Se considera
disponible lo mismo que en Zara (`in_stock` o `low_on_stock`, `SPEC.md`
§3.4): `evaluateSize()` de `src/check.js` se reutiliza sin cambios, porque ya
trabaja sobre la forma abstracta `{label, status}` y no sabe nada de qué
tienda la produjo.

## Formato de las URL de Bershka

```
https://www.bershka.com/es/c0p209096041.html?colorId=812
                            ^^^^^^^^^          ^^^
                            productId          colorId (equivalente al v1 de Zara)
```

- `product_id`: se extrae con `/c0p(\d+)\.html/`.
- `colorId`: parámetro de consulta `colorId`.

A diferencia de Zara, el slug no va delante de `c0p...`, sino que Bershka
redirige igual si se pide la URL sin él (`.../c0p209096041.html?colorId=812`
→ 301 a `.../pantalón-felpa-c0p209096041.html?colorId=812`). Se guarda la
URL tal cual la pega el usuario, sin slug, igual que con Zara.

## Nota de implementación

`src/bershka-fetch.js` importa Puppeteer, igual que `src/zara-fetch.js`, y
por la misma razón (módulos nativos de Node que el bundler de Workers no
puede empaquetar): solo lo importa `checker.js`, nunca `src/index.js`.
`src/bershka.js` (`parseUrl`) no tiene dependencias, igual que `src/zara.js`.

No se comparte código de parseo entre `src/zara.js` y `src/bershka.js` más
allá de que ambos tienen su propia copia de `normalize()` (tres líneas): son
formatos de URL distintos y CLAUDE.md pide evitar un "sistema de plugins"
genérico para tiendas. La única función real que se comparte entre las dos
tiendas es `evaluateSize()`, y eso porque ya era agnóstica a la tienda desde
el principio (opera sobre `{label, status}`, no sobre HTML de nadie).
