export interface PreparedManifestFixture {
  readonly directory: string;
  readonly publicKey: string;
}

/** Test-only authored deployment copy. No production key or source fixture is modified. */
export function prepareManifestFixture(options?: {
  readonly templateFile?: string;
  readonly tempRoot?: string;
}): PreparedManifestFixture;
