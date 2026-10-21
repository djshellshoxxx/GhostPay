export const BROAD: string;
export function parseOrigins(text: string | undefined): string[];
export function connectSrc(origins: readonly string[]): string;
export function applyConnectSrc(text: string, origins: readonly string[]): string;
