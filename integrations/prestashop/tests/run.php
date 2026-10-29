<?php
/**
 * CLI tests for the PrestaShop-independent webhook, money and order-action policy, then the module and webhook controller
 * on tests/ps-shim.php (SQLite; needs pdo_sqlite). Run: php integrations/prestashop/tests/run.php. Fake data only.
 */

define( 'GHOSTPAY_CLI_TEST', true );
$base = dirname( __DIR__ ) . '/ghostpay/classes/';
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

// Exact text conversion mirrors WooCommerce's decimal-string helper; no float participates in comparison.
$money = array(
	array( '12.50', 2, '1250' ),
	array( '1.5000', 2, '150' ),
	array( '1.5001', 2, null ),
	array( '0.00', 2, '0' ),
	array( '5', 0, '5' ),
	array( '-1', 2, null ),
	array( '1e3', 2, null ),
	array( '01.00', 2, null ),
	array( '1.234567891', 8, null ),
	array( "1.00\n", 2, null ),
	array( '99999999999999999999999.99', 2, '9999999999999999999999999' ),
);
foreach ( $money as $i => $case ) {
	check( "money #$i", GhostPay_Money::to_minor( $case[0], $case[1] ), $case[2] );
}
check( 'compare lower', GhostPay_Money::compare( '999', '1000' ), -1 );
check( 'compare equal', GhostPay_Money::compare( '1250', '1250' ), 0 );
check( 'compare greater', GhostPay_Money::compare( '1251', '1250' ), 1 );
check( 'compare malformed', GhostPay_Money::compare( '01', '1' ), null );

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

// State policy is deliberately fail closed: only a sufficient paid/over event can complete an order, and only an
// unpaid one. A payment event that must not change the order asks for a manual check ('note': private message).
check( 'paid sufficient', GhostPay_Event::order_action( 'invoice.paid', 0, 'awaiting' ), 'paid' );
check( 'over sufficient', GhostPay_Event::order_action( 'invoice.over', 1, 'awaiting' ), 'paid' );
check( 'late sufficient payment of an unpaid (error, cancelled, backorder) order', GhostPay_Event::order_action( 'invoice.paid', 0, 'unpaid' ), 'paid' );
check( 'sufficient payment never re-pays a closed order', GhostPay_Event::order_action( 'invoice.paid', 0, 'closed' ), 'note' );
check( 'paid under due', GhostPay_Event::order_action( 'invoice.paid', -1, 'awaiting' ), 'hold' );
check( 'under due never pays a non-awaiting order', GhostPay_Event::order_action( 'invoice.paid', -1, 'unpaid' ), 'note' );
check( 'under due never changes a closed order', GhostPay_Event::order_action( 'invoice.paid', -1, 'closed' ), 'note' );
check( 'unknown amount never pays', GhostPay_Event::order_action( 'invoice.paid', null, 'awaiting' ), 'note' );
check( 'partial stays awaiting', GhostPay_Event::order_action( 'invoice.partial', 1, 'awaiting' ), 'partial' );
check( 'partial never changes a closed order', GhostPay_Event::order_action( 'invoice.partial', 1, 'closed' ), 'note' );
check( 'expired cancels only awaiting', GhostPay_Event::order_action( 'invoice.expired', null, 'awaiting' ), 'cancel' );
check( 'expired does not cancel a payment-error order', GhostPay_Event::order_action( 'invoice.expired', null, 'unpaid' ), 'ignore' );
check( 'expired does not downgrade paid', GhostPay_Event::order_action( 'invoice.expired', null, 'closed' ), 'ignore' );
check( 'unknown event fails closed', GhostPay_Event::order_action( 'invoice.refund', 1, 'awaiting' ), 'ignore' );
check( 'unknown state never pays', GhostPay_Event::order_action( 'invoice.paid', 1, 'bogus' ), 'note' );

