// Lógica de comprobación y decisión de notificar. Sin dependencias de Zara ni
// de Puppeteer: la usan tanto el Worker (para decidir si toca enviar correo y
// si toca consultar Zara) como checker.js (para saber si la talla vigilada
// está disponible).

import { normalize } from "./zara.js";

const AVAILABLE_STATUSES = new Set(["in_stock", "low_on_stock"]);

// Ventana horaria activa (SPEC.md §3.3). Fuera de ella no se consulta a Zara.
// Cambiar aquí y redesplegar si hace falta ajustarla; no se expone en la
// interfaz.
export const VENTANA_INICIO = 8;
export const VENTANA_FIN = 1;

/**
 * Hora actual en Madrid (0-23), resolviendo CET/CEST vía Intl. hourCycle:
 * "h23" evita la ambigüedad de hour12:false, que en algunos motores puede
 * devolver "24" para la medianoche.
 */
export function horaMadrid(fecha = new Date()) {
  return Number(
    new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "numeric",
      hourCycle: "h23",
    }).format(fecha)
  );
}

/**
 * true si la hora de Madrid está dentro de [VENTANA_INICIO, VENTANA_FIN).
 * Cuando VENTANA_FIN < VENTANA_INICIO, la ventana cruza la medianoche.
 * No restar horas a mano ni usar desfases fijos: el cambio de hora lo
 * resuelve Intl (CLAUDE.md).
 */
export function dentroDeVentana(fecha = new Date()) {
  const hora = horaMadrid(fecha);
  if (VENTANA_INICIO <= VENTANA_FIN) {
    return hora >= VENTANA_INICIO && hora < VENTANA_FIN;
  }
  return hora >= VENTANA_INICIO || hora < VENTANA_FIN;
}

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
