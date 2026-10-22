<?php
/**
 * GhostPay webhook signature (HMAC-SHA256) verification. Pure PHP, no WordPress calls, so it can be tested with the CLI.
 * Format (same as @ghostpay/merchant-hooks): header "t=<unix>,n=<nonce hex 16..64>,v1=<hex HMAC-SHA256(secret, "t.n.body")>".
 *
 * @package GhostPay_For_WooCommerce
 */

defined( 'ABSPATH' ) || defined( 'GHOSTPAY_CLI_TEST' ) || exit;

final class GhostPay_Signature {

	const MIN_SECRET_BYTES   = 32;
	const DEFAULT_TOLERANCE  = 300;

	/**
	 * Strictly parse the header. Returns null on any deviation (order, duplicates, case, length).
	 *
	 * @param string $header Raw header value.
	 * @return array{t:int,n:string,v1:string}|null
	 */
	public static function parse_header( string $header ): ?array {
		if ( strlen( $header ) > 200 ) {
			return null;
		}
		$parts = explode( ',', $header );
		if ( 3 !== count( $parts ) ) {
			return null;
		}
		if ( 0 !== strpos( $parts[0], 't=' ) || 0 !== strpos( $parts[1], 'n=' ) || 0 !== strpos( $parts[2], 'v1=' ) ) {
			return null;
		}
		$t  = substr( $parts[0], 2 );
		$n  = substr( $parts[1], 2 );
		$v1 = substr( $parts[2], 3 );
		if ( ! preg_match( '/\A[0-9]{1,12}\z/', $t ) || ! preg_match( '/\A[0-9a-f]{16,64}\z/', $n ) || ! preg_match( '/\A[0-9a-f]{64}\z/', $v1 ) ) {
			return null;
		}
		return array( 't' => (int) $t, 'n' => $n, 'v1' => $v1 );
	}

	/**
	 * Compute the header value (used by tests and by the invoice-service request).
	 *
	 * @param string $secret Binary secret (>= 32 bytes).
	 * @param string $body   Exact body.
	 * @param int    $now    Unix seconds.
	 * @param string $nonce  16..64 lowercase hex chars.
	 */
	public static function sign( string $secret, string $body, int $now, string $nonce ): string {
		self::assert_secret( $secret );
		if ( ! preg_match( '/\A[0-9a-f]{16,64}\z/', $nonce ) || $now < 0 ) {
			throw new InvalidArgumentException( 'bad nonce or time' );
		}
		return 't=' . $now . ',n=' . $nonce . ',v1=' . hash_hmac( 'sha256', $now . '.' . $nonce . '.' . $body, $secret );
	}

	/**
	 * Verify a request. Order: format, freshness, constant-time MAC, then replay claim (only after a valid MAC).
	 *
	 * @param string   $secret      Binary secret.
	 * @param string   $body        Raw body exactly as received (verify BEFORE json_decode).
	 * @param string   $header      Signature header.
	 * @param int      $now         Unix seconds.
	 * @param callable $claim_nonce fn(string $nonce, int $expires_at): bool, true only the first time (atomic). Must fail closed.
	 * @param int      $tolerance   Allowed clock skew in seconds.
	 * @return string 'ok' or a coarse reason: 'malformed' | 'stale' | 'bad-signature' | 'replay'. Callers must not expose the reason to the sender.
	 *
	 * @security Trust boundary: untrusted network input. hash_equals is constant-time.
	 */
	public static function verify( string $secret, string $body, string $header, int $now, callable $claim_nonce, int $tolerance = self::DEFAULT_TOLERANCE ): string {
		self::assert_secret( $secret );
		$p = self::parse_header( $header );
		if ( null === $p ) {
			return 'malformed';
		}
		if ( abs( $now - $p['t'] ) > $tolerance ) {
			return 'stale';
		}
		$expected = hash_hmac( 'sha256', $p['t'] . '.' . $p['n'] . '.' . $body, $secret );
		if ( ! hash_equals( $expected, $p['v1'] ) ) {
			return 'bad-signature';
		}
		if ( true !== $claim_nonce( $p['n'], $p['t'] + $tolerance + 1 ) ) {
			return 'replay';
		}
		return 'ok';
	}

	/**
	 * Convert the configured hex secret into bytes; null if invalid or shorter than 32 bytes.
	 *
	 * @param string $hex Hex string.
	 */
	public static function secret_from_hex( string $hex ): ?string {
		$hex = trim( $hex );
		if ( ! preg_match( '/\A(?:[0-9a-fA-F]{2}){32,128}\z/', $hex ) ) {
			return null;
		}
		$bin = hex2bin( $hex );
		return false === $bin ? null : $bin;
	}

	private static function assert_secret( string $secret ): void {
		if ( strlen( $secret ) < self::MIN_SECRET_BYTES ) {
			throw new InvalidArgumentException( 'secret too short' );
		}
	}
}
