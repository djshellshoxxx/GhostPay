<?php
/**
 * POST /module/ghostpay/webhook : signed GhostPay webhook. Authenticated by HMAC, so no CSRF token applies.
 *
 * @package GhostPay_PrestaShop
 */

class GhostpayWebhookModuleFrontController extends ModuleFrontController {

	public $ssl = true;
	public $auth = false;
	public $ajax = true;

	private function out( int $status, array $body ): void {
		http_response_code( $status );
		header( 'Content-Type: application/json' );
		header( 'Cache-Control: no-store' );
		echo json_encode( $body );
		exit;
	}

	public function postProcess() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			$this->out( 405, array( 'ok' => false ) );
		}
		$secret = $this->module->secret( 'webhook' );
		$header = (string) ( $_SERVER['HTTP_GHOSTPAY_SIGNATURE'] ?? '' );
		$body   = (string) file_get_contents( 'php://input', false, null, 0, 65537 );
		if ( null === $secret || strlen( $body ) > 65536 ) {
			$this->out( 400, array( 'ok' => false ) );
		}
		$db  = Db::getInstance();
		$res = GhostPay_Signature::verify(
			$secret,
			$body,
			$header,
			time(),
			static function ( string $nonce, int $expires ) use ( $db ): bool {
				$db->execute( 'DELETE FROM `' . _DB_PREFIX_ . 'ghostpay_nonce` WHERE `expires` < ' . (int) time() );
				// Duplicate primary key => insert fails => replay. Fails closed on DB error.
				return (bool) @$db->insert( 'ghostpay_nonce', array( 'nonce' => pSQL( $nonce ), 'expires' => (int) $expires ), false, false );
			}
		);
		$event = 'ok' === $res ? GhostPay_Event::parse( $body ) : null;
		if ( null === $event ) {
			$this->out( 400, array( 'ok' => false ) );
		}
		$row = $db->getRow( 'SELECT `id_order`, `event_ids` FROM `' . _DB_PREFIX_ . 'ghostpay_invoice` WHERE `invoice_id` = \'' . pSQL( $event['data']['invoiceId'] ) . '\'' );
		if ( ! $row ) {
			$this->out( 200, array( 'ok' => true ) ); // unknown invoice: acknowledge.
		}
		$seen = json_decode( (string) $row['event_ids'], true );
		$seen = is_array( $seen ) ? $seen : array();
		if ( in_array( $event['id'], $seen, true ) ) {
			$this->out( 200, array( 'ok' => true, 'duplicate' => true ) );
		}
		$order = new Order( (int) $row['id_order'] );
		if ( ! Validate::isLoadedObject( $order ) || $order->module !== $this->module->name ) {
			$this->out( 200, array( 'ok' => true ) );
		}
		$currency = new Currency( (int) $order->id_currency );
		$due      = GhostPay_Money::to_minor( number_format( (float) $order->total_paid, (int) $currency->precision, '.', '' ), (int) $currency->precision );
		$cmp      = null === $due ? null : GhostPay_Money::compare( $event['data']['amountMinor'], $due );
		if ( $event['data']['currency'] === $currency->iso_code && null !== $cmp ) {
			if ( in_array( $event['type'], array( 'invoice.paid', 'invoice.over' ), true ) && $cmp >= 0 ) {
				$history = new OrderHistory();
				$history->id_order = (int) $order->id;
				$history->changeIdOrderState( (int) Configuration::get( 'PS_OS_PAYMENT' ), $order );
				$history->addWithemail( true );
			}
			// TODO(skeleton): below-total payments, partial and expired events: add order messages / cancel state.
		}
		$seen[] = $event['id'];
		$db->update( 'ghostpay_invoice', array( 'event_ids' => pSQL( json_encode( array_slice( $seen, -50 ) ) ) ), '`invoice_id` = \'' . pSQL( $event['data']['invoiceId'] ) . '\'' );
		$this->out( 200, array( 'ok' => true ) );
	}
}
