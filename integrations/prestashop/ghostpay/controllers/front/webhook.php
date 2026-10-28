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

	/** Claim event and provider-transaction identities atomically with recoverable leases. */
	private function claim_delivery( Db $db, array $event ): array {
		$keys = array_map( static fn( string $identity ): string => hash( 'sha256', $identity ), GhostPay_Event::identity_keys( $event ) );
		$token = bin2hex( random_bytes( 16 ) );
		$now = time();
		if ( ! $db->execute( 'START TRANSACTION' ) ) {
			return array( 'status' => 'error' );
		}
		foreach ( $keys as $key ) {
			$sql = 'INSERT INTO `' . _DB_PREFIX_ . 'ghostpay_event_claim` (`claim_key`,`claim_token`,`claim_state`,`lease_until`) VALUES (\'' . pSQL( $key ) . '\',\'' . pSQL( $token ) . '\',\'processing\',' . ( $now + 900 ) . ') ON DUPLICATE KEY UPDATE `claim_token`=IF(`claim_state`=\'processing\' AND `lease_until`<' . $now . ',VALUES(`claim_token`),`claim_token`),`lease_until`=IF(`claim_state`=\'processing\' AND `lease_until`<' . $now . ',VALUES(`lease_until`),`lease_until`)';
			if ( ! $db->execute( $sql ) ) {
				$db->execute( 'ROLLBACK' );
				return array( 'status' => 'error' );
			}
			$row = $db->getRow( 'SELECT `claim_token`,`claim_state`,`lease_until` FROM `' . _DB_PREFIX_ . 'ghostpay_event_claim` WHERE `claim_key`=\'' . pSQL( $key ) . '\'' );
			if ( ! $row || 'complete' === $row['claim_state'] || $token !== $row['claim_token'] ) {
				$db->execute( 'ROLLBACK' );
				return array( 'status' => $row && 'complete' === $row['claim_state'] ? 'duplicate' : ( $row ? 'busy' : 'error' ) );
			}
		}
		if ( ! $db->execute( 'COMMIT' ) ) {
			$db->execute( 'ROLLBACK' );
			return array( 'status' => 'error' );
		}
		return array( 'status' => 'claimed', 'keys' => $keys, 'token' => $token );
	}

	private function finish_delivery( Db $db, array $claim, bool $complete ): bool {
		$token = pSQL( $claim['token'] );
		$ok = true;
		foreach ( $claim['keys'] as $key ) {
			$where = '`claim_key`=\'' . pSQL( $key ) . '\' AND `claim_token`=\'' . $token . '\'';
			$sql = $complete
				? 'UPDATE `' . _DB_PREFIX_ . 'ghostpay_event_claim` SET `claim_state`=\'complete\',`lease_until`=0 WHERE ' . $where
				: 'DELETE FROM `' . _DB_PREFIX_ . 'ghostpay_event_claim` WHERE ' . $where;
			$ok = $db->execute( $sql ) && $ok;
		}
		return $ok;
	}

	/** Move the order to the state stored under $state_key. */
	private function set_state( Order $order, string $state_key ): bool {
		$history = new OrderHistory();
		$history->id_order = (int) $order->id;
		// changeIdOrderState() returns nothing (it dies or throws on failure); addWithemail() saves the history row.
		$history->changeIdOrderState( (int) Configuration::get( $state_key ), $order );
		return (bool) $history->addWithemail( true );
	}

	/** Private order message for the merchant, stored like PaymentModule::validateOrder() stores its message. */
	private function add_note( Order $order, string $text ): bool {
		$message = new Message();
		$message->message = $text;
		$message->id_cart = (int) $order->id_cart;
		$message->id_customer = (int) $order->id_customer;
		$message->id_order = (int) $order->id;
		$message->private = 1;
		return (bool) $message->add();
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
				// Duplicate primary key => insert fails => replay. Fails closed on DB error, also when PDO throws the
				// duplicate key (PHP 8 default) instead of returning false.
				try {
					return (bool) @$db->insert( 'ghostpay_nonce', array( 'nonce' => pSQL( $nonce ), 'expires' => (int) $expires ), false, false );
				} catch ( Exception $e ) {
					return false;
				}
			}
		);
		$event = 'ok' === $res ? GhostPay_Event::parse( $body ) : null;
		if ( null === $event ) {
			$this->out( 400, array( 'ok' => false ) );
		}
		$row = $db->getRow( 'SELECT `id_order` FROM `' . _DB_PREFIX_ . 'ghostpay_invoice` WHERE `invoice_id` = \'' . pSQL( $event['data']['invoiceId'] ) . '\'' );
		if ( ! $row ) {
			$this->out( 200, array( 'ok' => true ) ); // unknown invoice: acknowledge.
		}
		$claim = $this->claim_delivery( $db, $event );
		if ( 'duplicate' === $claim['status'] ) {
			$this->out( 200, array( 'ok' => true, 'duplicate' => true ) );
		}
		if ( 'claimed' !== $claim['status'] ) {
			$this->out( 503, array( 'ok' => false, 'retry' => true ) );
		}
		$order = new Order( (int) $row['id_order'] );
		if ( ! Validate::isLoadedObject( $order ) || $order->module !== $this->module->name ) {
			$this->finish_delivery( $db, $claim, true );
			$this->out( 200, array( 'ok' => true ) );
		}
		$currency = new Currency( (int) $order->id_currency );
		$due      = $this->module->orderTotalMinor( (int) $order->id, (string) $currency->iso_code ); // same units as the invoice
		$cmp      = null === $due ? null : GhostPay_Money::compare( $event['data']['amountMinor'], $due );
		$state_id  = (int) $order->current_state;
		$backorder = $state_id === (int) Configuration::get( 'PS_OS_OUTOFSTOCK_UNPAID' );
		if ( $state_id === (int) Configuration::get( 'GHOSTPAY_OS_AWAITING' ) ) {
			$state = 'awaiting';
		} elseif ( $backorder || in_array( $state_id, array( (int) Configuration::get( 'PS_OS_ERROR' ), (int) Configuration::get( 'PS_OS_CANCELED' ) ), true ) ) {
			$state = 'unpaid';
		} else {
			$state = 'closed'; // paid, shipped, refunded, ...: never changed by a webhook.
		}
		$action = $event['data']['currency'] === $currency->iso_code
			? GhostPay_Event::order_action( $event['type'], $cmp, $state )
			: 'note';
		$side_effect_ok = true;
		switch ( $action ) {
			case 'paid':
				$side_effect_ok = $this->set_state( $order, $backorder ? 'PS_OS_OUTOFSTOCK_PAID' : 'PS_OS_PAYMENT' );
				break;
			case 'hold':
				$side_effect_ok = $this->set_state( $order, 'PS_OS_ERROR' );
				break;
			case 'cancel':
				$side_effect_ok = $this->set_state( $order, 'PS_OS_CANCELED' );
				break;
			case 'note':
				$side_effect_ok = $this->add_note(
					$order,
					$this->trans(
						'GhostPay %type% event %event% (%amount% %currency% minor units) did not change this order. Check it manually and refund a double payment if needed.',
						array( '%type%' => $event['type'], '%event%' => $event['id'], '%amount%' => $event['data']['amountMinor'], '%currency%' => $event['data']['currency'] ),
						'Modules.Ghostpay.Admin'
					)
				);
				break;
			case 'partial':
				// A partial payment remains unpaid and awaiting; later paid events may complete it.
			case 'ignore':
			default:
				break;
		}
		if ( ! $side_effect_ok || ! $this->finish_delivery( $db, $claim, true ) ) {
			$this->finish_delivery( $db, $claim, false );
			$this->out( 503, array( 'ok' => false, 'retry' => true ) );
		}
		$this->out( 200, array( 'ok' => true ) );
	}
}
