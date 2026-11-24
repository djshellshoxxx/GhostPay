<?php
/** Local platform qualification helper. Requires an isolated disposable WordPress/WooCommerce install. */
if ( PHP_SAPI !== 'cli' || '1' !== getenv( 'GHOSTPAY_DISPOSABLE_SHOP' ) ) {
	throw new RuntimeException( 'Use only with GHOSTPAY_DISPOSABLE_SHOP=1 in a disposable local installation.' );
}
$root = getenv( 'GHOSTPAY_TEST_WP_ROOT' );
if ( ! is_string( $root ) || ! is_file( $root . '/wp-load.php' ) ) {
	throw new RuntimeException( 'Missing local WordPress installation.' );
}
require $root . '/wp-load.php';
if ( '127.0.0.1' !== parse_url( home_url(), PHP_URL_HOST ) || ! WP_HTTP_BLOCK_EXTERNAL || ! DISABLE_WP_CRON ) {
	throw new RuntimeException( 'Fixture must be loopback-only with external HTTP and cron disabled.' );
}
add_filter( 'pre_wp_mail', static fn() => true );
$mode = $argv[1] ?? '';
if ( 'configure' === $mode ) {
	// Pinned qualification harness: synchronize through WooCommerce's own API before switching data stores.
	$sync = wc_get_container()->get( \Automattic\WooCommerce\Internal\DataStores\Orders\DataSynchronizer::class );
	$sync->create_database_tables();
	for ( $batch = 0; $batch < 100; ++$batch ) {
		$ids = $sync->get_next_batch_to_process( 25 );
		if ( array() === $ids ) { break; }
		$sync->process_batch( $ids );
	}
	if ( array() !== $sync->get_next_batch_to_process( 1 ) ) { throw new RuntimeException( 'Fixture order synchronization did not finish' ); }
	update_option( 'woocommerce_custom_orders_table_enabled', ( $argv[2] ?? '' ) === 'hpos' ? 'yes' : 'no' );
	update_option( 'woocommerce_custom_orders_table_data_sync_enabled', 'no' );
	update_option( 'woocommerce_ghostpay_settings', array( 'enabled' => 'yes', 'service_url' => 'https://invoices.example.test', 'pay_host' => 'pay.example.test' ) );
	echo json_encode( array( 'ok' => true ) );
} elseif ( 'create' === $mode ) {
	$tag = $argv[2] ?? '';
	if ( ! preg_match( '/\A[a-z0-9-]+\z/', $tag ) ) { throw new RuntimeException( 'Invalid fixture ID' ); }
	$order = wc_create_order();
	$order->set_currency( 'USD' );
	$order->set_total( '12.50' );
	$order->set_payment_method( 'ghostpay' );
	$order->set_status( $argv[3] ?? 'pending' );
	$order->add_meta_data( '_ghostpay_invoice_id', 'old-' . $tag );
	$order->add_meta_data( '_ghostpay_invoice_id', 'inv-' . $tag );
	$order->save();
	echo json_encode( array( 'id' => $order->get_id(), 'invoiceId' => 'inv-' . $tag, 'hpos' => \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled() ) );
} elseif ( 'inspect' === $mode ) {
	$order = wc_get_order( (int) ( $argv[2] ?? 0 ) );
	if ( ! $order ) { throw new RuntimeException( 'Missing order' ); }
	echo json_encode( array( 'id' => $order->get_id(), 'status' => $order->get_status(), 'transactionId' => $order->get_transaction_id(), 'invoices' => array_map( static fn( $item ) => $item->get_data(), $order->get_meta( '_ghostpay_invoice_id', false ) ), 'notes' => count( wc_get_order_notes( array( 'order_id' => $order->get_id() ) ) ) ) );
 } elseif ( 'checkout' === $mode ) {
	$gateways = WC()->payment_gateways()->payment_gateways();
	$gateway = $gateways['ghostpay'];
	$order = wc_create_order();
	$order->set_currency( 'USD' );
	$order->set_total( '12.50' );
	$order->set_payment_method( 'ghostpay' );
	$order->save();
	$invoice = 'checkout-' . $order->get_id();
	$link = 'https://pay.example.test/#gpi=v1.offline_fixture';
	$verified = false;
	add_filter( 'pre_http_request', static function ( $response, $args, $url ) use ( &$verified, $order, $invoice, $link ) {
		if ( 'https://invoices.example.test/invoices' !== $url ) { return $response; }
		$secret = hex2bin( getenv( 'GHOSTPAY_SERVICE_SECRET' ) );
		$body = json_decode( $args['body'], true );
		$verified = 'ok' === GhostPay_Signature::verify( $secret, $args['body'], $args['headers']['GhostPay-Signature'], time(), static fn() => true )
			&& array( 'orderId' => (string) $order->get_id(), 'currency' => 'USD', 'amountMinor' => '1250', 'expiresInSeconds' => 3600 ) === $body;
		return array( 'response' => array( 'code' => 201 ), 'headers' => array(), 'body' => json_encode( array( 'invoiceId' => $invoice, 'link' => $link ) ) );
	}, 20, 3 );
	$result = $gateway->process_payment( $order->get_id() );
	$order = wc_get_order( $order->get_id() );
	echo json_encode( array( 'id' => $order->get_id(), 'invoiceId' => $invoice, 'signedExactRequest' => $verified, 'redirectAccepted' => array( 'result' => 'success', 'redirect' => $link ) === $result, 'bearerStored' => str_contains( json_encode( $order->get_data() ), $link ) ) );
} elseif ( 'settings' === $mode ) {
	$gateways = WC()->payment_gateways()->payment_gateways();
	$gateway = $gateways['ghostpay'];
	ob_start();
	$gateway->admin_options();
	$html = (string) ob_get_clean();
	echo json_encode( array( 'fieldsRendered' => str_contains( $html, 'woocommerce_ghostpay_service_url' ) && str_contains( $html, 'woocommerce_ghostpay_pay_host' ), 'secretInputs' => str_contains( $html, 'name="woocommerce_ghostpay_service_secret"' ) || str_contains( $html, 'name="woocommerce_ghostpay_webhook_secret"' ) ) );
} else {
	throw new RuntimeException( 'Unknown fixture action' );
}
