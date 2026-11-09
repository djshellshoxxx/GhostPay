import { createKeystoreApi } from '@ghostpay/ux-vault/portable';
import { UserFacingError, displayMessage } from './errors';
export type { KeystoreFile, KeystoreSecrets, KeystoreOptions, PassphraseStrength } from '@ghostpay/ux-vault/portable';
/** The GUI keeps the same localized diagnostics over the shared, framework-independent codec. */
export const { DEFAULT_SCRYPT, MAX_KEYSTORE_BYTES, passphraseStrength, passphraseProblemMessage, passphraseProblem, PASSPHRASE_WORDS, GENERATED_PASSPHRASE_WORDS, GENERATED_PASSPHRASE_BITS, generatePassphrase, encryptKeystore, validateKeystoreEnvelope, decryptKeystore } = createKeystoreApi(UserFacingError, displayMessage);

// i18n-use: error.keystore.invalidFile error.keystore.invalidScryptCost error.keystore.passphraseShort error.keystore.passphraseWeak error.keystore.theKeystoreMetadataDoesNotMatchItsIndependentSellerKeys error.keystore.thisBrowserHasNoWebCryptoSupport error.keystore.wrongPassphraseOrTheKeystoreWasModified
