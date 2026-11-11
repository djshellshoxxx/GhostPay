import { exportSettingsExchange as sharedExportSettingsExchange, parseSettingsExchange as sharedParseSettingsExchange,
  SettingsExchangeError, validateSharedSettings, type SharedSettings } from '@ghostpay/qr-exchange';
import { UserFacingError } from './errors';
import type { Settings } from './settings';

export type { SharedSettings } from '@ghostpay/qr-exchange';

function localized<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof SettingsExchangeError) throw new UserFacingError({ key: error.code === 'SETTINGS_DELAY_RANGE'
      ? 'error.settings.delayRangeMustBeWholeSecondsMinimumAtMostMaximum' : 'error.settingsExchange.invalid' });
    throw error;
  }
}
export function exportSettingsExchange(s: Settings): string {
  return localized(() => sharedExportSettingsExchange(s));
}
export function parseSettingsExchange(text: string): SharedSettings {
  return localized(() => sharedParseSettingsExchange(text));
}
/** Call only after an explicit apply action. Keeps current local endpoints and pinned signer trust. */
export function applySettingsExchange(current: Settings, preview: SharedSettings): Settings {
  return { ...current, ...localized(() => validateSharedSettings(preview)) };
}

// i18n-use: error.settingsExchange.invalid error.settings.delayRangeMustBeWholeSecondsMinimumAtMostMaximum
