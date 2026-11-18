export const LEAN_EXCLUDED_MODULES: readonly { readonly re: RegExp; readonly reason: string; readonly sample: string }[];
export function leanModuleProblem(m: { readonly id?: unknown; readonly renderedLength?: unknown; readonly renderedExports?: unknown }): string | undefined;
