import { describe, expect, test } from "vitest";
import { decidirNotificacion, evaluateSize } from "../src/check.js";

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
