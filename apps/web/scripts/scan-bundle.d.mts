export const ALLOWED_URLS: readonly { readonly prefix: string; readonly reason: string }[];
export function scanBundle(distDir: string, srcDir?: string, viteConfigPath?: string, options?: { readonly ownOrigin?: string | undefined }): string[];
export function scanSourceSinks(text: string, fileName: string): string[];
