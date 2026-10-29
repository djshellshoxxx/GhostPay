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

// amountMinor exponent: the GhostPay app's table (0 decimals for JPY and the other zero-decimal codes, else 2).
check( 'currency decimals: USD', GhostPay_Money::currency_decimals( 'USD' ), 2 );
check( 'currency decimals: JPY', GhostPay_Money::currency_decimals( 'JPY' ), 0 );
check( 'currency decimals: KWD is 2 in the GhostPay app', GhostPay_Money::currency_decimals( 'KWD' ), 2 );
check( 'currency decimals: malformed code', GhostPay_Money::currency_decimals( 'usd' ), null );
foreach ( array( array( '1500.00', 'JPY', '1500' ), array( '1500.5', 'JPY', null ), array( '12.5', 'USD', '1250' ), array( '13', 'USD', '1300' ), array( '12.340', 'KWD', '1234' ), array( '12.345', 'KWD', null ), array( '1', 'US', null ), array( '1.0', 'XOF', '1' ) ) as $c ) {
	check( "currency_minor {$c[0]} {$c[1]}", GhostPay_Money::currency_minor( $c[0], $c[1] ), $c[2] );
}
$app_format = dirname( __DIR__, 3 ) . '/apps/web/src/lib/format.ts'; // present when run inside the repository
if ( is_file( $app_format ) ) {
	$app = (string) file_get_contents( $app_format );
	preg_match( '/ZERO_DECIMAL_CURRENCIES = new Set\(\[([^\]]*)\]\)/', $app, $m );
	preg_match_all( "/'([A-Z]{3})'/", $m[1] ?? '', $codes );
	check( 'zero-decimal table equals the GhostPay app table', GhostPay_Money::ZERO_DECIMAL_CURRENCIES, $codes[1] );
	check( 'GhostPay app still uses 2 decimals for every other code', 1 === preg_match( '/return ZERO_DECIMAL_CURRENCIES\.has\(currency\) \? 0 : 2;/', $app ), true );
} else {
	echo "SKIP app table check: apps/web/src/lib/format.ts not found\n";
}

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
	// H-R1: with no valid webhook secret configured (the upgrade window, before wp-config.php has the new value) a
	// webhook is refused with a retryable 503, not the 400 of a bad signature: a sender may treat a 4xx as final and
	// drop the payment. The answer does not depend on the request.
	$retry = array( 503, array( 'ok' => false, 'retry' => true ) );
	check( 'no webhook secret configured: a webhook signed with the stored secret gets a retryable 503', ghostpay_test_deliver( $paid_s, $sign_with( $old_webhook, $paid_s ) ), $retry );
	check( 'no webhook secret configured: an unsigned request gets the same 503', ghostpay_test_deliver( $paid_s, '' ), $retry );
	putenv( 'GHOSTPAY_WEBHOOK_SECRET=' . str_repeat( 'ab', 16 ) ); // 16 bytes: not a valid secret
	check( 'a too short webhook secret counts as not configured: 503', ghostpay_test_deliver( $paid_s, $sign_with( $old_webhook, $paid_s ) ), $retry );
	putenv( 'GHOSTPAY_WEBHOOK_SECRET' );
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
	check( 'with a secret configured, a bad signature is a 400', ghostpay_test_deliver( $paid_s, $sign_with( $old_webhook, $paid_s ) )[0], 400 );
	check( 'the sender retry of the upgrade-window payment is accepted', ghostpay_test_deliver( $paid_s, $sign_with( $hex( 'c3' ), $paid_s ) )[0], 200 );
	check( 'that webhook pays the order', GhostPay_Test::$orders[1]['status'], 'processing' );
	do_action( 'init' );
	check( 'upgrade step is idempotent', $notice(), '' );
	// A request can stop at any database step: the purge must never delete a secret it has not recorded for rotation.
	for ( $step = 1; ; ++$step ) {
		GhostPay_Test::reset();
		update_option( 'woocommerce_ghostpay_settings', $settings + array( 'service_secret' => $old_service, 'webhook_secret' => $old_webhook ) );
		try {
			$stopped = GhostPay_Test::race(
				static fn() => do_action( 'init' ),
				static function (): void {
					throw new RuntimeException( 'request stopped' );
				},
				$step
			);
		} catch ( RuntimeException $e ) {
			$stopped = true;
		}
		if ( ! $stopped ) {
			break;
		}
		list( $left, $recorded ) = GhostPay_Test::as_request( static fn(): array => array( get_option( 'woocommerce_ghostpay_settings' ), get_option( 'ghostpay_exposed_secrets' ) ) );
		check( "purge stopped at database step $step: secrets still stored or recorded", isset( $left['service_secret'], $left['webhook_secret'] ) || ( is_array( $recorded ) && 2 === count( $recorded ) ), true );
	}
	check( 'purge interruption covered its database steps', $step > 3, true );

	// G3-04: claims must be atomic. WordPress add_option() reads, fires 'add_option', then upserts, so two concurrent
	// requests could both "add" the same option. Run a second request at every database step of the first one.
	$webhook_hex = $hex( 'c3' );
	$race        = static function ( string $body, string $first_sig, string $second_sig, int $step ) use ( $settings ): ?array {
		GhostPay_Test::reset();
		update_option( 'woocommerce_ghostpay_settings', $settings );
		ghostpay_test_order( 2, 'pending', '12.50', 'USD', array( 'inv_race' ) );
		$replies = array();
		$ran     = GhostPay_Test::race(
			static function () use ( &$replies, $body, $first_sig ): void {
				$replies[] = ghostpay_test_deliver( $body, $first_sig );
			},
			static function () use ( &$replies, $body, $second_sig ): void {
				$replies[] = ghostpay_test_deliver( $body, $second_sig );
			},
			$step
		);
		$answers = array_map( static fn( array $r ): string => $r[0] . ( empty( $r[1]['duplicate'] ) ? '' : ' duplicate' ), $replies );
		sort( $answers );
		return $ran ? $answers : null;
	};
	$race_paid = $event( 'evt_race', 'invoice.paid', 'inv_race', 'USD', '1250' );
	$outcomes  = array();
	for ( $step = 1; null !== ( $answers = $race( $race_paid, $sign_with( $webhook_hex, $race_paid ), $sign_with( $webhook_hex, $race_paid ), $step ) ); ++$step ) {
		check( "one event delivered twice, raced at step $step: paid once", GhostPay_Test::$payments, array( 2 ) );
		check( "one event delivered twice, raced at step $step: other delivery is a duplicate or retryable", in_array( $answers, array( array( '200', '200 duplicate' ), array( '200', '503' ) ), true ), true );
		$outcomes[ implode( ',', $answers ) ] = true;
	}
	check( 'event race hit both a finished and a live claim', isset( $outcomes['200,200 duplicate'], $outcomes['200,503'] ), true );
	for ( $step = 1; null !== ( $answers = $race( $race_paid, $sig = $sign_with( $webhook_hex, $race_paid ), $sig, $step ) ); ++$step ) {
		check( "replayed signature raced at step $step is refused", $answers, array( '200', '400' ) );
		check( "replayed signature raced at step $step: paid once", GhostPay_Test::$payments, array( 2 ) );
	}
	check( 'replay race covered the nonce steps', $step > 3, true );

	// G3-05: a transition depends on the order's state and on which of its invoices an event is for.
	GhostPay_Test::reset();
	update_option( 'woocommerce_ghostpay_settings', $settings );
	$deliver = static fn( string $body ): array => ghostpay_test_deliver( $body, $sign_with( $webhook_hex, $body ) );
	$status  = static fn( int $id ): string => GhostPay_Test::$orders[ $id ]['status'];
	$notes   = static fn( int $id ): string => implode( "\n", GhostPay_Test::$notes[ $id ] ?? array() );

	ghostpay_test_order( 10, 'processing', '12.50', 'USD', array( 'inv_10a', 'inv_10b' ) ); // paid through inv_10a
	$deliver( $event( 'evt_10', 'invoice.paid', 'inv_10b', 'USD', '1250' ) );
	check( 'second full payment: a paid order stays paid', $status( 10 ), 'processing' );
	check( 'second full payment: flagged for a refund check', str_contains( $notes( 10 ), 'refund' ), true );
	check( 'second full payment: no false underpayment note', str_contains( $notes( 10 ), 'below the order total' ), false );
	ghostpay_test_order( 11, 'completed', '12.50', 'USD', array( 'inv_11' ) );
	$deliver( $event( 'evt_11', 'invoice.over', 'inv_11', 'USD', '1300' ) );
	check( 'overpayment event: a completed order stays completed', $status( 11 ), 'completed' );
	ghostpay_test_order( 12, 'processing', '12.50', 'USD', array( 'inv_12' ) );
	$deliver( $event( 'evt_12', 'invoice.paid', 'inv_12', 'USD', '100' ) );
	check( 'small extra payment: a paid order is not put on hold', $status( 12 ), 'processing' );
	check( 'small extra payment: flagged for a refund check', str_contains( $notes( 12 ), 'refund' ), true );
	$deliver( $event( 'evt_12p', 'invoice.partial', 'inv_12', 'USD', '100' ) );
	check( 'partial payment on a paid order: no "stays unpaid" note', str_contains( $notes( 12 ), 'stays unpaid' ), false );
	ghostpay_test_order( 13, 'refunded', '12.50', 'USD', array( 'inv_13' ) );
	$deliver( $event( 'evt_13', 'invoice.paid', 'inv_13', 'USD', '1250' ) );
	check( 'payment for a refunded order: status kept', $status( 13 ), 'refunded' );
	check( 'payment for a refunded order: not noted as confirmed', str_contains( $notes( 13 ), 'confirmed' ), false );
	check( 'no paid or refunded order was paid again', GhostPay_Test::$payments, array() );

	ghostpay_test_order( 14, 'pending', '12.50', 'USD', array( 'inv_14' ) );
	$deliver( $event( 'evt_14', 'invoice.paid', 'inv_14', 'USD', '1000' ) );
	check( 'underpayment of an unpaid order: on hold', $status( 14 ), 'on-hold' );
	check( 'underpayment of an unpaid order: noted', str_contains( $notes( 14 ), 'below the order total' ), true );
	$deliver( $event( 'evt_14b', 'invoice.paid', 'inv_14', 'USD', '1250' ) );
	check( 'full payment after an underpayment completes the order', $status( 14 ), 'processing' );

	ghostpay_test_order( 15, 'pending', '12.50', 'USD', array( 'inv_15a', 'inv_15b' ) ); // customer retried: inv_15b is current
	$deliver( $event( 'evt_15a', 'invoice.expired', 'inv_15a', 'USD', '0' ) );
	check( 'expiry of a superseded invoice does not cancel the order', $status( 15 ), 'pending' );
	$deliver( $event( 'evt_15b', 'invoice.expired', 'inv_15b', 'USD', '0' ) );
	check( 'expiry of the current invoice cancels a pending order', $status( 15 ), 'cancelled' );
	$deliver( $event( 'evt_15c', 'invoice.paid', 'inv_15a', 'USD', '1250' ) );
	check( 'late full payment of an older invoice completes a cancelled order', $status( 15 ), 'processing' );
	check( 'only unpaid orders were paid', GhostPay_Test::$payments, array( 14, 15 ) );

	// G3-02: amountMinor is in the GhostPay app's minor units of the currency (0 decimals for JPY and the other
	// zero-decimal codes, else 2), never scaled by the store's display decimals (wc_get_price_decimals()), both in
	// the invoice request and in the webhook comparison.
	$invoice_amount = static function ( string $total, string $currency, int $display_decimals ): ?string {
		GhostPay_Test::$http           = array();
		GhostPay_Test::$notices        = array();
		GhostPay_Test::$price_decimals = $display_decimals;
		GhostPay_Test::$http_response  = array(
			'response' => array( 'code' => 201 ),
			'body'     => json_encode( array( 'invoiceId' => 'inv_new', 'link' => 'https://pay.example.test/#gpi=v1.abc' ) ),
		);
		ghostpay_test_order( 20, 'pending', $total, $currency, array() );
		$result = ( new WC_Gateway_GhostPay() )->process_payment( 20 );
		return 'success' === $result['result'] ? json_decode( GhostPay_Test::$http[0]['args']['body'], true )['amountMinor'] : null;
	};
	check( 'invoice amount: USD 12.50', $invoice_amount( '12.50', 'USD', 2 ), '1250' );
	check( 'invoice amount: JPY with the default 2 display decimals', $invoice_amount( '1500.00', 'JPY', 2 ), '1500' );
	check( 'invoice amount: JPY with 0 display decimals', $invoice_amount( '1500', 'JPY', 0 ), '1500' );
	check( 'invoice amount: USD in a store showing 0 decimals', $invoice_amount( '13', 'USD', 0 ), '1300' );
	check( 'invoice amount: KWD with 3 display decimals, representable', $invoice_amount( '12.340', 'KWD', 3 ), '1234' );
	check( 'invoice amount: KWD needing the third decimal is refused', $invoice_amount( '12.345', 'KWD', 3 ), null );
	check( 'refused total: error for the customer, no invoice request', array( GhostPay_Test::$notices[0][0] ?? '', count( GhostPay_Test::$http ) ), array( 'error', 0 ) );
	GhostPay_Test::$price_decimals = 2;
	ghostpay_test_order( 21, 'pending', '1500.00', 'JPY', array( 'inv_21' ) );
	$deliver( $event( 'evt_21', 'invoice.paid', 'inv_21', 'JPY', '1500' ) );
	check( 'webhook: JPY 1500 pays a 1500.00 JPY order', $status( 21 ), 'processing' );
	GhostPay_Test::$price_decimals = 0;
	ghostpay_test_order( 22, 'pending', '13', 'USD', array( 'inv_22' ) );
	$deliver( $event( 'evt_22a', 'invoice.paid', 'inv_22', 'USD', '13' ) );
	check( 'webhook: USD 0.13 does not pay a 13 USD order (0 display decimals)', $status( 22 ), 'on-hold' );
	$deliver( $event( 'evt_22b', 'invoice.paid', 'inv_22', 'USD', '1300' ) );
	check( 'webhook: USD 13.00 pays it', $status( 22 ), 'processing' );

	// G3-01, last because a constant cannot be undefined again: the wp-config.php constant wins over the environment.
	define( 'GHOSTPAY_WEBHOOK_SECRET', $hex( 'e5' ) );
	ghostpay_test_order( 30, 'pending', '12.50', 'USD', array( 'inv_30' ) );
	$paid_30 = $event( 'evt_30', 'invoice.paid', 'inv_30', 'USD', '1250' );
	check( 'environment secret ignored once the constant is defined', ghostpay_test_deliver( $paid_30, $sign_with( $webhook_hex, $paid_30 ) )[0], 400 );
	check( 'webhook secret from the wp-config.php constant', ghostpay_test_deliver( $paid_30, $sign_with( $hex( 'e5' ), $paid_30 ) )[0], 200 );
}

if ( $failed > 0 ) {
	echo "$failed failure(s)\n";
	exit( 1 );
}
echo "woocommerce php tests: ok\n";