// Cross-language signature vector generated by @ghostpay/merchant-hooks.
$secret = implode( '', array_map( 'chr', range( 0, 31 ) ) );
$body = '{"id":"evt_1","type":"invoice.paid","createdAt":1800000000,"data":{"invoiceId":"inv_1","currency":"USD","amountMinor":"1250"}}';
$header = 't=1800000000,n=00112233445566778899aabbccddeeff,v1=121f8b8ccb38cf2f18430b5bfef0e2723e4c10304cc3f650848db7816025ebaa';
$claimed = array();
check( 'signature verifies', GhostPay_Signature::verify( $secret, $body, $header, 1800000000, static function ( string $nonce ) use ( &$claimed ): bool { if ( isset( $claimed[ $nonce ] ) ) { return false; } $claimed[ $nonce ] = true; return true; } ), 'ok' );
check( 'event parser accepts canonical event', is_array( GhostPay_Event::parse( $body ) ), true );
check( 'event parser rejects numeric money', GhostPay_Event::parse( str_replace( '"1250"', '1250', $body ) ), null );
$with_payment = GhostPay_Event::parse( '{"id":"e1","type":"invoice.paid","createdAt":1,"data":{"invoiceId":"i1","currency":"USD","amountMinor":"1250","paymentId":"p1"}}' );
$same_payment_new_event = GhostPay_Event::parse( '{"id":"e2","type":"invoice.paid","createdAt":2,"data":{"invoiceId":"i1","currency":"USD","amountMinor":"1250","paymentId":"p1"}}' );
check( 'event identity excludes transport nonce', GhostPay_Event::identity_keys( GhostPay_Event::parse( $body ) ), array( 'event:inv_1:evt_1' ) );
check( 'same payment with fresh event ID shares transaction claim', GhostPay_Event::identity_keys( $with_payment )[1], GhostPay_Event::identity_keys( $same_payment_new_event )[1] );
check( 'payment status transition gets distinct transaction identity', GhostPay_Event::identity_keys( $with_payment )[1] === GhostPay_Event::identity_keys( array_merge( $with_payment, array( 'type' => 'invoice.partial' ) ) )[1], false );

