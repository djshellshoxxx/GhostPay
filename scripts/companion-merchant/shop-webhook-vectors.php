<?php
/** Shared PHP consumers of the B3 TypeScript/Python exact-byte fixture contract. Test-only; never packaged. */
$fixture_path = dirname( __DIR__, 2 ) . '/packages/merchant-hooks/test-vectors/webhooks.json';
$fixture = json_decode( (string) file_get_contents( $fixture_path ), true, 8, JSON_THROW_ON_ERROR );
check( 'shared fixture version', $fixture['version'], 1 );
foreach ( $fixture['vectors'] as $vector ) {
	$label = 'shared ' . $vector['name'];
	$key = hex2bin( $vector['secretHex'] );
	$raw = hex2bin( $vector['bodyHex'] );
	check( $label . ' preserves exact UTF-8 bytes', $raw, $vector['body'] );
	check( $label . ' independently fixed MAC', GhostPay_Signature::sign( $key, $raw, $vector['now'], $vector['nonce'] ), $vector['header'] );
	$seen = array();
	$claim_vector = static function ( string $nonce, int $expires ) use ( &$seen ): bool {
		if ( isset( $seen[ $nonce ] ) ) { return false; }
		$seen[ $nonce ] = $expires;
		return true;
	};
	check( $label . ' refuses altered raw bytes', GhostPay_Signature::verify( $key, $raw . ' ', $vector['header'], $vector['now'], $claim_vector ), 'bad-signature' );
	check( $label . ' bad MAC does not claim nonce', count( $seen ), 0 );
	check( $label . ' accepts exact bytes', GhostPay_Signature::verify( $key, $raw, $vector['header'], $vector['now'], $claim_vector ), 'ok' );
	check( $label . ' refuses replay', GhostPay_Signature::verify( $key, $raw, $vector['header'], $vector['now'], $claim_vector ), 'replay' );
	check( $label . ' refuses stale timestamp', GhostPay_Signature::verify( $key, $raw, $vector['header'], $vector['now'] + 301, $claim_vector ), 'stale' );
}
unset( $fixture, $vector, $key, $raw, $seen, $claim_vector );
