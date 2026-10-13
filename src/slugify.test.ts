import { describe, expect, it } from "vitest";
import { slugify } from "./slugify.js";
import { slugify as slugifyFromIndex } from "./index.js";

const cases: [string, string][] = [
  // acceptance criteria
  ["Hello World", "hello-world"],
  ["  Hello,   World!!  --  Again ", "hello-world-again"],
  ["Crème Brûlée à la Mode", "creme-brulee-a-la-mode"],
  ["!!!", ""],
  // edge cases
  ["", ""],
  ["already-a-slug", "already-a-slug"],
  ["Top 10 Tips", "top-10-tips"],
  ["snake_case_name", "snake-case-name"],
  ["--leading and trailing--", "leading-and-trailing"],
  // "İ" lowercases to "i" + U+0307 (combining dot above); the mark must be stripped.
  // Not an operation-order check: NFKD-then-lowercase yields the same "istanbul".
  ["İstanbul", "istanbul"],
  ["ﬁle １", "file-1"],
  ["日本語", ""],
];

// Messy inputs used only by the property checks below, alongside every table input.
const extraPropertyInputs = ["  Crème Brûlée à la Mode!! ", "A — b … C\t\nD/E?f=1&g"];
const propertyInputs = [...cases.map(([input]) => input), ...extraPropertyInputs];

describe("slugify", () => {
  it.each(cases)("slugify(%j) -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it.each(propertyInputs)("is idempotent for %j", (input) => {
    const once = slugify(input);
    expect(slugify(once)).toBe(once);
  });

  it.each(propertyInputs.filter((input) => slugify(input) !== ""))(
    "only emits [a-z0-9] runs joined by single hyphens for %j",
    (input) => {
      expect(slugify(input)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    },
  );

  it("is re-exported from the package entry point", () => {
    expect(slugifyFromIndex).toBe(slugify);
  });
});
