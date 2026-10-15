import { createComponentRegistry, type ComponentRegistration } from "@kodlab/kerna-core";

export const hero: ComponentRegistration = {
  name: "Hero",
  label: "Hero",
  variants: ["centered", "left"],
  fields: {
    title: { type: "text", required: true },
    description: { type: "text" },
    foreground: { type: "token", tokenType: "color" },
    background: { type: "token", tokenType: "color" },
    typography: { type: "token", tokenType: "typography" },
    spacing: { type: "token", tokenType: "spacing" },
  },
  slots: {},
};

export const components = createComponentRegistry([hero]);
