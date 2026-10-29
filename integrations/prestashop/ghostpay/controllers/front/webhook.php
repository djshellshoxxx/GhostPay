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

	/**
	 * Private note for the merchant where the PrestaShop 8 order page lists messages (the order's customer threads, not
	 * the legacy ps_message table): a CustomerMessage in the order's CustomerThread, found or created as PrestaShop's
	 * AddOrderCustomerMessageHandler does. It has no employee (a webhook has none), so PrestaShop shows it in the
	 * customer's style; private keeps it out of the customer's order history. One transaction: a thread without its
	 * message would break the order page.
	 */
	private function add_note( Order $order, string $text ): bool {
		$db        = Db::getInstance();
		$customer  = new Customer( (int) $order->id_customer );
		$thread_id = (int) CustomerThread::getIdCustomerThreadByEmailAndIdOrder( (string) $customer->email, (int) $order->id );
		if ( ! $db->execute( 'START TRANSACTION' ) ) {
			return false;
		}
		if ( 0 === $thread_id ) {
			$thread = new CustomerThread();
			$thread->id_contact = 0;
			$thread->id_customer = (int) $order->id_customer;
			$thread->id_shop = (int) $this->context->shop->id;
			$thread->id_order = (int) $order->id;
			$thread->id_lang = (int) $order->id_lang;
			$thread->email = (string) $customer->email;
			$thread->status = 'open';
			$thread->token = Tools::passwdGen( 12 );
			$thread_id = $thread->add() ? (int) $thread->id : 0;
		}
		$message = new CustomerMessage();
		$message->id_customer_thread = $thread_id;
		$message->id_employee = 0;
		$message->message = $text;
		$message->private = 1;
		if ( 0 === $thread_id || ! $message->add() || ! $db->execute( 'COMMIT' ) ) {
			$db->execute( 'ROLLBACK' );
			return false;
		}
		return true;
	}

	public function postProcess() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			$this->out( 405, array( 'ok' => false ) );
		}
		$secret = $this->module->secret( 'webhook' );
		if ( null === $secret ) {
			// No valid secret configured (e.g. upgraded, the constant or environment not set yet): a server
			// misconfiguration, not a bad request, answered the same for every request. 503 keeps the sender retrying.
			$this->out( 503, array( 'ok' => false, 'retry' => true ) );
		}
		$header = (string) ( $_SERVER['HTTP_GHOSTPAY_SIGNATURE'] ?? '' );
		$body   = (string) file_get_contents( 'php://input', false, null, 0, 65537 );
		if ( strlen( $body ) > 65536 ) {
			$this->out( 400, array( 'ok' => false ) );
		}
		$db       = Db::getInstance();
		$db_error = false;
		$res      = GhostPay_Signature::verify(
			$secret,
			$body,
			$header,
			time(),
			static function ( string $nonce, int $expires ) use ( $db, &$db_error ): bool {
				// Duplicate primary key => insert fails => replay, also when PDO throws it (PHP 8 default; PrestaShop
				// rethrows it as PrestaShopException). Any other database error (deadlock, server gone away) is not a
				// replay: the claim fails closed and the request is answered 503 below so the sender retries.
				try {
					$db->execute( 'DELETE FROM `' . _DB_PREFIX_ . 'ghostpay_nonce` WHERE `expires` < ' . (int) time() );
					return (bool) @$db->insert( 'ghostpay_nonce', array( 'nonce' => pSQL( $nonce ), 'expires' => (int) $expires ), false, false );
				} catch ( Exception $e ) {
					$db_error = ! Ghostpay::isDuplicateKey( $e );
					return false;
				}
			}
		);
		if ( $db_error ) {
			$this->out( 503, array( 'ok' => false, 'retry' => true ) ); // reached only with a valid signature
		}
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
		// Another currency never changes the order. A payment (paid, over) gets the manual check / refund note; any other
		// event only a neutral one.
		if ( $event['data']['currency'] === $currency->iso_code ) {
			$action = GhostPay_Event::order_action( $event['type'], $cmp, $state );
		} else {
			$action = in_array( $event['type'], array( 'invoice.paid', 'invoice.over' ), true ) ? 'note' : 'mismatch';
		}
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
			case 'mismatch':
				$side_effect_ok = $this->add_note(
					$order,
					$this->trans(
						'GhostPay %type% event %event% (%amount% %currency% minor units) ignored: currency mismatch.',
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
