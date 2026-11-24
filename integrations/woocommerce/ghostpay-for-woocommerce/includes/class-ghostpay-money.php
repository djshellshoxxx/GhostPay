<?php
/**
 * Money helpers on decimal strings. Never uses floats.
 *
 * @package GhostPay_For_WooCommerce
 */

defined( 'ABSPATH' ) || defined( 'GHOSTPAY_CLI_TEST' ) || exit;

final class GhostPay_Money {

	/** ISO-4217 codes without minor units, exactly as the GhostPay app reads amounts (apps/web fiatDecimals()). */
	const ZERO_DECIMAL_CURRENCIES = array( 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF' );

	/**
	 * Minor-unit exponent of amountMinor for a currency, as the GhostPay app reads it: 0 for ZERO_DECIMAL_CURRENCIES,
	 * 2 for every other code (three-decimal currencies such as KWD included). Never the shop's display decimals.
	 *
	 * @param string $currency ISO-4217 code.
	 * @return int|null Null for a malformed code.
	 */
	public static function currency_decimals( string $currency ): ?int {
		if ( ! preg_match( '/\A[A-Z]{3}\z/', $currency ) ) {
			return null;
		}
		return in_array( $currency, self::ZERO_DECIMAL_CURRENCIES, true ) ? 0 : 2;
	}

	/**
	 * Decimal amount -> amountMinor of $currency ("1500.00" JPY -> "1500", "13" USD -> "1300"). Null for a malformed
	 * code or amount, and when the amount needs more decimals than the currency has ("12.345" KWD): fails closed
	 * only on precision loss.
	 *
	 * @param string $amount   Decimal string.
	 * @param string $currency ISO-4217 code.
	 */
	public static function currency_minor( string $amount, string $currency ): ?string {
		$decimals = self::currency_decimals( $currency );
		return null === $decimals ? null : self::to_minor( $amount, $decimals );
	}

	/**
	 * "12.50" with 2 decimals -> "1250". Returns null for anything that is not a plain non-negative decimal
	 * with at most $decimals fraction digits, or if the result would exceed 30 digits.
	 *
	 * @param string $amount   Decimal string.
	 * @param int    $decimals Currency decimals (0..8).
	 */
	public static function to_minor( string $amount, int $decimals ): ?string {
		if ( $decimals < 0 || $decimals > 8 ) {
			return null;
		}
		if ( ! preg_match( '/\A(0|[1-9][0-9]{0,24})(?:\.([0-9]{1,8}))?\z/', $amount, $m ) ) {
			return null;
		}
		$frac = $m[2] ?? '';
		if ( strlen( $frac ) > $decimals ) {
			if ( '' !== rtrim( substr( $frac, $decimals ), '0' ) ) {
				return null; // would lose precision.
			}
			$frac = substr( $frac, 0, $decimals );
		}
		$digits = ltrim( $m[1] . str_pad( $frac, $decimals, '0' ), '0' );
		return '' === $digits ? '0' : $digits;
	}

	/**
	 * Compare two canonical non-negative integer strings. Returns -1, 0, 1, or null if either is not canonical.
	 *
	 * @param string $a Integer string.
	 * @param string $b Integer string.
	 */
	public static function compare( string $a, string $b ): ?int {
		$re = '/\A(?:0|[1-9][0-9]{0,29})\z/';
		if ( ! preg_match( $re, $a ) || ! preg_match( $re, $b ) ) {
			return null;
		}
		if ( strlen( $a ) !== strlen( $b ) ) {
			return strlen( $a ) < strlen( $b ) ? -1 : 1;
		}
		return strcmp( $a, $b ) <=> 0;
	}
}
