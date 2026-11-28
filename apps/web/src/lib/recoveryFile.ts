import { UserFacingError } from './errors';
import { MAX_KEYSTORE_BYTES, validateKeystoreEnvelope } from './keystore';
import { detectStealthExportFormat, inspectMasterBackup, inspectPaymentKeys, parsePublicRecord, STEALTH_EXPORT_LIMITS, type StealthExportFormat } from './stealthExport';

export interface RecoveryFile {
  readonly kind: 'keystore' | StealthExportFormat;
  /** Exact public record or encrypted envelope inspected at selection time. */
  readonly text: string;
}

/** Inspect only the public envelope. The selected importer's authenticated open still runs on explicit submission. */
export async function recognizeRecoveryFile(file: File, signal?: AbortSignal): Promise<RecoveryFile> {
  if (file.size > Math.max(MAX_KEYSTORE_BYTES, STEALTH_EXPORT_LIMITS.keypairFileBytes)) {
    throw new UserFacingError({ key: 'error.stealthExport.tooLarge' });
  }
  const text = await file.text();
  signal?.throwIfAborted();
  const kind = detectStealthExportFormat(text);
  if (kind !== undefined) {
    // File.text() may strip a BOM. A portable export must be ASCII and byte-exact.
    if (file.size !== text.length) throw new UserFacingError({ key: 'error.stealthExport.invalidFile' });
    if (kind === 'public') parsePublicRecord(text);
    else if (kind === 'keypair') inspectPaymentKeys(text);
    else inspectMasterBackup(text);
    return { kind, text };
  }
  if (file.size <= MAX_KEYSTORE_BYTES) {
    try {
      validateKeystoreEnvelope(text);
      return { kind: 'keystore', text };
    } catch { /* No accepted envelope. Do not request a passphrase. */ }
  }
  throw new UserFacingError({ key: 'recoveryFile.unrecognized' });
}
