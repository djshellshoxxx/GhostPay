<?php
/**
 * Plugin Name:       GhostPay for WooCommerce
 * Description:       Accept GhostPay payments by redirecting the customer to a GhostPay payment link created by YOUR invoice service. No remote scripts, no third-party calls.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Requires Plugins:  woocommerce
 * License:           Proprietary (see repository)
 * Text Domain:       ghostpay-for-woocommerce
 *
 * @package GhostPay_For_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

define( 'GHOSTPAY_WC_VERSION', '0.1.0' );
define( 'GHOSTPAY_WC_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-ghostpay-signature.php';
require_once __DIR__ . '/includes/class-ghostpay-money.php';
require_once __DIR__ . '/includes/class-ghostpay-event.php';
require_once __DIR__ . '/includes/class-ghostpay-secrets.php';

// Secrets live only in wp-config.php or the environment: delete copies stored by earlier builds, ask to rotate them.
add_action( 'init', array( 'GhostPay_Secrets', 'purge_stored' ) );
add_action( 'admin_notices', array( 'GhostPay_Secrets', 'rotation_notice' ) );

// Declare compatibility with High-Performance Order Storage.
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', GHOSTPAY_WC_FILE, true );
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
			return; // WooCommerce is not active: do nothing.
		}
		require_once __DIR__ . '/includes/class-ghostpay-gateway.php';
		add_filter(
			'woocommerce_payment_gateways',
			static function ( $gateways ) {
				$gateways[] = 'WC_Gateway_GhostPay';
				return $gateways;
			}
		);
	}
);

// Replay-store housekeeping: delete expired webhook nonces once a day.
register_activation_hook(
	__FILE__,
	static function () {
		if ( ! wp_next_scheduled( 'ghostpay_cleanup_nonces' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'ghostpay_cleanup_nonces' );
		}
	}
);
register_deactivation_hook(
	__FILE__,
	static function () {
		wp_clear_scheduled_hook( 'ghostpay_cleanup_nonces' );
	}
);
add_action(
	'ghostpay_cleanup_nonces',
	static function () {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND CAST(option_value AS UNSIGNED) < %d",
				$wpdb->esc_like( 'ghostpay_nonce_' ) . '%',
				time()
			)
		);
	}
);
