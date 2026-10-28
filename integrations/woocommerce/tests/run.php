<?php
/**
 * CLI tests for the WordPress-independent classes, then the gateway class on tests/wp-shim.php (needs pdo_sqlite).
 * Run: php integrations/woocommerce/tests/run.php
 * The signature vector was produced by signWebhook() from @ghostpay/merchant-hooks (cross-language check).
 * Fake secrets, orders and events only.
 */

define( 'GHOSTPAY_CLI_TEST', true );
$base = dirname( __DIR__ ) . '/ghostpay-for-woocommerce/includes/';
require $base . 'class-ghostpay-signature.php';
require $base . 'class-ghostpay-money.php';
require $base . 'class-ghostpay-event.php';

$failed = 0;
function check( string $name, $got, $want ): void {
	global $failed;
	if ( $got !== $want ) {
		++$failed;
		echo "FAIL $name: got " . var_export( $got, true ) . ' want ' . var_export( $want, true ) . "\n";
	}
}

$secret = implode( '', array_map( 'chr', range( 0, 31 ) ) );
$body   = '{"id":"evt_1","type":"invoice.paid","createdAt":1800000000,"data":{"invoiceId":"inv_1","currency":"USD","amountMinor":"1250"}}';
$nonce  = '00112233445566778899aabbccddeeff';
$node   = 't=1800000000,n=00112233445566778899aabbccddeeff,v1=121f8b8ccb38cf2f18430b5bfef0e2723e4c10304cc3f650848db7816025ebaa';
$now    = 1800000000;

check( 'sign equals node vector', GhostPay_Signature::sign( $secret, $body, $now, $nonce ), $node );

$store = array();
$claim = static function ( string $n, int $exp ) use ( &$store ): bool {
	if ( isset( $store[ $n ] ) ) {
		return false;
	}
	$store[ $n ] = $exp;
	return true;
};
check( 'verify node vector', GhostPay_Signature::verify( $secret, $body, $node, $now, $claim ), 'ok' );
check( 'replay', GhostPay_Signature::verify( $secret, $body, $node, $now, $claim ), 'replay' );
$store = array();
check( 'tampered body', GhostPay_Signature::verify( $secret, $body . ' ', $node, $now, $claim ), 'bad-signature' );
check( 'invalid sig does not poison store', count( $store ), 0 );
check( 'stale', GhostPay_Signature::verify( $secret, $body, $node, $now + 301, $claim ), 'stale' );
check( 'future', GhostPay_Signature::verify( $secret, $body, $node, $now - 301, $claim ), 'stale' );
check( 'edge ok', GhostPay_Signature::verify( $secret, $body, $node, $now + 300, $claim ), 'ok' );
$store = array();
check( 'wrong secret', GhostPay_Signature::verify( str_repeat( 'x', 32 ), $body, $node, $now, $claim ), 'bad-signature' );
check( 'full store fails closed', GhostPay_Signature::verify( $secret, $body, $node, $now, static fn() => false ), 'replay' );
foreach ( array( '', 'garbage', $node . ',x=1', strtoupper( $node ), str_replace( 't=', 'T=', $node ), "$node\n", 'n=00112233445566778899aabbccddeeff,t=1800000000,v1=' . str_repeat( 'a', 64 ), 't=1800000000,n=abc,v1=' . str_repeat( 'a', 64 ), str_repeat( 'a', 300 ) ) as $i => $bad ) {
	check( "malformed #$i", GhostPay_Signature::verify( $secret, $body, $bad, $now, $claim ), 'malformed' );
}
try {
	GhostPay_Signature::sign( 'short', $body, $now, $nonce );
	check( 'short secret throws', true, false );
} catch ( InvalidArgumentException $e ) {
	check( 'short secret throws', true, true );
}
check( 'secret_from_hex ok', strlen( (string) GhostPay_Signature::secret_from_hex( str_repeat( 'ab', 32 ) ) ), 32 );
check( 'secret_from_hex short', GhostPay_Signature::secret_from_hex( str_repeat( 'ab', 31 ) ), null );
check( 'secret_from_hex junk', GhostPay_Signature::secret_from_hex( str_repeat( 'zz', 32 ) ), null );

