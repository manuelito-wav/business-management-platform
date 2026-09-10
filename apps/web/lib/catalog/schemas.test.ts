import { describe, expect, it } from "vitest";
import { categoryFormSchema, pricingFormSchema, productFormSchema } from "./schemas";

describe("productFormSchema", () => {
  const base = { name: "Cola", categoryId: "cat-1", imageUrl: "" };

  it("accepts a unit-mode product without a weightUnit", () => {
    const result = productFormSchema.safeParse({ ...base, saleMode: "unit", weightUnit: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a weighted-mode product without a weightUnit (D-008)", () => {
    const result = productFormSchema.safeParse({ ...base, saleMode: "weighted", weightUnit: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("weightUnit"))).toBe(true);
    }
  });

  it("accepts a weighted-mode product with a weightUnit", () => {
    const result = productFormSchema.safeParse({ ...base, saleMode: "weighted", weightUnit: "kg" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = productFormSchema.safeParse({
      ...base,
      name: "  ",
      saleMode: "unit",
      weightUnit: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid image URL but accepts an empty one", () => {
    expect(
      productFormSchema.safeParse({
        ...base,
        saleMode: "unit",
        weightUnit: "",
        imageUrl: "not a url",
      }).success,
    ).toBe(false);
    expect(
      productFormSchema.safeParse({ ...base, saleMode: "unit", weightUnit: "", imageUrl: "" })
        .success,
    ).toBe(true);
  });
});

describe("categoryFormSchema", () => {
  it("requires a non-blank name", () => {
    expect(categoryFormSchema.safeParse({ name: "" }).success).toBe(false);
    expect(categoryFormSchema.safeParse({ name: "Bebidas" }).success).toBe(true);
  });
});

describe("pricingFormSchema", () => {
  it("requires both costPrice and salePrice to be valid money amounts", () => {
    expect(pricingFormSchema.safeParse({ costPrice: "50.00", salePrice: "100.00" }).success).toBe(
      true,
    );
    expect(pricingFormSchema.safeParse({ costPrice: "-1", salePrice: "100.00" }).success).toBe(
      false,
    );
    expect(pricingFormSchema.safeParse({ costPrice: "", salePrice: "100.00" }).success).toBe(false);
  });
});
