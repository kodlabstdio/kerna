// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Kerna",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/kodlabstdio/kerna" }],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Create your first Proposal", slug: "guides/first-proposal" },
            { label: "Save Proposal decisions safely", slug: "guides/persist-proposal-decisions" },
            { label: "Trusted Astro rendering", slug: "guides/trusted-astro-rendering" },
            {
              label: "Register Astro Components and Slots",
              slug: "guides/registered-astro-components",
            },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Proposal API", slug: "reference/proposals" },
            { label: "Operations", slug: "reference/operations" },
            { label: "Resolve Proposal errors", slug: "reference/proposal-errors" },
          ],
        },
      ],
    }),
  ],
});
