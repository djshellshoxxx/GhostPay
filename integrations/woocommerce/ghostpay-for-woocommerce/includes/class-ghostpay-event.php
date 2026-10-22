<?php
/**
 * Strict webhook event parser (mirror of parseWebhookEvent in @ghostpay/merchant-hooks).
 *
 * @package GhostPay_For_WooCommerce
 */

defined( 'ABSPATH' ) || defined( 'GHOSTPAY_CLI_TEST' ) || exit;

final class GhostPay_Event {

	const TYPES = array( 'invoice.paid', 'invoice.partial', 'invoice.over', 'invoice.expired' );

	/** @return string[] Stable delivery identities independent of the transport signature nonce. */
	public static function identity_keys( array $event ): array {
		$keys = array( 'event:' . $event['data']['invoiceId'] . ':' . $event['id'] );
		if ( isset( $event['data']['paymentId'] ) ) {
			$keys[] = 'payment:' . $event['data']['invoiceId'] . ':' . $event['type'] . ':' . $event['data']['paymentId'];
		}
		return $keys;
	}

	/**
	 * Parse and validate a signature-verified body. Unknown keys are rejected.
	 *
	 * @param string $json Raw body.
	 * @return array|null Normalised event or null.
	 */
	public static function parse( string $json ): ?array {
		$raw = json_decode( $json, true, 8 );
		if ( ! is_array( $raw ) || array() === $raw || array_is_list( $raw ) ) {
			return null;
		}
		if ( array_diff( array_keys( $raw ), array( 'id', 'type', 'createdAt', 'data' ) ) || ! isset( $raw['id'], $raw['type'], $raw['createdAt'], $raw['data'] ) ) {
			return null;
		}
		$d = $raw['data'];
		if ( ! is_array( $d ) || array_is_list( $d ) || array_diff( array_keys( $d ), array( 'invoiceId', 'currency', 'amountMinor', 'paymentId' ) ) ) {
			return null;
		}
		if ( ! isset( $d['invoiceId'], $d['currency'], $d['amountMinor'] ) ) {
			return null;
		}
		$id_re = '/\A[A-Za-z0-9_.:-]{1,128}\z/';
		$ok    = is_string( $raw['id'] ) && preg_match( $id_re, $raw['id'] )
			&& is_string( $raw['type'] ) && in_array( $raw['type'], self::TYPES, true )
			&& is_int( $raw['createdAt'] ) && $raw['createdAt'] >= 0
			&& is_string( $d['invoiceId'] ) && preg_match( $id_re, $d['invoiceId'] )
			&& is_string( $d['currency'] ) && preg_match( '/\A[A-Z]{3}\z/', $d['currency'] )
			&& is_string( $d['amountMinor'] ) && preg_match( '/\A(?:0|[1-9][0-9]{0,29})\z/', $d['amountMinor'] )
			&& ( ! isset( $d['paymentId'] ) || ( is_string( $d['paymentId'] ) && preg_match( $id_re, $d['paymentId'] ) ) );
		return $ok ? $raw : null;
	}
}
