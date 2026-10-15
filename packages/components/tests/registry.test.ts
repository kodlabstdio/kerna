import { expect, test } from "vite-plus/test";
import {
  createComponentRegistry,
  createDesignSystem,
  getEnabledComponents,
  validatePage,
} from "@kodlab/kerna-core";
import { components, hero } from "../src/registry.ts";

test("the built-in Hero uses the public registration contract", () => {
  expect(components).toEqual(createComponentRegistry([hero]));
  const system = createDesignSystem(components, {
    ink: { type: "color", value: "#111111" },
    space: { type: "spacing", value: "2rem" },
  });
  expect(
    validatePage(
      {
        formatVersion: 1,
        root: { props: {} },
        content: [
          {
            type: "Hero",
            props: {
              id: "hero",
              variant: "centered",
              title: "Welcome",
              foreground: { token: "ink" },
              spacing: { token: "space" },
            },
          },
        ],
      },
      getEnabledComponents(components, system),
      system.tokens,
    ),
  ).toEqual([]);
});