// ---- Module and webhook controller on SQLite (tests/ps-shim.php; each request runs in tests/request.php) ---------
if ( ! extension_loaded( 'pdo_sqlite' ) ) {
	echo "SKIP module/controller tests: the pdo_sqlite extension is not available\n";
} else {
	$db_file = (string) tempnam( sys_get_temp_dir(), 'ghostpay-ps-test-' );
	putenv( 'GHOSTPAY_TEST_DB=' . $db_file );
	register_shutdown_function(
		static function () use ( $db_file ): void {
			@unlink( $db_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		}
	);
	require __DIR__ . '/ps-shim.php';
	require dirname( __DIR__ ) . '/ghostpay/ghostpay.php';
	ghostpay_test_platform_schema();
	$db     = Db::getInstance();
	$module = new Ghostpay();

	// G3-03: the install DDL and every module/controller query run against one schema, so drift between them (a
	// webhook SELECT of a column the DDL no longer creates made every valid webhook fail) breaks these tests.
	check( 'install runs the module DDL', $module->install(), true );
	$awaiting = (int) Configuration::get( 'GHOSTPAY_OS_AWAITING' );
	check( 'install creates the awaiting state', $awaiting > 0, true );
	foreach ( array( 'PS_OS_PAYMENT' => 2, 'PS_OS_SHIPPING' => 4, 'PS_OS_CANCELED' => 6, 'PS_OS_ERROR' => 8, 'PS_OS_OUTOFSTOCK_PAID' => 9, 'PS_OS_OUTOFSTOCK_UNPAID' => 12 ) as $name => $id ) {
		Configuration::updateValue( $name, $id );
	}
	$webhook_secret = str_repeat( "\x5a", 32 ); // fake
	Configuration::updateValue( 'GHOSTPAY_WEBHOOK_SECRET', bin2hex( $webhook_secret ) );
	$db->execute( "INSERT INTO `ps_currency` (`id_currency`, `iso_code`, `precision`) VALUES (1, 'USD', 2)" );
	$order = static function ( int $id, int $state, string $total = '12.500000', int $currency = 1 ) use ( $db, $module ): void {
		$db->execute( "INSERT INTO `ps_orders` (`id_order`, `id_cart`, `id_customer`, `id_currency`, `module`, `current_state`, `total_paid`) VALUES ($id, $id, 7, $currency, 'ghostpay', $state, '$total')" );
		check( "invoice of order $id recorded", $module->recordInvoice( "inv_ps_$id", $id ), true );
	};
	$event   = static fn( string $id, string $type, string $invoice, string $currency, string $amount ): string => json_encode(
		array( 'id' => $id, 'type' => $type, 'createdAt' => 1800000000, 'data' => array( 'invoiceId' => $invoice, 'currency' => $currency, 'amountMinor' => $amount ) )
	);
	$sign    = static fn( string $body ): string => GhostPay_Signature::sign( $webhook_secret, $body, time(), bin2hex( random_bytes( 16 ) ) );
	$request = static function ( string $body, ?string $signature = null ) use ( $sign ): array {
		$proc = proc_open( array( PHP_BINARY, __DIR__ . '/request.php' ), array( array( 'pipe', 'r' ), array( 'pipe', 'w' ), array( 'pipe', 'w' ) ), $pipes );
		fwrite( $pipes[0], (string) json_encode( array( 'body' => $body, 'signature' => $signature ?? $sign( $body ) ) ) );
		fclose( $pipes[0] );
		$out = (string) stream_get_contents( $pipes[1] );
		$err = (string) stream_get_contents( $pipes[2] );
		fclose( $pipes[1] );
		fclose( $pipes[2] );
		proc_close( $proc );
		$reply = json_decode( $out, true );
		return is_array( $reply ) ? $reply : array( 'status' => 0, 'body' => $out . $err );
	};
	$state   = static fn( int $id ): int => (int) $db->getValue( "SELECT `current_state` FROM `ps_orders` WHERE `id_order` = $id" );
	$history = static fn( int $id ): int => (int) $db->getValue( "SELECT COUNT(*) FROM `ps_order_history` WHERE `id_order` = $id" );
	$notes   = static fn( int $id ): int => (int) $db->getValue( "SELECT COUNT(*) FROM `ps_message` WHERE `id_order` = $id AND `private` = 1" );
	$reply   = static fn( array $r ): string => $r['status'] . ' ' . $r['body'];

	$order( 1, $awaiting );
	$paid1 = $event( 'evt_1', 'invoice.paid', 'inv_ps_1', 'USD', '1250' );
	$sig1  = $sign( $paid1 );
	check( 'valid webhook for an awaiting order is processed', $reply( $request( $paid1, $sig1 ) ), '200 {"ok":true}' );
	check( 'valid webhook marks the order paid', $state( 1 ), 2 );
	check( 'paid state recorded in the order history', $history( 1 ), 1 );
	check( 'replayed signature refused', $reply( $request( $paid1, $sig1 ) ), '400 {"ok":false}' );
	check( 'same event with a fresh nonce is a duplicate', $reply( $request( $paid1 ) ), '200 {"ok":true,"duplicate":true}' );
	check( 'duplicate does not change the order again', $history( 1 ), 1 );
	check( 'unknown invoice acknowledged', $reply( $request( $event( 'evt_u', 'invoice.paid', 'inv_unknown', 'USD', '1250' ) ) ), '200 {"ok":true}' );

	// Order actions: pay only an unpaid order (awaiting; payment error or cancelled, i.e. a late payment as WooCommerce
	// allows; an unpaid backorder); any other payment event leaves the order alone and adds a private note.
	$order( 2, 2 ); // already paid
	check( 'payment for a paid order acknowledged', $reply( $request( $event( 'evt_2', 'invoice.paid', 'inv_ps_2', 'USD', '1250' ) ) ), '200 {"ok":true}' );
	check( 'payment for a paid order: state kept', array( $state( 2 ), $history( 2 ) ), array( 2, 0 ) );
	check( 'payment for a paid order: private note', $notes( 2 ), 1 );
	$order( 3, 4 ); // shipped
	$request( $event( 'evt_3', 'invoice.over', 'inv_ps_3', 'USD', '1300' ) );
	check( 'payment for a shipped order: state kept, noted', array( $state( 3 ), $history( 3 ), $notes( 3 ) ), array( 4, 0, 1 ) );
	$order( 4, 6 ); // cancelled
	$request( $event( 'evt_4', 'invoice.paid', 'inv_ps_4', 'USD', '1250' ) );
	check( 'late full payment pays a cancelled order', $state( 4 ), 2 );
	$order( 5, $awaiting );
	$request( $event( 'evt_5a', 'invoice.paid', 'inv_ps_5', 'USD', '1000' ) );
	check( 'underpayment: payment error state', $state( 5 ), 8 );
	$request( $event( 'evt_5b', 'invoice.paid', 'inv_ps_5', 'USD', '1250' ) );
	check( 'full payment after an underpayment pays the order', $state( 5 ), 2 );
	$order( 6, $awaiting );
	$request( $event( 'evt_6', 'invoice.expired', 'inv_ps_6', 'USD', '0' ) );
	check( 'expiry cancels an awaiting order', $state( 6 ), 6 );
	$order( 7, 12 ); // unpaid backorder
	$request( $event( 'evt_7', 'invoice.paid', 'inv_ps_7', 'USD', '1250' ) );
	check( 'payment of an unpaid backorder: paid backorder state', $state( 7 ), 9 );
	$order( 8, $awaiting );
	$request( $event( 'evt_8', 'invoice.paid', 'inv_ps_8', 'EUR', '1250' ) );
	check( 'currency mismatch: state kept, noted', array( $state( 8 ), $notes( 8 ) ), array( $awaiting, 1 ) );

	// A failed side effect releases the claim (retryable 503); the retry applies the event once.
	$order( 9, 2 );
	$paid9 = $event( 'evt_9', 'invoice.paid', 'inv_ps_9', 'USD', '1250' );
	Configuration::updateValue( 'GHOSTPAY_TEST_FAIL_WRITES', '1' );
	check( 'failed side effect is retryable', $reply( $request( $paid9 ) ), '503 {"ok":false,"retry":true}' );
	Configuration::updateValue( 'GHOSTPAY_TEST_FAIL_WRITES', '0' );
	check( 'retry after a failed side effect is processed', $reply( $request( $paid9 ) ), '200 {"ok":true}' );
	check( 'retry applied the event once', $notes( 9 ), 1 );

	// H-R5: only a duplicate nonce (SQLSTATE 23000) is a replay and a 400. Any other database error at the nonce claim
	// (deadlock, server gone away) says nothing about the request: a retryable 503, and the sender's retry is processed.
	$order( 14, $awaiting );
	$paid14 = $event( 'evt_14', 'invoice.paid', 'inv_ps_14', 'USD', '1250' );
	Configuration::updateValue( 'GHOSTPAY_TEST_FAIL_INSERT', 'ghostpay_nonce' );
	check( 'database error at the nonce claim: retryable 503, not a replay 400', $reply( $request( $paid14 ) ), '503 {"ok":false,"retry":true}' );
	Configuration::deleteByName( 'GHOSTPAY_TEST_FAIL_INSERT' );
	check( 'database error at the nonce claim: order unchanged', $state( 14 ), $awaiting );
	check( 'the retry after the database error is processed', $reply( $request( $paid14 ) ), '200 {"ok":true}' );
	check( 'the retry pays the order', $state( 14 ), 2 );

	// G3-02: amounts use the GhostPay app's minor units of the currency, not the shop's display precision.
	$db->execute( "INSERT INTO `ps_currency` (`id_currency`, `iso_code`, `precision`) VALUES (2, 'JPY', 2), (3, 'USD', 0)" );
	$order( 10, $awaiting, '1500.000000', 2 );
	$request( $event( 'evt_10', 'invoice.paid', 'inv_ps_10', 'JPY', '1500' ) );
	check( 'webhook: JPY 1500 pays a 1500 JPY order (shop shows 2 decimals)', $state( 10 ), 2 );
	$order( 11, $awaiting, '13.000000', 3 );
	$request( $event( 'evt_11a', 'invoice.paid', 'inv_ps_11', 'USD', '13' ) );
	check( 'webhook: USD 0.13 does not pay a 13 USD order (shop shows 0 decimals)', $state( 11 ), 8 );
	$request( $event( 'evt_11b', 'invoice.paid', 'inv_ps_11', 'USD', '1300' ) );
	check( 'webhook: USD 13.00 pays it', $state( 11 ), 2 );
	check( 'order total in minor units ignores the shop precision (JPY)', $module->orderTotalMinor( 10, 'JPY' ), '1500' );
	$order( 12, $awaiting, '12.340000' );
	$order( 13, $awaiting, '12.345000' );
	check( 'order total in minor units: KWD within 2 decimals', $module->orderTotalMinor( 12, 'KWD' ), '1234' );
	check( 'order total in minor units: KWD needing a third decimal is refused', $module->orderTotalMinor( 13, 'KWD' ), null );
	check( 'order total in minor units: unknown order', $module->orderTotalMinor( 999, 'USD' ), null );

	// H-R6: PHP 8 PDO throws on a duplicate key (PrestaShop 8 rethrows it as PrestaShopException). recordInvoice() must
	// return false as documented, so the validation controller cancels the new order instead of answering 500 and
	// leaving it awaiting payment; the invoice stays linked to its first order.
	$record = static function ( string $invoice_id, int $order_id ) use ( $module ) {
		try {
			return $module->recordInvoice( $invoice_id, $order_id );
		} catch ( Throwable $e ) {
			return get_class( $e ) . ': ' . $e->getMessage();
		}
	};
	check( 'duplicate invoice id: recordInvoice() returns false', $record( 'inv_ps_1', 99 ), false );
	check( 'duplicate invoice id: the invoice stays linked to its first order', $db->getValue( "SELECT `id_order` FROM `ps_ghostpay_invoice` WHERE `invoice_id` = 'inv_ps_1'" ), '1' );
	$pdo_error = static function ( string $sql ): PDOException {
		$pdo = new PDO( 'sqlite::memory:' );
		$pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
		$pdo->exec( "CREATE TABLE t (k TEXT PRIMARY KEY); INSERT INTO t VALUES ('a')" );
		try {
			$pdo->exec( $sql );
		} catch ( PDOException $e ) {
			return $e;
		}
		throw new LogicException( 'no PDO error' );
	};
	$duplicate_key = $pdo_error( "INSERT INTO t VALUES ('a')" );
	$no_such_table = $pdo_error( 'SELECT * FROM missing' );
	check( 'isDuplicateKey: PDOException with SQLSTATE 23000', Ghostpay::isDuplicateKey( $duplicate_key ), true );
	check( 'isDuplicateKey: wrapped in a PrestaShopException', Ghostpay::isDuplicateKey( new PrestaShopException( $duplicate_key->getMessage(), 23000, $duplicate_key ) ), true );
	check( 'isDuplicateKey: any other SQL error', Ghostpay::isDuplicateKey( new PrestaShopException( $no_such_table->getMessage(), 0, $no_such_table ) ), false );
	check( 'isDuplicateKey: a non-PDO exception with code 23000', Ghostpay::isDuplicateKey( new RuntimeException( 'x', 23000 ) ), false );

	check( 'uninstall drops the module tables', $module->uninstall(), true );
	check( 'no module table left', $db->getValue( "SELECT COUNT(*) FROM sqlite_master WHERE `name` LIKE 'ps_ghostpay%'" ), '0' );
	check( 'any other database error in recordInvoice() still throws', 0 === strpos( (string) $record( 'inv_ps_x', 98 ), 'PrestaShopException: ' ), true );
}

if ( $failed > 0 ) {
	echo "$failed failure(s)\n";
	exit( 1 );
}
echo "prestashop php tests: ok\n";
