/**
 * Injected Intl surface. Pass a fake in tests; defaults to the platform `Intl`.
 * @security Pure; no network. Locale data comes from the host runtime only.
 */
export interface IntlLike {
  readonly NumberFormat: typeof Intl.NumberFormat;
  readonly DateTimeFormat: typeof Intl.DateTimeFormat;
  readonly PluralRules: typeof Intl.PluralRules;
}

/** The platform Intl as an {@link IntlLike}. */
export const defaultIntl: IntlLike = {
  NumberFormat: Intl.NumberFormat,
  DateTimeFormat: Intl.DateTimeFormat,
  PluralRules: Intl.PluralRules,
};
