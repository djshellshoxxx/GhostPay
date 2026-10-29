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
	$webhook_secret = str_repeat( "\x5a", 32 ); // fake; configured in the environment below (H-R4)
	$db->execute( "INSERT INTO `ps_currency` (`id_currency`, `iso_code`, `precision`) VALUES (1, 'USD', 2)" );
	$order = static function ( int $id, int $state, string $total = '12.500000', int $currency = 1 ) use ( $db, $module ): void {
		$db->execute( "INSERT INTO `ps_orders` (`id_order`, `id_cart`, `id_customer`, `id_currency`, `module`, `current_state`, `total_paid`) VALUES ($id, $id, 7, $currency, 'ghostpay', $state, '$total')" );
		check( "invoice of order $id recorded", $module->recordInvoice( "inv_ps_$id", $id ), true );
	};
	$event   = static fn( string $id, string $type, string $invoice, string $currency, string $amount ): string => json_encode(
		array( 'id' => $id, 'type' => $type, 'createdAt' => 1800000000, 'data' => array( 'invoiceId' => $invoice, 'currency' => $currency, 'amountMinor' => $amount ) )
	);
	$sign    = static fn( string $body ): string => GhostPay_Signature::sign( $webhook_secret, $body, time(), bin2hex( random_bytes( 16 ) ) );
	$request = static function ( string $body, ?string $signature = null, array $define = array() ) use ( $sign ): array {
		$proc = proc_open( array( PHP_BINARY, __DIR__ . '/request.php' ), array( array( 'pipe', 'r' ), array( 'pipe', 'w' ), array( 'pipe', 'w' ) ), $pipes );
		fwrite( $pipes[0], (string) json_encode( array( 'body' => $body, 'signature' => $signature ?? $sign( $body ), 'define' => $define ) ) );
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
	$reply   = static fn( array $r ): string => $r['status'] . ' ' . $r['body'];
	$db->execute( "INSERT INTO `ps_customer` (`id_customer`, `firstname`, `lastname`, `email`) VALUES (7, 'Ann', 'Example', 'ann@example.test')" );

	// H-R2: notes for the merchant must be where the PrestaShop 8 order page reads messages. Its query, verbatim from
	// CustomerDataProvider::getCustomerMessages() (PrestaShop 8.1.7) for the order's customer and id: the messages of
	// the order's customer threads (the legacy ps_message table is not shown there).
	$order_page = static function ( int $id ) use ( $db ): array {
		$customer_id = (int) $db->getValue( "SELECT `id_customer` FROM `ps_orders` WHERE `id_order` = $id" );
		return $db->executeS(
			'SELECT cm.*, c.`firstname` AS cfirstname, c.`lastname` AS clastname,
			e.`firstname` AS efirstname, e.`lastname` AS elastname
			FROM ' . _DB_PREFIX_ . 'customer_thread ct
			LEFT JOIN ' . _DB_PREFIX_ . 'customer_message cm
				ON ct.id_customer_thread = cm.id_customer_thread
			LEFT JOIN `' . _DB_PREFIX_ . 'customer` c
				ON ct.`id_customer` = c.`id_customer`
			LEFT OUTER JOIN `' . _DB_PREFIX_ . 'employee` e
				ON e.`id_employee` = cm.`id_employee`
			WHERE ct.id_customer = ' . $customer_id . ' AND ct.`id_order` = ' . $id . ' GROUP BY cm.id_customer_message
			ORDER BY cm.date_add DESC'
		);
	};
	// The customer's order history (storefront) shows CustomerMessage::getMessagesByOrderId( $id, false ): verbatim.
	$storefront = static fn( int $id ): array => $db->executeS(
		'SELECT cm.*,
			c.`firstname` AS cfirstname,
			c.`lastname` AS clastname,
			e.`firstname` AS efirstname,
			e.`lastname` AS elastname,
			(COUNT(cm.id_customer_message) = 0 AND ct.id_customer != 0) AS is_new_for_me
		FROM `' . _DB_PREFIX_ . 'customer_message` cm
		LEFT JOIN `' . _DB_PREFIX_ . 'customer_thread` ct
			ON ct.`id_customer_thread` = cm.`id_customer_thread`
		LEFT JOIN `' . _DB_PREFIX_ . 'customer` c
			ON ct.`id_customer` = c.`id_customer`
		LEFT OUTER JOIN `' . _DB_PREFIX_ . 'employee` e
			ON e.`id_employee` = cm.`id_employee`
		WHERE ct.id_order = ' . $id . '
		AND cm.`private` = 0
		GROUP BY cm.id_customer_message
		ORDER BY cm.date_add DESC'
	);
	$notes   = static fn( int $id ): int => count( array_filter( $order_page( $id ), static fn( array $m ): bool => '1' === $m['private'] ) );
	$threads = static fn( int $id ): int => (int) $db->getValue( "SELECT COUNT(*) FROM `ps_customer_thread` WHERE `id_order` = $id" );

	// H-R4: secrets come only from constants (config/defines_custom.inc.php, which PrestaShop's config/config.inc.php
	// includes) or the environment, never from Configuration: ps_configuration is copied into every database backup and
	// served by the webservice API (configurations resource), and the webhook secret alone lets anyone forge invoice.paid.
	putenv( 'GHOSTPAY_SERVICE_SECRET' );
	putenv( 'GHOSTPAY_WEBHOOK_SECRET' );
	$old_service = str_repeat( 'a1', 32 ); // fake hex secrets, as the settings form of earlier versions stored them
	$old_webhook = str_repeat( 'b2', 32 );
	$new_service = str_repeat( 'd4', 32 );
	$sign_with   = static fn( string $secret_hex, string $body ): string => GhostPay_Signature::sign( hex2bin( $secret_hex ), $body, time(), bin2hex( random_bytes( 16 ) ) );
	$retry       = '503 {"ok":false,"retry":true}';
	Configuration::updateValue( 'GHOSTPAY_SERVICE_SECRET', $old_service );
	Configuration::updateValue( 'GHOSTPAY_WEBHOOK_SECRET', $old_webhook );
	check( 'a service secret stored in Configuration is not used', $module->secret( 'service' ), null );
	check( 'a webhook secret stored in Configuration is not used', $module->secret( 'webhook' ), null );
	$upgraded = new Ghostpay(); // the upgrade step runs whenever the module is loaded
	check( 'upgrade deletes the stored secrets', array( Configuration::get( 'GHOSTPAY_SERVICE_SECRET' ), Configuration::get( 'GHOSTPAY_WEBHOOK_SECRET' ) ), array( false, false ) );
	$raw = (string) $db->getValue( 'SELECT group_concat(`value`) FROM `ps_configuration`' );
	check( 'no copy of a stored secret is left in the configuration', str_contains( $raw, $old_service ) || str_contains( $raw, $old_webhook ), false );
	check( 'the module warns to rotate both secrets (Module Manager alert)', str_contains( (string) $upgraded->warning, 'GHOSTPAY_SERVICE_SECRET' ) && str_contains( (string) $upgraded->warning, 'GHOSTPAY_WEBHOOK_SECRET' ), true );
	check( 'the configuration page shows the warning', str_contains( $upgraded->getContent(), 'module_warning' ), true );
	// As in WooCommerce (H-R1): no valid webhook secret is a retryable 503, the same for every request; a 4xx may be
	// final for the sender and lose the payments made until the secret is set.
	$order( 20, $awaiting );
	$paid20 = $event( 'evt_20', 'invoice.paid', 'inv_ps_20', 'USD', '1250' );
	check( 'no webhook secret configured: a webhook signed with the stored secret gets a retryable 503', $reply( $request( $paid20, $sign_with( $old_webhook, $paid20 ) ) ), $retry );
	check( 'no webhook secret configured: an unsigned request gets the same 503', $reply( $request( $paid20, '' ) ), $retry );
	check( 'a forged webhook does not pay the order', $state( 20 ), $awaiting );
	// The settings form has no secret fields: submitted ones are ignored.
	Tools::$values = array( 'submitGhostpay' => '1', 'GHOSTPAY_SERVICE_URL' => 'https://invoices.shop.test', 'GHOSTPAY_PAY_HOST' => 'pay.example.test', 'GHOSTPAY_SERVICE_SECRET' => $new_service, 'GHOSTPAY_WEBHOOK_SECRET' => $new_service );
	$upgraded->getContent();
	Tools::$values = array();
	check( 'settings form saves the service URL and pay host', array( Configuration::get( 'GHOSTPAY_SERVICE_URL' ), Configuration::get( 'GHOSTPAY_PAY_HOST' ) ), array( 'https://invoices.shop.test', 'pay.example.test' ) );
	check( 'settings form stores no secret', array( Configuration::get( 'GHOSTPAY_SERVICE_SECRET' ), Configuration::get( 'GHOSTPAY_WEBHOOK_SECRET' ) ), array( false, false ) );
	putenv( 'GHOSTPAY_SERVICE_SECRET=' . strtoupper( $old_service ) ); // the exposed value, merely moved
	putenv( 'GHOSTPAY_WEBHOOK_SECRET=' . bin2hex( $webhook_secret ) );
	$warning = (string) ( new Ghostpay() )->warning;
	check( 'warning stays while the exposed service secret is still configured', str_contains( $warning, 'GHOSTPAY_SERVICE_SECRET' ), true );
	check( 'a rotated webhook secret leaves the warning', str_contains( $warning, 'GHOSTPAY_WEBHOOK_SECRET' ), false );
	putenv( 'GHOSTPAY_SERVICE_SECRET=' . $new_service );
	check( 'no warning once both secrets are rotated', array( ( new Ghostpay() )->warning, ( new Ghostpay() )->getContent() ), array( null, '' ) );
	check( 'exposure record removed after rotation', Configuration::get( 'GHOSTPAY_EXPOSED_SECRETS' ), false );
	check( 'the service secret comes from the environment', $module->secret( 'service' ), hex2bin( $new_service ) );
	check( 'with a secret configured, a bad signature is a 400', $reply( $request( $paid20, $sign_with( $old_webhook, $paid20 ) ) ), '400 {"ok":false}' );
	check( 'the sender retry of the upgrade-window payment is processed', $reply( $request( $paid20 ) ), '200 {"ok":true}' );
	check( 'that webhook pays the order', $state( 20 ), 2 );
	$order( 21, $awaiting );
	$paid21   = $event( 'evt_21', 'invoice.paid', 'inv_ps_21', 'USD', '1250' );
	$constant = array( 'GHOSTPAY_WEBHOOK_SECRET' => str_repeat( 'e5', 32 ) ); // as config/defines_custom.inc.php defines it
	check( 'environment secret ignored once the constant is defined', $reply( $request( $paid21, null, $constant ) ), '400 {"ok":false}' );
	check( 'webhook secret from the constant', $reply( $request( $paid21, $sign_with( str_repeat( 'e5', 32 ), $paid21 ), $constant ) ), '200 {"ok":true}' );
	// The upgrade step can stop at any database query: it must never delete a secret it has not recorded for rotation.
	for ( $step = 1; ; ++$step ) {
		Configuration::deleteByName( 'GHOSTPAY_EXPOSED_SECRETS' );
		Configuration::updateValue( 'GHOSTPAY_SERVICE_SECRET', $old_service );
		Configuration::updateValue( 'GHOSTPAY_WEBHOOK_SECRET', $old_webhook );
		Db::$queries = 0;
		Db::$stop_at = $step;
		try {
			new Ghostpay();
			$stopped = false;
		} catch ( RuntimeException $e ) {
			$stopped = true;
		} finally {
			Db::$stop_at = 0;
		}
		if ( ! $stopped ) {
			break;
		}
		$recorded = json_decode( (string) Configuration::get( 'GHOSTPAY_EXPOSED_SECRETS' ), true );
		foreach ( array( 'SERVICE' => $old_service, 'WEBHOOK' => $old_webhook ) as $which => $hex ) {
			$kept = $hex === Configuration::get( "GHOSTPAY_{$which}_SECRET" ) || in_array( hash( 'sha256', $hex ), (array) ( $recorded[ strtolower( $which ) ] ?? array() ), true );
			check( "upgrade step stopped at query $step: the $which secret is still stored or recorded", $kept, true );
		}
	}
	check( 'the interruption test covered the upgrade step queries', $step > 4, true );
	check( 'after the completed upgrade step no secret is stored', array( Configuration::get( 'GHOSTPAY_SERVICE_SECRET' ), Configuration::get( 'GHOSTPAY_WEBHOOK_SECRET' ) ), array( false, false ) );

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
	$page = $order_page( 2 );
	check( 'the note is on the PS 8 order page: private, no employee (a webhook has none), GhostPay text', array( count( $page ), $page[0]['private'] ?? null, $page[0]['id_employee'] ?? null, str_starts_with( (string) ( $page[0]['message'] ?? '' ), 'GhostPay invoice.paid event evt_2 ' ) ), array( 1, '1', '0', true ) );
	check( 'the note is not shown to the customer', $storefront( 2 ), array() );
	$request( $event( 'evt_2b', 'invoice.over', 'inv_ps_2', 'USD', '1300' ) );
	check( 'a second note goes into the same order thread', array( $notes( 2 ), $threads( 2 ) ), array( 2, 1 ) );
	$order( 3, 4 ); // shipped; the customer left a message at checkout, which PaymentModule::validateOrder() put in a thread
	$db->execute( "INSERT INTO `ps_customer_thread` (`id_shop`, `id_lang`, `id_contact`, `id_customer`, `id_order`, `status`, `email`, `token`) VALUES (1, 1, 0, 7, 3, 'open', 'ann@example.test', 'tok3')" );
	$db->execute( "INSERT INTO `ps_customer_message` (`id_customer_thread`, `id_employee`, `message`, `private`, `date_add`) VALUES (last_insert_rowid(), 0, 'Please ring twice', 0, '2026-01-01 00:00:00')" );
	$request( $event( 'evt_3', 'invoice.over', 'inv_ps_3', 'USD', '1300' ) );
	check( 'payment for a shipped order: state kept, noted', array( $state( 3 ), $history( 3 ), $notes( 3 ) ), array( 4, 0, 1 ) );
	check( 'the note joins the order thread found by PrestaShop (email, shop, order)', array( $threads( 3 ), count( $order_page( 3 ) ), count( $storefront( 3 ) ) ), array( 1, 2, 1 ) );
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
	// H-R7: the double-payment/refund wording only for payment events (paid, over). An expiry or a partial payment in
	// another currency gets a neutral "ignored: currency mismatch" note, as in WooCommerce.
	$note_text = static fn( int $id ): string => implode( "\n", array_column( $order_page( $id ), 'message' ) );
	check( 'payment in another currency: refund wording', str_contains( $note_text( 8 ), 'refund' ), true );
	$order( 15, $awaiting );
	$request( $event( 'evt_15e', 'invoice.expired', 'inv_ps_15', 'EUR', '0' ) );
	check( 'expiry in another currency: order not cancelled', $state( 15 ), $awaiting );
	check( 'expiry in another currency: neutral note, no refund wording', array( $notes( 15 ), str_contains( $note_text( 15 ), 'ignored: currency mismatch' ), str_contains( $note_text( 15 ), 'refund' ) ), array( 1, true, false ) );
	$request( $event( 'evt_15p', 'invoice.partial', 'inv_ps_15', 'EUR', '500' ) );
	check( 'partial payment in another currency: neutral note, no refund wording', array( $notes( 15 ), substr_count( $note_text( 15 ), 'ignored: currency mismatch' ), str_contains( $note_text( 15 ), 'refund' ) ), array( 2, 2, false ) );

	// A failed side effect releases the claim (retryable 503); the retry applies the event once.
	$order( 9, 2 );
	$paid9 = $event( 'evt_9', 'invoice.paid', 'inv_ps_9', 'USD', '1250' );
	Configuration::updateValue( 'GHOSTPAY_TEST_FAIL_WRITES', '1' );
	check( 'failed side effect is retryable', $reply( $request( $paid9 ) ), '503 {"ok":false,"retry":true}' );
	check( 'a failed note leaves no thread behind', $threads( 9 ), 0 );
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

	// A thread without a message gives the PS 8 order page a row whose message is NULL (OrderMessageForViewing takes a
	// string): every thread the module wrote must have its note.
	check( 'no customer thread without a message', $db->getValue( 'SELECT COUNT(*) FROM `ps_customer_thread` ct WHERE NOT EXISTS (SELECT 1 FROM `ps_customer_message` cm WHERE cm.`id_customer_thread` = ct.`id_customer_thread`)' ), '0' );

	Configuration::updateGlobalValue( 'GHOSTPAY_EXPOSED_SECRETS', '{"service":["' . hash( 'sha256', $old_service ) . '"]}' );
	check( 'uninstall drops the module tables', $module->uninstall(), true );
	check( 'uninstall removes the exposure record', Configuration::get( 'GHOSTPAY_EXPOSED_SECRETS' ), false );
	check( 'no module table left', $db->getValue( "SELECT COUNT(*) FROM sqlite_master WHERE `name` LIKE 'ps_ghostpay%'" ), '0' );
	check( 'any other database error in recordInvoice() still throws', 0 === strpos( (string) $record( 'inv_ps_x', 98 ), 'PrestaShopException: ' ), true );
}

if ( $failed > 0 ) {
	echo "$failed failure(s)\n";
	exit( 1 );
}
echo "prestashop php tests: ok\n";
