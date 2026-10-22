<?php
/**
 * Creates the order (awaiting payment), asks the merchant's invoice service for a payment link, redirects the customer.
 *
 * @package GhostPay_PrestaShop
 */

class GhostpayValidationModuleFrontController extends ModuleFrontController {

	public $ssl = true;

	public function postProcess() {
		// CSRF token from hookPaymentOptions.
		if ( ! hash_equals( Tools::getToken( false ), (string) Tools::getValue( 'token' ) ) ) {
			Tools::redirect( 'index.php?controller=order&step=1' );
		}
		$cart = $this->context->cart;
		if ( ! Validate::isLoadedObject( $cart ) || 0 === (int) $cart->id_customer || 0 === (int) $cart->id_address_invoice || ! $this->module->active ) {
			Tools::redirect( 'index.php?controller=order&step=1' );
		}
		$customer = new Customer( (int) $cart->id_customer );
		$secret   = $this->module->secret( 'service' );
		$base     = (string) Configuration::get( 'GHOSTPAY_SERVICE_URL' );
		$host     = (string) Configuration::get( 'GHOSTPAY_PAY_HOST' );
		$currency = new Currency( (int) $cart->id_currency );
		$total = $cart->getOrderTotal( true, Cart::BOTH );
		if ( null === $secret || '' === $base || '' === $host || ! is_numeric( $total ) || (float) $total <= 0 ) {
			$this->errors[] = $this->trans( 'Payment is temporarily unavailable.', array(), 'Modules.Ghostpay.Shop' );
			$this->redirectWithNotifications( 'index.php?controller=order&step=1' );
		}
		// PrestaShop's cart API exposes a float. Let it create the order, then read the persisted DECIMAL as text and
		// use that exact amount for the invoice request. No float formatting is used for the signed amount.
		$this->module->validateOrder( (int) $cart->id, (int) Configuration::get( 'GHOSTPAY_OS_AWAITING' ), (float) $total, $this->module->displayName, null, array(), (int) $currency->id, false, $customer->secure_key );
		$order_id = (int) $this->module->currentOrder;
		$exact_total = $this->module->exactOrderTotal( $order_id );
		$minor = null === $exact_total ? null : GhostPay_Money::to_minor( $exact_total, (int) $currency->precision );
		if ( null === $minor || '0' === $minor ) {
			$this->cancel_order( $order_id );
			$this->errors[] = $this->trans( 'This order total cannot be represented safely for GhostPay.', array(), 'Modules.Ghostpay.Shop' );
			$this->redirectWithNotifications( 'index.php?controller=order&step=1' );
		}

		$body = json_encode( array( 'orderId' => (string) $order_id, 'currency' => $currency->iso_code, 'amountMinor' => $minor, 'expiresInSeconds' => 3600 ) );
		$sig  = GhostPay_Signature::sign( $secret, $body, time(), bin2hex( random_bytes( 16 ) ) );
		$ch   = curl_init( $base . '/invoices' );
		curl_setopt_array(
			$ch,
			array(
				CURLOPT_POST           => true,
				CURLOPT_POSTFIELDS     => $body,
				CURLOPT_HTTPHEADER     => array( 'Content-Type: application/json', 'GhostPay-Signature: ' . $sig ),
				CURLOPT_RETURNTRANSFER => true,
				CURLOPT_TIMEOUT        => 10,
				CURLOPT_FOLLOWLOCATION => false,
				CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
				CURLOPT_MAXFILESIZE    => 65536,
			)
		);
		$resp = curl_exec( $ch );
		$code = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		curl_close( $ch );
		$data = ( is_string( $resp ) && ( 200 === $code || 201 === $code ) ) ? json_decode( $resp, true, 4 ) : null;
		if ( ! is_array( $data ) || ! isset( $data['invoiceId'], $data['link'] ) || ! is_string( $data['invoiceId'] ) || ! is_string( $data['link'] )
			|| ! preg_match( '/\A[A-Za-z0-9_.:-]{1,128}\z/', $data['invoiceId'] ) || ! self::valid_link( $data['link'], $host ) ) {
			$this->cancel_order( $order_id );
			$this->errors[] = $this->trans( 'Payment could not be started. Please try again.', array(), 'Modules.Ghostpay.Shop' );
			$this->redirectWithNotifications( 'index.php?controller=order&step=1' );
		}
		if ( ! Db::getInstance()->insert( 'ghostpay_invoice', array( 'invoice_id' => pSQL( $data['invoiceId'] ), 'id_order' => $order_id ) ) ) {
			$this->cancel_order( $order_id );
			$this->errors[] = $this->trans( 'Payment could not be started. Please try again.', array(), 'Modules.Ghostpay.Shop' );
			$this->redirectWithNotifications( 'index.php?controller=order&step=1' );
		}
		// The link is a bearer secret: not stored, only sent to the customer's browser.
		Tools::redirectLink( $data['link'] );
	}

	private function cancel_order( int $order_id ): void {
		if ( $order_id <= 0 ) {
			return;
		}
		$order = new Order( $order_id );
		if ( ! Validate::isLoadedObject( $order ) || $order->module !== $this->module->name ) {
			return;
		}
		$history = new OrderHistory();
		$history->id_order = $order_id;
		$history->changeIdOrderState( (int) Configuration::get( 'PS_OS_CANCELED' ), $order );
		$history->addWithemail( true );
	}

	/** https, exact configured host, no credentials/query/port, v1 fragment. */
	public static function valid_link( string $link, string $host ): bool {
		if ( strlen( $link ) > 22000 || false !== strpos( $link, '?' ) ) {
			return false;
		}
		$p = parse_url( $link );
		return is_array( $p ) && 'https' === ( $p['scheme'] ?? '' ) && '' !== $host && strtolower( $p['host'] ?? '' ) === $host
			&& ! isset( $p['user'], $p['pass'], $p['port'], $p['query'] ) && 1 === preg_match( '/\Agpi=v1\.[A-Za-z0-9_-]+\z/', $p['fragment'] ?? '' );
	}
}
