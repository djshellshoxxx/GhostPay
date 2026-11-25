export function validateDeployments(dir: string, releaseKeys?: readonly string[]): Promise<string[]>;
export const PUBLIC_TEST_RELEASE_KEYS: readonly string[];
export function isReleaseBuildEnv(env: Readonly<Record<string, string | undefined>>): boolean;
export function parseReleaseKeys(
  text: string | undefined,
  options?: { readonly production?: boolean; readonly env?: Readonly<Record<string, string | undefined>> },
): string[];
