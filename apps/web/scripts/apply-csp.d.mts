export function applyCspToDist(distDir: string, origins: readonly string[]): string[];
export function checkCspDist(distDir: string, origins: readonly string[], options?: { requireTight?: boolean; metaOnly?: boolean }): string[];
export function readMetaPolicies(text: string): readonly {
  readonly policy: string;
  readonly beforeResources: boolean;
  readonly content: { readonly start: number; readonly end: number } | undefined;
}[];
