<?php
/**
 * Runs ONE webhook request against the PrestaShop shim in its own process, because the controller ends with exit().
 * Used by tests/run.php. STDIN: {"body": "...", "signature": "...", "define": {"NAME": "value", ...}} ("define": optional
 * constants, as config/defines_custom.inc.php defines them); STDOUT: {"status": <HTTP status>, "body": "..."}.
 */

define( 'GHOSTPAY_CLI_TEST', true );
ini_set( 'display_errors', 'stderr' );
$request = json_decode( (string) stream_get_contents( STDIN ), true );
foreach ( $request['define'] ?? array() as $name => $value ) {
	define( $name, $value );
}
require __DIR__ . '/ps-shim.php';
require dirname( __DIR__ ) . '/ghostpay/ghostpay.php';
require dirname( __DIR__ ) . '/ghostpay/controllers/front/webhook.php';

$_SERVER['REQUEST_METHOD']          = 'POST';
$_SERVER['HTTP_GHOSTPAY_SIGNATURE'] = $request['signature'];
GhostPay_Test_Input::$body          = $request['body'];
stream_wrapper_unregister( 'php' );
stream_wrapper_register( 'php', 'GhostPay_Test_Input' );

ob_start();
register_shutdown_function(
	static function (): void {
		$body   = (string) ob_get_clean();
		$status = http_response_code();
		$error  = error_get_last();
		if ( null !== $error && in_array( $error['type'], array( E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR ), true ) ) {
			$status = 500;
			$body  .= $error['message'];
		}
		fwrite( STDOUT, json_encode( array( 'status' => false === $status ? 500 : $status, 'body' => $body ) ) );
	}
);
try {
	$controller         = new GhostpayWebhookModuleFrontController();
	$controller->module = new Ghostpay();
	$controller->postProcess();
} catch ( Throwable $e ) {
	http_response_code( 500 ); // what the web server answers for an uncaught exception
	echo get_class( $e ) . ': ' . $e->getMessage();
}
