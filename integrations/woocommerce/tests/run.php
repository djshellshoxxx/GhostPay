<?php
/**
 * CLI tests for the WordPress-independent classes. Run: php integrations/woocommerce/tests/run.php
 * The signature vector was produced by signWebhook() from @ghostpay/merchant-hooks (cross-language check).
 * Fake secret and events only.
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

if ( $failed > 0 ) {
	echo "$failed failure(s)\n";
	exit( 1 );
}
echo "woocommerce php tests: ok\n";
