import { expect, test } from "vite-plus/test";
import {
  createComponentRegistry,
  createDesignSystem,
  getEnabledComponents,
  resolveToken,
  validatePage,
  type ComponentRegistration,
  type DesignTokens,
} from "../src/index.ts";

const hero: ComponentRegistration = {
  name: "Hero",
  label: "Hero",
  variants: ["centered", "split"],
  fields: { title: { type: "text", required: true } },
  slots: {},
};
const tokens: DesignTokens = {
  foreground: { type: "color", value: "#111111" },
  body: { type: "typography", value: "system-ui, sans-serif" },
  gap: { type: "spacing", value: "16px" },
  corner: { type: "radius", value: "8px" },
  raised: { type: "shadow", value: "0 2px 4px #00000020" },
};
const page = {
  formatVersion: 1,
  root: { props: {} },
  content: [{ type: "Hero", props: { id: "hero", variant: "centered", title: "Hello" } }],
};

test("registration produces serializable descriptors for fields, Variants and Slots", () => {
  const components = createComponentRegistry([hero]);
  expect(components.Hero).toEqual({
    label: hero.label,
    variants: hero.variants,
    fields: hero.fields,
    slots: hero.slots,
  });
  expect(JSON.parse(JSON.stringify(components))).toEqual(components);
  components.Hero!.variants.push("new");
  expect(hero.variants).toEqual(["centered", "split"]);
});

test("duplicate registration never silently replaces a Component", () => {
  expect(() => createComponentRegistry([hero, hero])).toThrow("Hero");
});

test.each([
  { ...hero, variants: [] },
  { ...hero, variants: ["centered", "centered"] },
  { ...hero, fields: { id: { type: "text" as const } } },
  { ...hero, slots: { variant: { accepts: ["Hero"], min: 0, max: 1 } } },
  {
    ...hero,
    fields: { content: { type: "text" as const } },
    slots: { content: { accepts: ["Hero"], min: 0, max: 1 } },
  },
  { ...hero, slots: { actions: { accepts: ["Hero"], min: -1, max: 1 } } },
  { ...hero, slots: { actions: { accepts: ["Hero"], min: 2, max: 1 } } },
  { ...hero, slots: { actions: { accepts: ["Hero"], min: 0, max: 1.5 } } },
])("rejects unusable Component declarations: %j", (definition) => {
  expect(() => createComponentRegistry([definition])).toThrow();
});

test("a new Design System enables registered Components and Variants by default", () => {
  const registry = createComponentRegistry([hero]);
  const system = createDesignSystem(registry, tokens);
  expect(system.components).toEqual({ Hero: ["centered", "split"] });
  expect(validatePage(page, getEnabledComponents(registry, system), system.tokens)).toEqual([]);
  expect(system.tokens).toEqual(tokens);
  system.tokens.gap!.value = "24px";
  expect(tokens.gap!.value).toBe("16px");
});

test("disabled Components fail Page validation", () => {
  const registry = createComponentRegistry([hero]);
  const system = createDesignSystem(registry, tokens, {});
  expect(validatePage(page, getEnabledComponents(registry, system), system.tokens)).toContainEqual(
    expect.objectContaining({ code: "component", allowed: [] }),
  );
});

test("disabled Variants fail with only enabled alternatives", () => {
  const registry = createComponentRegistry([hero]);
  const system = createDesignSystem(registry, tokens, { Hero: ["split"] });
  expect(validatePage(page, getEnabledComponents(registry, system), system.tokens)).toContainEqual(
    expect.objectContaining({ code: "variant", allowed: ["split"] }),
  );
  expect(registry.Hero!.variants).toEqual(["centered", "split"]);
});

test.each<Record<string, string[]>>([{ Missing: ["split"] }, { Hero: ["missing"] }, { Hero: [] }])(
  "rejects unknown or empty enabled selections: %j",
  (enabled) => {
    expect(() => createDesignSystem(createComponentRegistry([hero]), tokens, enabled)).toThrow();
  },
);

test("every token category resolves without a framework", () => {
  for (const [name, token] of Object.entries(tokens)) {
    expect(resolveToken(tokens, { token: name })).toBe(token.value);
  }
  expect(() => resolveToken(tokens, { token: "missing" })).toThrow("missing");
  expect(() => resolveToken(tokens, { token: "toString" })).toThrow("toString");
});
