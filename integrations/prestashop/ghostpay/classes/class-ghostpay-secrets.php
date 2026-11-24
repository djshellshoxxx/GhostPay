<?php
/**
 * Secrets are read only from constants (config/defines_custom.inc.php, which PrestaShop's config/config.inc.php
 * includes) or the environment, never from Configuration: ps_configuration is copied into every database backup and
 * served by the webservice API (configurations resource) to keys allowed to read it, and the webhook secret alone lets
 * anyone forge invoice.paid. PrestaShop-specific (the other classes here are copies of the WooCommerce ones).
 *
 * @package GhostPay_PrestaShop
 */

defined( '_PS_VERSION_' ) || exit;

final class GhostPay_Secrets {

	const NAMES   = array(
		'service' => 'GHOSTPAY_SERVICE_SECRET',
		'webhook' => 'GHOSTPAY_WEBHOOK_SECRET',
	);
	const EXPOSED = 'GHOSTPAY_EXPOSED_SECRETS';

	/**
	 * Configured hex secret: the constant, else the environment variable of the same name.
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
	 * Upgrade step (idempotent, on every module load): earlier versions stored both secrets in Configuration, for any
	 * shop. Delete them and keep only a SHA-256 of each value, so the rotation warning stays until a different value is
	 * configured. The record is written first: a request that stops in between leaves the secrets for the next purge,
	 * never an unrecorded deletion.
	 */
	public static function purge_stored(): void {
		$rows = Db::getInstance()->executeS( 'SELECT `name`, `value` FROM `' . _DB_PREFIX_ . 'configuration` WHERE `name` IN (\'' . implode( '\', \'', self::NAMES ) . '\')' );
		if ( ! is_array( $rows ) || array() === $rows ) {
			return;
		}
		$exposed = self::exposed();
		foreach ( $rows as $row ) {
			$which = array_search( $row['name'], self::NAMES, true );
			$value = self::normalize( (string) $row['value'] );
			if ( false !== $which && '' !== $value && ! in_array( hash( 'sha256', $value ), $exposed[ $which ] ?? array(), true ) ) {
				$exposed[ $which ][] = hash( 'sha256', $value );
			}
		}
		if ( array() !== $exposed ) {
			Configuration::updateGlobalValue( self::EXPOSED, json_encode( $exposed ) );
		}
		foreach ( self::NAMES as $name ) {
			Configuration::deleteByName( $name );
		}
	}

	/**
	 * Secrets an earlier version stored in Configuration that are not yet replaced by a different valid value. Forgets
	 * the record once all are.
	 *
	 * @return string[] Constant names.
	 */
	public static function unrotated(): array {
		$exposed = self::exposed();
		if ( array() === $exposed ) {
			return array();
		}
		$pending = array();
		foreach ( $exposed as $which => $hashes ) {
			$hex = self::hex( $which );
			if ( null === GhostPay_Signature::secret_from_hex( $hex ) || in_array( hash( 'sha256', self::normalize( $hex ) ), $hashes, true ) ) {
				$pending[ $which ] = $hashes;
			}
		}
		if ( array() === $pending ) {
			Configuration::deleteByName( self::EXPOSED );
		} elseif ( $pending !== $exposed ) {
			Configuration::updateGlobalValue( self::EXPOSED, json_encode( $pending ) );
		}
		return array_values( array_intersect_key( self::NAMES, $pending ) );
	}

	/** @return array<string, string[]> SHA-256 of each exposed value, by 'service' / 'webhook'. */
	private static function exposed(): array {
		$record  = json_decode( (string) Configuration::getGlobalValue( self::EXPOSED ), true );
		$exposed = array();
		foreach ( is_array( $record ) ? $record : array() as $which => $hashes ) {
			if ( isset( self::NAMES[ $which ] ) && is_array( $hashes ) ) {
				$exposed[ $which ] = array_values( array_filter( $hashes, 'is_string' ) );
			}
		}
		return $exposed;
	}

	private static function normalize( string $hex ): string {
		return strtolower( trim( $hex ) );
	}
}
