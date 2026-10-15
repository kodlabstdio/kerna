import type {
  ComponentRegistration,
  ComponentRegistry,
  DesignSystem,
  DesignTokens,
  TokenReference,
} from "./schema.ts";

export function createComponentRegistry(registrations: ComponentRegistration[]): ComponentRegistry {
  const entries = registrations.map(({ name, ...definition }) => {
    if (!name.trim()) throw new Error("A Component needs a name.");
    if (
      !definition.variants.length ||
      new Set(definition.variants).size !== definition.variants.length ||
      definition.variants.some((variant) => !variant.trim())
    ) {
      throw new Error(`${name} needs unique, non-empty Variants.`);
    }
    for (const field of [...Object.keys(definition.fields), ...Object.keys(definition.slots)]) {
      if (!field.trim() || field === "id" || field === "variant") {
        throw new Error(`${name} cannot declare the reserved field ${field}.`);
      }
    }
    for (const [slot, rules] of Object.entries(definition.slots)) {
      if (Object.hasOwn(definition.fields, slot))
        throw new Error(`${name}.${slot} is both a field and a Slot.`);
      if (
        !Number.isInteger(rules.min) ||
        !Number.isInteger(rules.max) ||
        rules.min < 0 ||
        rules.max < rules.min
      ) {
        throw new Error(`${name}.${slot} needs integer counts with 0 ≤ min ≤ max.`);
      }
    }
    return [name, structuredClone(definition)] as const;
  });
  const names = new Set<string>();
  for (const [name] of entries) {
    if (names.has(name)) throw new Error(`Component ${name} is already registered.`);
    names.add(name);
  }
  return Object.fromEntries(entries);
}

export function createDesignSystem(
  registry: ComponentRegistry,
  tokens: DesignTokens,
  enabled: Record<string, string[]> = Object.fromEntries(
    Object.entries(registry).map(([name, component]) => [name, component.variants]),
  ),
): DesignSystem {
  const system = structuredClone({ tokens, components: enabled });
  getEnabledComponents(registry, system);
  return system;
}

export function getEnabledComponents(
  registry: ComponentRegistry,
  system: DesignSystem,
): ComponentRegistry {
  return Object.fromEntries(
    Object.entries(system.components).map(([name, variants]) => {
      if (!Object.hasOwn(registry, name)) throw new Error(`Unknown Component ${name}.`);
      const component = registry[name]!;
      if (!variants.length || variants.some((variant) => !component.variants.includes(variant))) {
        throw new Error(`${name} must enable at least one registered Variant.`);
      }
      return [name, { ...structuredClone(component), variants: [...variants] }];
    }),
  );
}

export function resolveToken(tokens: DesignTokens, reference: TokenReference): string {
  if (!Object.hasOwn(tokens, reference.token))
    throw new Error(`Unknown Design Token ${reference.token}.`);
  return tokens[reference.token]!.value;
}
