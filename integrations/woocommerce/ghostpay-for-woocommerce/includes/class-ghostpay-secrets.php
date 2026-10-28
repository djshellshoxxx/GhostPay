<?php
/**
 * Secrets are read only from wp-config.php constants or the environment, never from the gateway settings: the
 * settings row is returned by the WooCommerce REST API (GET /wc/v3/payment_gateways) to any key with read access and
 * is copied into every database backup, and the webhook secret alone lets anyone forge invoice.paid.
 *
 * @package GhostPay_For_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class GhostPay_Secrets {

	const NAMES    = array(
		'service' => 'GHOSTPAY_SERVICE_SECRET',
		'webhook' => 'GHOSTPAY_WEBHOOK_SECRET',
	);
	const SETTINGS = 'woocommerce_ghostpay_settings';
	const EXPOSED  = 'ghostpay_exposed_secrets';

	/**
	 * Configured hex secret: the wp-config.php constant, else the environment variable of the same name.
	 *
	 * @param string $which 'service' or 'webhook'.
	 * @return string Hex text ('' when not configured).
	 */
	public static function hex( string $which ): string {
		$name = self::NAMES[ $which ];
		if ( defined( $name ) ) {
			return (string) constant( $name );
		}
		$env = getenv( $name );
		return false === $env ? '' : $env;
	}

	/**
	 * Upgrade step (idempotent, on every load): earlier builds could store both secrets in the gateway settings. Delete
	 * them and keep only a SHA-256 of each, so the rotation notice stays until a different value is configured. The
	 * record is written first: a request that stops in between leaves the secrets for the next purge, never an
	 * unrecorded deletion.
	 */
	public static function purge_stored(): void {
		$settings = get_option( self::SETTINGS );
		if ( ! is_array( $settings ) || ! array_intersect_key( $settings, array( 'service_secret' => true, 'webhook_secret' => true ) ) ) {
			return;
		}
		$exposed = get_option( self::EXPOSED, array() );
		$exposed = is_array( $exposed ) ? $exposed : array();
		foreach ( array_keys( self::NAMES ) as $which ) {
			$value = self::normalize( (string) ( $settings[ $which . '_secret' ] ?? '' ) );
			if ( '' !== $value ) {
				$exposed[ $which ] = hash( 'sha256', $value );
			}
			unset( $settings[ $which . '_secret' ] );
		}
		if ( array() !== $exposed ) {
			update_option( self::EXPOSED, $exposed, false );
		}
		update_option( self::SETTINGS, $settings );
	}

	/** Admin notice while a secret that was stored in the database is not yet replaced by a new valid value. */
	public static function rotation_notice(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$exposed = get_option( self::EXPOSED, array() );
		if ( ! is_array( $exposed ) || array() === $exposed ) {
			return;
		}
		$pending = array();
		foreach ( $exposed as $which => $hash ) {
			if ( ! isset( self::NAMES[ $which ] ) ) {
				continue;
			}
			$hex     = self::hex( $which );
			$rotated = null !== GhostPay_Signature::secret_from_hex( $hex ) && ! hash_equals( (string) $hash, hash( 'sha256', self::normalize( $hex ) ) );
			if ( ! $rotated ) {
				$pending[ $which ] = $hash;
			}
		}
		if ( array() === $pending ) {
			delete_option( self::EXPOSED );
			return;
		}
		if ( $pending !== $exposed ) {
			update_option( self::EXPOSED, $pending, false );
		}
		$names = implode( ', ', array_intersect_key( self::NAMES, $pending ) );
		printf(
			'<div class="notice notice-warning"><p>%s</p></div>',
			esc_html(
				sprintf(
					/* translators: %s: constant names */
					__( 'GhostPay: an earlier version stored secrets in the gateway settings, where the WooCommerce REST API and database backups expose them. They were deleted. Generate new secrets for %s, set them in wp-config.php (or the environment) and in your invoice service; the old values must not be used again.', 'ghostpay-for-woocommerce' ),
					$names
				)
			)
		);
	}

	private static function normalize( string $hex ): string {
		return strtolower( trim( $hex ) );
	}
}
