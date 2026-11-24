/** Build provenance captured by stamp-build.mjs after TypeScript compilation. */
export interface BuildInfo {
  readonly sourceRevision: string | null;
  readonly dirty: boolean | null;
}

/** Source execution and unstamped builds explicitly report unknown provenance. */
export const BUILD_INFO: BuildInfo = Object.freeze({ sourceRevision: null, dirty: null });
