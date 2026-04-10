import { describe, expect, it } from "vitest";
import { pickCategoryFromRules } from "../src/lib/categoryRuleMatch.js";

describe("pickCategoryFromRules", () => {
  it("elige la categoría del patrón más largo que coincida", () => {
    const rules = [
      { pattern: "uber", category: "transporte" },
      { pattern: "uber eats", category: "comida" },
    ];
    expect(pickCategoryFromRules(rules, "pedido uber eats", null)).toBe("comida");
  });

  it("devuelve null si no hay coincidencia", () => {
    expect(pickCategoryFromRules([{ pattern: "foo", category: "bar" }], "nada", null)).toBeNull();
  });
});
