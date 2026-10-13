import { describe, expect, it } from "vitest";
import { clamp } from "./math.js";

describe("clamp", () => {
  it("keeps values inside the range and clamps values outside it", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});