// Money.
$cases = array(
	array( '12.50', 2, '1250' ), array( '0', 2, '0' ), array( '0.00', 2, '0' ), array( '5', 0, '5' ), array( '1.5', 2, '150' ),
	array( '1.500', 2, '150' ), array( '1.505', 2, null ), array( '-1', 2, null ), array( '1e3', 2, null ), array( '01.00', 2, null ),
	array( '', 2, null ), array( '.5', 2, null ), array( '1.', 2, null ), array( "1.00\n", 2, null ), array( '0.001', 3, '1' ),
	array( '99999999999999999999999.99', 2, '9999999999999999999999999' ),
);
foreach ( $cases as $c ) {
	check( "to_minor {$c[0]}/{$c[1]}", GhostPay_Money::to_minor( $c[0], $c[1] ), $c[2] );
}
check( 'cmp lt', GhostPay_Money::compare( '999', '1000' ), -1 );
check( 'cmp eq', GhostPay_Money::compare( '1250', '1250' ), 0 );
check( 'cmp gt', GhostPay_Money::compare( '1251', '1250' ), 1 );
check( 'cmp huge', GhostPay_Money::compare( str_repeat( '9', 29 ), '1' . str_repeat( '0', 29 ) ), -1 );
check( 'cmp bad', GhostPay_Money::compare( '01', '1' ), null );
check( 'cmp bad2', GhostPay_Money::compare( '1', 'x' ), null );

// Events.
check( 'event ok', is_array( GhostPay_Event::parse( $body ) ), true );
check( 'event with paymentId', is_array( GhostPay_Event::parse( '{"id":"e","type":"invoice.partial","createdAt":1,"data":{"invoiceId":"i","currency":"EUR","amountMinor":"0","paymentId":"p1"}}' ) ), true );
$paid_payment = GhostPay_Event::parse( '{"id":"e1","type":"invoice.paid","createdAt":1,"data":{"invoiceId":"i","currency":"EUR","amountMinor":"1250","paymentId":"p1"}}' );
$paid_payment_redelivery = GhostPay_Event::parse( '{"id":"e2","type":"invoice.paid","createdAt":2,"data":{"invoiceId":"i","currency":"EUR","amountMinor":"1250","paymentId":"p1"}}' );
check( 'event claim identity excludes signature nonce', GhostPay_Event::identity_keys( GhostPay_Event::parse( $body ) ), array( 'event:inv_1:evt_1' ) );
check( 'fresh event ID with same provider transaction shares claim', GhostPay_Event::identity_keys( $paid_payment )[1], GhostPay_Event::identity_keys( $paid_payment_redelivery )[1] );
check( 'partial then paid can advance the same provider transaction', GhostPay_Event::identity_keys( $paid_payment )[1] === GhostPay_Event::identity_keys( array_merge( $paid_payment, array( 'type' => 'invoice.partial' ) ) )[1], false );
$bads = array(
	'', 'null', '[]', '{}', '{"id":"e"}', str_replace( '"invoice.paid"', '"invoice.refunded"', $body ), str_replace( '"1250"', '1250', $body ),
	str_replace( '"1250"', '"01250"', $body ), str_replace( '"1250"', '"-5"', $body ), str_replace( '"USD"', '"usd"', $body ),
	str_replace( '"createdAt":1800000000', '"createdAt":"1"', $body ), str_replace( '"id":"evt_1"', '"id":"evt 1"', $body ),
	str_replace( '"data":', '"extra":1,"data":', $body ), str_replace( '"amountMinor"', '"extra":1,"amountMinor"', $body ),
	'{"id":"e","type":"invoice.paid","createdAt":1,"data":[1,2]}', str_replace( '1800000000', '1.5', $body ),
);
foreach ( $bads as $i => $b ) {
	check( "event bad #$i", GhostPay_Event::parse( $b ), null );
}

