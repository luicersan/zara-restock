import { describe, expect, test } from "vitest";
import { normalize, parseUrl } from "../src/zara.js";

// Las 5 URLs reales de seed.sql. Ninguna carece de v1, así que se añade una
// sexta sintética para cubrir ese caso (SPEC.md §5).
const SEED_URLS = [
  {
    url: "https://www.zara.com/es/es/top-halter-punto-stretch-p05584397.html?v1=517756025",
    productId: "05584397",
    variantId: "517756025",
  },
  {
    url: "https://www.zara.com/es/es/mule-pespuntes-tacon-p12306710.html?v1=495698459",
    productId: "12306710",
    variantId: "495698459",
  },
  {
    url: "https://www.zara.com/es/es/falda-pantalon-p03152400.html?v1=502289178",
    productId: "03152400",
    variantId: "502289178",
  },
  {
    url: "https://www.zara.com/es/es/bota-kitten-serraje-p13009610.html?v1=495716764",
    productId: "13009610",
    variantId: "495716764",
  },
  {
    url: "https://www.zara.com/es/es/vestido-mini-halter-brillos-p05063313.html?v1=527349681",
    productId: "05063313",
    variantId: "527349681",
  },
  {
    url: "https://www.zara.com/es/es/top-halter-punto-stretch-p05584397.html",
    productId: "05584397",
    variantId: null,
  },
];

describe("parseUrl", () => {
  for (const { url, productId, variantId } of SEED_URLS) {
    test(`extrae product_id y variant_id de ${url}`, () => {
      const result = parseUrl(url);
      expect(result.productId).toBe(productId);
      expect(result.variantId).toBe(variantId);
    });
  }

  test("descarta los parámetros utm_* al limpiar la URL", () => {
    const result = parseUrl(
      "https://www.zara.com/es/es/top-halter-punto-stretch-p05584397.html?v1=517756025&utm_campaign=foo&utm_source=bar"
    );
    expect(result.cleanUrl).toBe(
      "https://www.zara.com/es/es/top-halter-punto-stretch-p05584397.html?v1=517756025"
    );
  });

  test("rechaza una URL sin identificador de producto", () => {
    expect(() => parseUrl("https://www.zara.com/es/es/top-halter-punto-stretch.html")).toThrow();
  });
});

describe("normalize", () => {
  test("recorta espacios y pasa a mayúsculas", () => {
    expect(normalize("s")).toBe("S");
    expect(normalize("37 ")).toBe("37");
  });

  test("permite comparar tallas normalizadas", () => {
    expect(normalize("s")).toBe(normalize("S"));
    expect(normalize("37 ")).toBe(normalize("37"));
    expect(normalize("EU 39")).toBe(normalize("EU39"));
    expect(normalize("38")).not.toBe(normalize("37"));
  });
});
