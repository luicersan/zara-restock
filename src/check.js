// Lógica de comprobación y decisión de notificar. Sin dependencias de Zara ni
// de Puppeteer: la usan tanto el Worker (para decidir si toca enviar correo)
// como check-local.js (para saber si la talla vigilada está disponible).

import { normalize } from "./zara.js";

const AVAILABLE_STATUSES = new Set(["in_stock", "low_on_stock"]);

/**
 * Decide si la talla vigilada está disponible, a partir de la lista de
 * tallas devuelta por fetchProduct(). Lanza si la talla ya no existe entre
 * las tallas del producto (SPEC.md §3.1/§3.4), con la lista de válidas.
 */
export function evaluateSize(sizes, targetSize) {
  const target = normalize(targetSize);
  const match = sizes.find((s) => normalize(s.label) === target);
  if (!match) {
    const validas = sizes.map((s) => s.label).join(", ") || "ninguna";
    throw new Error(`La talla "${targetSize}" ya no existe entre las tallas del producto. Tallas válidas: ${validas}`);
  }
  return AVAILABLE_STATUSES.has(match.status);
}

/**
 * Solo la transición agotado (false) → disponible (true) requiere avisar
 * (SPEC.md §3.4). Un error en la comprobación nunca llega hasta aquí: el
 * llamador debe dejar el estado intacto y no invocar esta función.
 */
export function decidirNotificacion(anterior, actual) {
  return anterior === false && actual === true;
}
