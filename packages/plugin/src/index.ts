import { ContentSaveRejectedError, definePlugin, type PluginDescriptor } from "emdash";
import { components } from "@kodlab/kerna-components/registry";
import {
  createDesignSystem,
  getEnabledComponents,
  readPage,
  type ComponentRegistry,
  type DesignSystem,
} from "@kodlab/kerna-core";

export interface KernaOptions {
  components?: ComponentRegistry;
  designSystem?: DesignSystem;
}

const id = "kerna";
const version = "0.0.0";
const adminEntry = "@kodlab/kerna/admin";
const pages = [{ path: "/setup", label: "Kerna", icon: "squares-four" }];

export function kerna(options: KernaOptions = {}): PluginDescriptor<KernaOptions> {
  return {
    id,
    version,
    format: "native",
    entrypoint: "@kodlab/kerna",
    options,
    adminEntry,
    adminPages: pages,
  };
}

export function createPlugin(options: KernaOptions = {}) {
  const registry = options.components ?? components;
  const system = options.designSystem ?? createDesignSystem(registry, {});
  const enabled = getEnabledComponents(registry, system);
  return definePlugin({
    id,
    version,
    capabilities: ["content:write"],
    admin: { entry: adminEntry, pages },
    hooks: {
      "content:beforeSave": {
        errorPolicy: "abort",
        handler: async (event, ctx) => {
          if (event.collection !== "kerna_pages") return;
          const input = Object.hasOwn(event.content, "page")
            ? event.content.page
            : event.id
              ? (await ctx.content?.get(event.collection, event.id))?.data.page
              : undefined;
          const result = readPage(input, enabled, system.tokens);
          if (!result.ok) {
            throw new ContentSaveRejectedError(
              result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
            );
          }
          // Migrations are persisted only when this write submitted Page content.
          if (Object.hasOwn(event.content, "page")) return { ...event.content, page: result.page };
        },
      },
    },
  });
}
