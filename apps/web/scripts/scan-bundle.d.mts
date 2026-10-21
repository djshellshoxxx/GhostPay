export const ALLOWED_URLS: readonly { readonly prefix: string; readonly reason: string }[];
export function scanBundle(distDir: string, srcDir?: string, viteConfigPath?: string): string[];
