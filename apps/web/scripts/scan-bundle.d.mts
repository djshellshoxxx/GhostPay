export const ALLOWED_URLS: readonly { readonly prefix: string; readonly reason: string }[];
export function scanBundle(distDir: string, srcDir?: string, viteConfigPath?: string, options?: {
  readonly ownOrigin?: string | undefined;
  readonly connectOrigins?: readonly string[] | undefined;
  readonly requireTight?: boolean | undefined;
}): string[];
export function stripComments(src: string): string;
