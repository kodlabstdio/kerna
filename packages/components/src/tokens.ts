import type { DesignTokens } from "@kodlab/kerna-core";

/** Encode punctuation (including underscores) without aliasing distinct token names. */
export function tokenVariable(name: string): string {
  return `--kerna-${Array.from(name, (char) =>
    /[a-zA-Z0-9-]/.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}_`,
  ).join("")}`;
}

/** Values are single CSS values, never declarations or raw HTML. */
export function tokenDeclarations(tokens: DesignTokens): string {
  return Object.entries(tokens)
    .map(([name, { value }]) => {
      if (/[;{}<>\\\u0000-\u001f\u007f]/.test(value) || value.includes("/*")) {
        throw new Error(`Unsafe CSS value for token ${name}`);
      }
      return `${tokenVariable(name)}:${value}`;
    })
    .join(";");
}
