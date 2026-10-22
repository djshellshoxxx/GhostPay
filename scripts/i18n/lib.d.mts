export const ROOT: string;
export const LOCALES_DIR: string;
export const SRC_DIR: string;
export const MACHINE_DRAFTED_STATUS: string;
export const MAX_RATIO_LONG: number;
export const MAX_RATIO_SHORT: number;
export const MIN_RATIO: number;
export function pseudolocalize(src: string, variant: 'XA' | 'XB'): string;
export interface CatalogFile {
  file: string;
  code: string;
  data: unknown;
  parseError: string | undefined;
}
export function readCatalogs(dir?: string): CatalogFile[];
export interface CheckResult {
  errors: string[];
  warnings: string[];
}
export function checkCatalogs(catalogs: readonly CatalogFile[], options?: { reviewed?: ReadonlySet<string> }): CheckResult;
export function scanUsage(srcDir?: string): Map<string, string[]>;
export function extractReport(usage: Map<string, string[]>, sourceKeys: Iterable<string>): { missing: string[]; unused: string[]; used: string[] };
export function buildPseudoCatalogs(enData: { messages: Record<string, string> }): Record<string, { _meta: Record<string, string>; messages: Record<string, string> }>;
export function localesExist(dir?: string): boolean;
