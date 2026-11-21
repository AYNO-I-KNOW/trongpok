import { describe, expect, it } from "vitest";
import blender from "../../data/categories/blender.json";
import smartwatch from "../../data/categories/smartwatch.json";
import product from "../../data/products/_example.json";
import { CategoryPackSchema, ProductSchema } from "./types";

describe("demo data schemas", () => {
  it("parses the example product without losing fields", () => {
    expect(ProductSchema.parse(product)).toEqual(product);
  });

  it.each([blender, smartwatch])("parses the $id category pack without losing fields", (pack) => {
    expect(CategoryPackSchema.parse(pack)).toEqual(pack);
  });
});
