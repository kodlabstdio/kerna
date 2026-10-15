# @kodlab/kerna-components

Kerna’s built-in Astro Components and registration metadata. The current tracer bullet includes Hero (centered and left Variants) and the Page renderer.

Import `Page` from `@kodlab/kerna-components` to validate and render a stored Page. Import `components` from `@kodlab/kerna-components/registry` for the framework-independent registration metadata; this compiled entry also works in the host’s Astro config. `tokenVariable(name)` exposes the CSS custom property name for a Design Token.

See [the plugin install instructions](../plugin/README.md) for the shared Design System and host route.

From the repository root, run `vp run @kodlab/kerna-components#test`, `vp run @kodlab/kerna-components#typecheck` or `vp run @kodlab/kerna-components#build`.
