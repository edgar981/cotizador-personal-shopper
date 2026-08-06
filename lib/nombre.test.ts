import { describe, expect, it } from "vitest";
import { componerNombre } from "@/components/nueva-cotizacion";

describe("componerNombre", () => {
  it("no repite la marca si el nombre ya la trae", () => {
    expect(componerNombre("Nike", "Nike Promina")).toBe("Nike Promina");
    expect(componerNombre("nike", "Nike Promina")).toBe("Nike Promina");
  });

  it("antepone la marca cuando falta", () => {
    expect(componerNombre("adidas", "Samba OG Shoes")).toBe("adidas Samba OG Shoes");
  });

  it("aguanta campos vacíos", () => {
    expect(componerNombre(null, "Samba OG")).toBe("Samba OG");
    expect(componerNombre("Nike", null)).toBe("Nike");
    expect(componerNombre(null, null)).toBe("");
  });
});