// ---- Gateway on the WordPress/WooCommerce shim (tests/wp-shim.php) -----------------------------------------------
if ( ! extension_loaded( 'pdo_sqlite' ) ) {
	echo "SKIP gateway tests: the pdo_sqlite extension is not available\n";
} else {
	require __DIR__ . '/wp-shim.php';
	GhostPay_Test::reset();
	require dirname( __DIR__ ) . '/ghostpay-for-woocommerce/ghostpay-for-woocommerce.php';
	do_action( 'plugins_loaded' );
	check( 'gateway registered', apply_filters( 'woocommerce_payment_gateways', array() ), array( 'WC_Gateway_GhostPay' ) );

	$hex      = static fn( string $byte ): string => str_repeat( $byte, 32 ); // fake 32-byte secrets, hex encoded
	$settings = array( 'enabled' => 'yes', 'service_url' => 'https://invoices.shop.test', 'pay_host' => 'pay.example.test', 'ttl' => '3600' );
	$event    = static fn( string $id, string $type, string $invoice, string $currency, string $amount ): string => json_encode(
		array( 'id' => $id, 'type' => $type, 'createdAt' => 1800000000, 'data' => array( 'invoiceId' => $invoice, 'currency' => $currency, 'amountMinor' => $amount ) )
	);
	$sign_with = static fn( string $secret_hex, string $body ): string => GhostPay_Signature::sign( hex2bin( $secret_hex ), $body, time(), bin2hex( random_bytes( 16 ) ) );
	$notice    = static function (): string {
		ob_start();
		do_action( 'admin_notices' );
		return (string) ob_get_clean();
	};

	// G3-01: secrets come only from wp-config.php constants or the environment. The settings row is returned by the
	// WooCommerce REST API and copied into backups; with a webhook secret from there anyone can forge invoice.paid.
	putenv( 'GHOSTPAY_SERVICE_SECRET' );
	putenv( 'GHOSTPAY_WEBHOOK_SECRET' );
	$old_service = $hex( 'a1' );
	$old_webhook = $hex( 'b2' );
	update_option( 'woocommerce_ghostpay_settings', $settings + array( 'service_secret' => $old_service, 'webhook_secret' => $old_webhook ) );
	$gateway = new WC_Gateway_GhostPay();
	check( 'no secret fields in the settings form', array_values( array_intersect( array( 'service_secret', 'webhook_secret' ), array_keys( $gateway->form_fields ) ) ), array() );
	check( 'a service secret stored in the settings is not used', $gateway->is_available(), false );
	ghostpay_test_order( 1, 'pending', '12.50', 'USD', array( 'inv_s' ) );
	$paid_s = $event( 'evt_s', 'invoice.paid', 'inv_s', 'USD', '1250' );
	check( 'a webhook signed with the stored webhook secret is refused', ghostpay_test_deliver( $paid_s, $sign_with( $old_webhook, $paid_s ) )[0], 400 );
	check( 'a forged webhook does not pay the order', GhostPay_Test::$orders[1]['status'], 'pending' );

	do_action( 'init' ); // upgrade step
	$stored = get_option( 'woocommerce_ghostpay_settings' );
	check( 'upgrade deletes the stored secrets', array_values( array_intersect( array( 'service_secret', 'webhook_secret' ), array_keys( (array) $stored ) ) ), array() );
	check( 'upgrade keeps the other settings', $stored['service_url'] ?? null, 'https://invoices.shop.test' );
	$raw = (string) $wpdb->get_var( "SELECT group_concat(option_value) FROM {$wpdb->options}" );
	check( 'no copy of a stored secret is left in wp_options', str_contains( $raw, $old_service ) || str_contains( $raw, $old_webhook ), false );
	$shown = $notice();
	check( 'admin notice asks to rotate both secrets', str_contains( $shown, 'GHOSTPAY_SERVICE_SECRET' ) && str_contains( $shown, 'GHOSTPAY_WEBHOOK_SECRET' ), true );
	GhostPay_Test::$can = false;
	check( 'rotation notice only for shop managers', $notice(), '' );
	GhostPay_Test::$can = true;
	putenv( 'GHOSTPAY_SERVICE_SECRET=' . strtoupper( $old_service ) ); // the exposed value, merely moved
	putenv( 'GHOSTPAY_WEBHOOK_SECRET=' . $hex( 'c3' ) );
	$shown = $notice();
	check( 'notice stays while the exposed service secret is still configured', str_contains( $shown, 'GHOSTPAY_SERVICE_SECRET' ), true );
	check( 'a rotated webhook secret leaves the notice', str_contains( $shown, 'GHOSTPAY_WEBHOOK_SECRET' ), false );
	putenv( 'GHOSTPAY_SERVICE_SECRET=' . $hex( 'd4' ) );
	check( 'notice gone once both secrets are rotated', $notice(), '' );
	check( 'exposure record removed after rotation', get_option( 'ghostpay_exposed_secrets' ), false );
	check( 'secrets from the environment make the gateway available', ( new WC_Gateway_GhostPay() )->is_available(), true );
	check( 'a webhook signed with the configured secret is accepted', ghostpay_test_deliver( $paid_s, $sign_with( $hex( 'c3' ), $paid_s ) )[0], 200 );
	check( 'that webhook pays the order', GhostPay_Test::$orders[1]['status'], 'processing' );
	do_action( 'init' );
	check( 'upgrade step is idempotent', $notice(), '' );
}

if ( $failed > 0 ) {
	echo "$failed failure(s)\n";
	exit( 1 );
}
echo "woocommerce php tests: ok\n";
