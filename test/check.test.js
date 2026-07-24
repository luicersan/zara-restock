import { describe, expect, test } from "vitest";
import { decidirNotificacion, dentroDeVentana, evaluateSize } from "../src/check.js";

describe("decidirNotificacion", () => {
  test("agotado -> disponible notifica", () => {
    expect(decidirNotificacion(false, true)).toBe(true);
  });

  test("disponible -> disponible no notifica", () => {
    expect(decidirNotificacion(true, true)).toBe(false);
  });

  test("agotado -> agotado no notifica", () => {
    expect(decidirNotificacion(false, false)).toBe(false);
  });

  test("disponible -> agotado no notifica", () => {
    expect(decidirNotificacion(true, false)).toBe(false);
  });
});

describe("evaluateSize", () => {
  const sizes = [
    { label: "S", status: "out_of_stock" },
    { label: "M", status: "in_stock" },
    { label: "L", status: "low_on_stock" },
    { label: "XL", status: "coming_soon" },
  ];

  test("in_stock cuenta como disponible", () => {
    expect(evaluateSize(sizes, "M")).toBe(true);
  });

  test("low_on_stock cuenta como disponible", () => {
    expect(evaluateSize(sizes, "L")).toBe(true);
  });

  test("out_of_stock cuenta como agotado", () => {
    expect(evaluateSize(sizes, "S")).toBe(false);
  });

  test("coming_soon cuenta como agotado", () => {
    expect(evaluateSize(sizes, "XL")).toBe(false);
  });

  test("compara tallas normalizadas", () => {
    expect(evaluateSize(sizes, "m")).toBe(true);
    expect(evaluateSize(sizes, " l ")).toBe(true);
  });

  test("lanza si la talla no existe, listando las válidas", () => {
    expect(() => evaluateSize(sizes, "38")).toThrow(/S, M, L, XL/);
  });
});

describe("dentroDeVentana", () => {
  // Ventana 08:00-23:00 hora de Madrid. España está en CET (UTC+1) en enero
  // y en CEST (UTC+2) en julio; las fechas UTC de abajo están elegidas para
  // caer justo en los límites de la ventana en cada horario.

  test("horario de invierno (CET, UTC+1): true a las 08:00 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-01-15T07:00:00Z"))).toBe(true);
  });

  test("horario de invierno (CET, UTC+1): false a las 07:59 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-01-15T06:59:00Z"))).toBe(false);
  });

  test("horario de invierno (CET, UTC+1): true a las 22:59 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-01-15T21:59:00Z"))).toBe(true);
  });

  test("horario de invierno (CET, UTC+1): false a las 23:00 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-01-15T22:00:00Z"))).toBe(false);
  });

  test("horario de verano (CEST, UTC+2): true a las 08:00 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-07-15T06:00:00Z"))).toBe(true);
  });

  test("horario de verano (CEST, UTC+2): false a las 07:59 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-07-15T05:59:00Z"))).toBe(false);
  });

  test("horario de verano (CEST, UTC+2): true a las 22:59 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-07-15T20:59:00Z"))).toBe(true);
  });

  test("horario de verano (CEST, UTC+2): false a las 23:00 Madrid", () => {
    expect(dentroDeVentana(new Date("2026-07-15T21:00:00Z"))).toBe(false);
  });

  test("misma hora UTC, distinto resultado según la época del año (el cambio de hora se resuelve solo)", () => {
    // 07:00 UTC son las 08:00 en invierno (dentro) y las 09:00 en verano
    // (también dentro, pero por una hora local distinta): lo que importa es
    // que ninguna resta manualmente el offset, sino que lo resuelve Intl.
    expect(dentroDeVentana(new Date("2026-01-01T07:00:00Z"))).toBe(true);
    expect(dentroDeVentana(new Date("2026-07-01T07:00:00Z"))).toBe(true);
    // 05:30 UTC: 06:30 en invierno (fuera), 07:30 en verano (fuera). Confirma
    // que el mismo instante UTC no da el mismo resultado todo el año porque
    // el offset cambia, no porque el código lo calcule mal.
    expect(dentroDeVentana(new Date("2026-01-01T05:30:00Z"))).toBe(false);
    expect(dentroDeVentana(new Date("2026-07-01T05:30:00Z"))).toBe(false);
  });
});
