import { expect, test } from "vite-plus/test";
import { tokenDeclarations, tokenVariable } from "../src/tokens.ts";

test("token names produce distinct CSS identifiers", () => {
  expect(tokenVariable("ink")).toBe("--kerna-ink");
  expect(new Set(["colors.ink", "colors-ink", "colors_2e_ink", "☀"].map(tokenVariable)).size).toBe(
    4,
  );
  expect(tokenVariable("colors.ink")).toBe("--kerna-colors_2e_ink");
});

test("CSS declarations preserve colors, font stacks and spacing", () => {
  expect(
    tokenDeclarations({
      ink: { type: "color", value: "oklch(25% 0.02 220)" },
      body: { type: "typography", value: "'Source Sans 3', sans-serif" },
      space: { type: "spacing", value: "clamp(1rem, 4vw, 4rem)" },
    }),
  ).toBe(
    "--kerna-ink:oklch(25% 0.02 220);--kerna-body:'Source Sans 3', sans-serif;--kerna-space:clamp(1rem, 4vw, 4rem)",
  );
});

test.each([
  "red; color: blue",
  "}</style><script>alert(1)</script>",
  "red\\3b color:blue",
  "red\ncolor:blue",
  "red/*comment*/",
])("unsafe CSS value is refused: %s", (value) => {
  expect(() => tokenDeclarations({ ink: { type: "color", value } })).toThrow("Unsafe CSS value");
});
