import type { Plugin } from 'vite';

export type BuildProfile = 'full' | 'lean';

export const PROFILE_ENV: 'GHOSTPAY_LOCAL_BUILD_PROFILE';
export const REPORT_ENV: 'GHOSTPAY_LOCAL_MODULE_REPORT';
export const EMBED_SDK_FILES: readonly string[];

export interface ChunkModuleEntry {
  readonly id: string;
  readonly renderedLength: number;
  readonly renderedExports?: readonly string[];
}
export interface ChunkModules {
  readonly fileName: string;
  readonly modules: readonly ChunkModuleEntry[];
}

export interface LocalBuildProfileOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly leanAppPath: string;
  readonly publicDir: string;
  readonly worker?: boolean;
  readonly workerEvidence?: { chunks: ChunkModules[] }[];
}

export function parseProfile(value: string | undefined): BuildProfile;
export function selectAppEntry(
  profile: BuildProfile,
  source: string,
  importer: string | undefined,
  leanPath: string,
): string | undefined;
export function copyPublicFiltered(
  srcRoot: string,
  outRoot: string,
  skipTopLevel: readonly string[],
  rejectExecutable?: boolean,
): string[];
export function collectChunkModules(bundle: Readonly<Record<string, unknown>>): ChunkModules[];
export function writeReportExclusive(path: string, report: unknown): void;
export function localBuildProfilePlugins(opts: LocalBuildProfileOptions): Plugin[];
