import { createDesignSystem } from "@kodlab/kerna-core";
import { components } from "@kodlab/kerna-components/registry";

// Shared by the native plugin's validation and the public renderer.
export const designSystem = createDesignSystem(components, {
  ink: { type: "color", value: "#162524" },
  paper: { type: "color", value: "#f4f6f0" },
  body: { type: "typography", value: "Georgia, serif" },
  section: { type: "spacing", value: "clamp(1.5rem, 6vw, 5rem)" },
});
