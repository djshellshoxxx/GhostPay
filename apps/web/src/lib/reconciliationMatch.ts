import { createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { UserFacingError } from './errors';
export type { RegisteredInvoice, MatchProposal } from '@ghostpay/ux-vault/portable';
export const { MAX_REGISTERED_INVOICES, MATCH_CLOCK_SKEW_MS, validateRegisteredInvoice, registrationFromInvoice, proposeInvoiceMatch } = createReconciliationApi({ Error: UserFacingError });

// i18n-use: error.reconciliationMatch.invalidRegisteredInvoice error.reconciliationMatch.invalidRegisteredInvoiceDigest error.reconciliationMatch.invalidRegisteredInvoiceNonce error.reconciliationMatch.invalidRegisteredInvoiceChain error.reconciliationMatch.invalidRegisteredInvoiceAsset error.reconciliationMatch.invalidRegisteredInvoiceAmount error.reconciliationMatch.invalidRegisteredInvoiceTimeWindow error.reconciliationMatch.invalidRegisteredInvoiceTimestamp error.reconciliationMatch.onlyInvoicesWithAFixedTokenAmountCanBeRegistered
