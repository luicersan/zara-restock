import { describe, expect, test } from "vitest";
import { normalize, parseUrl } from "../src/bershka.js";

// Las URLs reales que se dieron de alta en la app.
const ARTICULOS = [
  { url: "https://www.bershka.com/es/c0p209096041.html?colorId=812", productId: "209096041", variantId: "812" },
  { url: "https://www.bershka.com/es/c0p209096041.html?colorId=462", productId: "209096041", variantId: "462" },
  { url: "https://www.bershka.com/es/c0p209099762.html?colorId=462", productId: "209099762", variantId: "462" },
  { url: "https://www.bershka.com/es/c0p209099762.html?colorId=800", productId: "209099762", variantId: "800" },
  { url: "https://www.bershka.com/es/c0p209099762.html?colorId=829", productId: "209099762", variantId: "829" },
];

describe("parseUrl", () => {
  for (const { url, productId, variantId } of ARTICULOS) {
    test(`extrae product_id y colorId de ${url}`, () => {
      const result = parseUrl(url);
      expect(result.productId).toBe(productId);
      expect(result.variantId).toBe(variantId);
    });
  }

  test("recorta espacios sueltos alrededor de la URL", () => {
    const result = parseUrl(" https://www.bershka.com/es/c0p209099762.html?colorId=800 ");
    expect(result.productId).toBe("209099762");
    expect(result.variantId).toBe("800");
  });

  test("acepta una URL con slug delante de c0p (cosmético, igual que Zara)", () => {
    const result = parseUrl("https://www.bershka.com/es/pantalon-felpa-c0p209096041.html?colorId=812");
    expect(result.productId).toBe("209096041");
  });

  test("descarta los parámetros utm_* al limpiar la URL", () => {
    const result = parseUrl(
      "https://www.bershka.com/es/c0p209096041.html?colorId=812&utm_campaign=foo&utm_source=bar"
    );
    expect(result.cleanUrl).toBe("https://www.bershka.com/es/c0p209096041.html?colorId=812");
  });

  test("acepta una URL sin colorId, avisando de que se vigila el color por defecto", () => {
    const result = parseUrl("https://www.bershka.com/es/c0p209096041.html");
    expect(result.productId).toBe("209096041");
    expect(result.variantId).toBeNull();
  });

  test("rechaza una URL sin identificador de producto", () => {
    expect(() => parseUrl("https://www.bershka.com/es/pantalon-felpa.html")).toThrow();
  });
});

describe("normalize", () => {
  test("recorta espacios y pasa a mayúsculas, igual que en src/zara.js", () => {
    expect(normalize("s")).toBe("S");
    expect(normalize("37 ")).toBe("37");
  });
});
