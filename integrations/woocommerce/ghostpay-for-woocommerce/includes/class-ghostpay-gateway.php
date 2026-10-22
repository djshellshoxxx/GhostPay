<?php
/**
 * WooCommerce gateway: payment-link flow.
 *
 * Flow: checkout -> process_payment() asks YOUR invoice service (HMAC-signed request) for a GhostPay payment link
 * -> link is validated (https, configured GhostPay host only, v1 fragment) -> customer is redirected to it
 * -> GhostPay sends a signed webhook -> order is completed. No script is loaded from any remote host.
 *
 * @package GhostPay_For_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

class WC_Gateway_GhostPay extends WC_Payment_Gateway {

	const MAX_BODY       = 65536;
	const MAX_LINK       = 22000;
	const EVENT_ID_LIMIT = 50;

	public function __construct() {
		$this->id                 = 'ghostpay';
		$this->method_title       = __( 'GhostPay', 'ghostpay-for-woocommerce' );
		$this->method_description = __( 'Private crypto payments through a GhostPay payment link. Requires your own invoice service.', 'ghostpay-for-woocommerce' );
		$this->has_fields         = false;
		$this->supports           = array( 'products' );

		$this->init_form_fields();
		$this->init_settings();
		$this->title       = $this->get_option( 'title', 'Pay with GhostPay' );
		$this->description = $this->get_option( 'description', '' );
		$this->enabled     = $this->get_option( 'enabled', 'no' );

		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
		add_action( 'woocommerce_api_ghostpay', array( $this, 'handle_webhook' ) );
		add_action( 'admin_post_ghostpay_test_connection', array( $this, 'handle_test_connection' ) );
		add_action( 'admin_notices', array( $this, 'test_notice' ) );
	}

	/** Shows the result of "Test connection". Reads only a fixed two-value flag; output is escaped. */
	public function test_notice() {
		if ( ! current_user_can( 'manage_woocommerce' ) || ! isset( $_GET['ghostpay_test'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification -- display-only flag, no state change.
			return;
		}
		$ok = 'ok' === sanitize_key( wp_unslash( $_GET['ghostpay_test'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
		printf(
			'<div class="notice notice-%1$s"><p>%2$s</p></div>',
			esc_attr( $ok ? 'success' : 'error' ),
			esc_html( $ok ? __( 'GhostPay invoice service reachable.', 'ghostpay-for-woocommerce' ) : __( 'GhostPay invoice service check failed.', 'ghostpay-for-woocommerce' ) )
		);
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled'        => array(
				'title'   => __( 'Enable', 'ghostpay-for-woocommerce' ),
				'type'    => 'checkbox',
				'label'   => __( 'Enable GhostPay', 'ghostpay-for-woocommerce' ),
				'default' => 'no',
			),
			'title'          => array(
				'title'   => __( 'Title', 'ghostpay-for-woocommerce' ),
				'type'    => 'text',
				'default' => 'Pay with GhostPay',
			),
			'description'    => array(
				'title'   => __( 'Description', 'ghostpay-for-woocommerce' ),
				'type'    => 'textarea',
				'default' => '',
			),
			'service_url'    => array(
				'title'       => __( 'Invoice service URL', 'ghostpay-for-woocommerce' ),
				'type'        => 'text',
				'description' => __( 'https URL of YOUR invoice service (see README). The plugin never contacts any other host.', 'ghostpay-for-woocommerce' ),
				'default'     => '',
			),
			'pay_host'       => array(
				'title'       => __( 'GhostPay app host', 'ghostpay-for-woocommerce' ),
				'type'        => 'text',
				'description' => __( 'Host name only (e.g. pay.example.org). Payment links for any other host are refused.', 'ghostpay-for-woocommerce' ),
				'default'     => '',
			),
			'service_secret' => array(
				'title'       => __( 'Invoice service secret (hex)', 'ghostpay-for-woocommerce' ),
				'type'        => 'password',
				'description' => __( 'Prefer defining GHOSTPAY_SERVICE_SECRET in wp-config.php; the constant wins over this field.', 'ghostpay-for-woocommerce' ),
				'default'     => '',
			),
			'webhook_secret' => array(
				'title'       => __( 'Webhook secret (hex)', 'ghostpay-for-woocommerce' ),
				'type'        => 'password',
				'description' => __( 'At least 32 bytes (64 hex chars). Prefer GHOSTPAY_WEBHOOK_SECRET in wp-config.php.', 'ghostpay-for-woocommerce' ),
				'default'     => '',
			),
			'ttl'            => array(
				'title'       => __( 'Invoice lifetime (seconds)', 'ghostpay-for-woocommerce' ),
				'type'        => 'number',
				'default'     => '3600',
				'custom_attributes' => array( 'min' => '300', 'max' => '86400', 'step' => '1' ),
			),
			'test'           => array(
				'title' => __( 'Connection', 'ghostpay-for-woocommerce' ),
				'type'  => 'ghostpay_test',
			),
		);
	}

	/** Custom field: "Test connection" link carrying a WordPress nonce. */
	public function generate_ghostpay_test_html( $key, $data ) {
		$url = wp_nonce_url( admin_url( 'admin-post.php?action=ghostpay_test_connection' ), 'ghostpay_test_connection' );
		ob_start();
		?>
		<tr valign="top">
			<th scope="row" class="titledesc"><?php echo esc_html( $data['title'] ); ?></th>
			<td class="forminp"><a class="button" href="<?php echo esc_url( $url ); ?>"><?php esc_html_e( 'Test connection', 'ghostpay-for-woocommerce' ); ?></a></td>
		</tr>
		<?php
		return ob_get_clean();
	}

	public function is_available() {
		return 'yes' === $this->enabled && null !== $this->service_base() && '' !== $this->pay_host() && null !== $this->secret( 'service' );
	}

	// ---- settings helpers -------------------------------------------------------------------------------------

	/** @return string|null https URL without trailing slash, or null. */
	private function service_base(): ?string {
		$url = trim( (string) $this->get_option( 'service_url', '' ) );
		$p   = wp_parse_url( $url );
		if ( false === $p || ! isset( $p['scheme'], $p['host'] ) || 'https' !== $p['scheme'] || isset( $p['user'] ) || isset( $p['pass'] ) || isset( $p['query'] ) || isset( $p['fragment'] ) ) {
			return null;
		}
		return rtrim( $url, '/' );
	}

	private function pay_host(): string {
		$h = strtolower( trim( (string) $this->get_option( 'pay_host', '' ) ) );
		return preg_match( '/\A[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\z/', $h ) ? $h : '';
	}

	/** @param string $which 'service' or 'webhook'. @return string|null Binary secret. */
	private function secret( string $which ): ?string {
		$const = 'service' === $which ? 'GHOSTPAY_SERVICE_SECRET' : 'GHOSTPAY_WEBHOOK_SECRET';
		$hex   = defined( $const ) ? (string) constant( $const ) : (string) $this->get_option( $which . '_secret', '' );
		return GhostPay_Signature::secret_from_hex( $hex );
	}

	/**
	 * Accept only https links on the configured host with a v1 invoice fragment and no credentials or query.
	 *
	 * @security The link is attacker-influenced data (it comes from a network response). The host allowlist stops
	 * a compromised or misconfigured service from sending customers elsewhere.
	 */
	public function validate_link( string $link ): bool {
		if ( strlen( $link ) > self::MAX_LINK || false !== strpos( $link, '?' ) ) {
			return false;
		}
		$p = wp_parse_url( $link );
		if ( false === $p || ! isset( $p['scheme'], $p['host'], $p['fragment'] ) || 'https' !== $p['scheme'] ) {
			return false;
		}
		if ( isset( $p['user'] ) || isset( $p['pass'] ) || isset( $p['query'] ) || isset( $p['port'] ) ) {
			return false;
		}
		if ( strtolower( $p['host'] ) !== $this->pay_host() || '' === $this->pay_host() ) {
			return false;
		}
		return (bool) preg_match( '/\Agpi=v1\.[A-Za-z0-9_-]+\z/', $p['fragment'] );
	}

	// ---- checkout ---------------------------------------------------------------------------------------------

	/**
	 * Called by WooCommerce after it verified its own checkout nonce (woocommerce-process-checkout-nonce /
	 * woocommerce-pay for pay-for-order). Creates an invoice at the merchant's service and returns the redirect.
	 *
	 * @param int $order_id Order id.
	 */
	public function process_payment( $order_id ) {
		$order  = wc_get_order( $order_id );
		$base   = $this->service_base();
		$secret = $this->secret( 'service' );
		if ( ! $order || null === $base || null === $secret ) {
			wc_add_notice( __( 'Payment is temporarily unavailable.', 'ghostpay-for-woocommerce' ), 'error' );
			return array( 'result' => 'failure' );
		}
		$minor = GhostPay_Money::to_minor( (string) $order->get_total(), (int) wc_get_price_decimals() );
		if ( null === $minor || '0' === $minor ) {
			wc_add_notice( __( 'This order total cannot be paid with GhostPay.', 'ghostpay-for-woocommerce' ), 'error' );
			return array( 'result' => 'failure' );
		}
		$ttl  = max( 300, min( 86400, (int) $this->get_option( 'ttl', 3600 ) ) );
		$body = wp_json_encode(
			array(
				'orderId'          => (string) $order->get_id(),
				'currency'         => $order->get_currency(),
				'amountMinor'      => $minor,
				'expiresInSeconds' => $ttl,
			)
		);
		$sig  = GhostPay_Signature::sign( $secret, $body, time(), bin2hex( random_bytes( 16 ) ) );

		$res = wp_safe_remote_post(
			$base . '/invoices',
			array(
				'timeout'             => 10,
				'redirection'         => 0,
				'limit_response_size' => self::MAX_BODY,
				'headers'             => array(
					'Content-Type'       => 'application/json',
					'GhostPay-Signature' => $sig,
				),
				'body'                => $body,
			)
		);
		$code = is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
		$data = 201 === $code || 200 === $code ? json_decode( (string) wp_remote_retrieve_body( $res ), true, 4 ) : null;
		if ( ! is_array( $data ) || ! isset( $data['invoiceId'], $data['link'] ) || ! is_string( $data['invoiceId'] ) || ! is_string( $data['link'] )
			|| ! preg_match( '/\A[A-Za-z0-9_.:-]{1,128}\z/', $data['invoiceId'] ) || ! $this->validate_link( $data['link'] ) ) {
			$order->add_order_note( __( 'GhostPay: invoice service failed or returned an unacceptable link.', 'ghostpay-for-woocommerce' ) );
			wc_add_notice( __( 'Payment could not be started. Please try again.', 'ghostpay-for-woocommerce' ), 'error' );
			return array( 'result' => 'failure' );
		}
		// Several invoices per order are allowed (customer retries); a late payment of an older one must still match.
		$order->add_meta_data( '_ghostpay_invoice_id', $data['invoiceId'], false );
		$order->update_status( 'pending', __( 'Awaiting GhostPay payment.', 'ghostpay-for-woocommerce' ) );
		$order->save();
		// The link is a bearer secret: it is NOT stored. It goes only to the customer's browser.
		return array(
			'result'   => 'success',
			'redirect' => $data['link'],
		);
	}

	// ---- webhook ----------------------------------------------------------------------------------------------

	private static function reply( int $status, array $body ): void {
		nocache_headers();
		wp_send_json( $body, $status );
	}

	/** Endpoint: POST {site}/?wc-api=ghostpay . Authenticated by the HMAC signature, not by a WordPress nonce. */
	public function handle_webhook() {
		if ( ! isset( $_SERVER['REQUEST_METHOD'] ) || 'POST' !== $_SERVER['REQUEST_METHOD'] ) {
			self::reply( 405, array( 'ok' => false ) );
		}
		$secret = $this->secret( 'webhook' );
		$header = isset( $_SERVER['HTTP_GHOSTPAY_SIGNATURE'] ) ? (string) wp_unslash( $_SERVER['HTTP_GHOSTPAY_SIGNATURE'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- validated strictly by GhostPay_Signature::parse_header().
		$body   = (string) file_get_contents( 'php://input', false, null, 0, self::MAX_BODY + 1 );
		if ( null === $secret || strlen( $body ) > self::MAX_BODY ) {
			self::reply( 400, array( 'ok' => false ) );
		}
		$result = GhostPay_Signature::verify(
			$secret,
			$body,
			$header,
			time(),
			static function ( string $nonce, int $expires ): bool {
				// add_option fails if the option exists: atomic first-use claim. Fails closed on DB error.
				return (bool) add_option( 'ghostpay_nonce_' . $nonce, (string) $expires, '', false );
			}
		);
		if ( 'ok' !== $result ) {
			self::reply( 400, array( 'ok' => false ) ); // same answer for every failure.
		}
		$event = GhostPay_Event::parse( $body );
		if ( null === $event ) {
			self::reply( 400, array( 'ok' => false ) );
		}
		$result = $this->apply_event( $event );
		if ( 'busy' === $result || 'error' === $result ) {
			self::reply( 503, array( 'ok' => false, 'retry' => true ) );
		}
		self::reply( 200, array( 'ok' => true, 'duplicate' => 'duplicate' === $result ) );
	}

	/** Claim one identity with wp_options' unique option_name and a compare-and-swap lease takeover. */
	private function claim_identity( string $identity, string $token ): string {
		$name = '_ghostpay_delivery_' . hash( 'sha256', $identity );
		$now = time();
		$value = 'processing|' . $token . '|' . ( $now + 900 );
		if ( add_option( $name, $value, '', false ) ) {
			return 'claimed';
		}
		$old = get_option( $name, false );
		if ( ! is_string( $old ) ) {
			return 'error';
		}
		if ( str_starts_with( $old, 'complete|' ) ) {
			return 'duplicate';
		}
		$parts = explode( '|', $old );
		if ( 3 !== count( $parts ) || 'processing' !== $parts[0] || ! ctype_digit( $parts[2] ) ) {
			return 'error';
		}
		if ( (int) $parts[2] >= $now ) {
			return 'busy';
		}
		global $wpdb;
		// The old value predicate is a CAS: only one retry can take over an expired lease.
		$changed = $wpdb->update( $wpdb->options, array( 'option_value' => $value ), array( 'option_name' => $name, 'option_value' => $old ), array( '%s' ), array( '%s', '%s' ) );
		wp_cache_delete( $name, 'options' );
		if ( 1 === $changed ) {
			return 'claimed';
		}
		$current = get_option( $name, false );
		return is_string( $current ) && str_starts_with( $current, 'complete|' ) ? 'duplicate' : 'busy';
	}

	/** @param string[] $names */
	private function finish_identities( array $names, string $token, bool $complete ): bool {
		global $wpdb;
		$ok = true;
		foreach ( $names as $name ) {
			$value = $complete ? 'complete|' . $token : 'processing|' . $token;
			if ( $complete ) {
				$changed = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value LIKE %s", $value, $name, $wpdb->esc_like( 'processing|' . $token . '|' ) . '%' ) );
				$ok = ( 1 === $changed ) && $ok;
			} else {
				$deleted = $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value LIKE %s", $name, $wpdb->esc_like( 'processing|' . $token . '|' ) . '%' ) );
				$ok = ( 1 === $deleted ) && $ok;
			}
			wp_cache_delete( $name, 'options' );
		}
		return $ok;
	}

	/** @param array $event Validated event. */
	private function apply_event( array $event ): string {
		$orders = wc_get_orders(
			array(
				'limit'      => 1,
				'return'     => 'objects',
				'meta_key'   => '_ghostpay_invoice_id', // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_value' => $event['data']['invoiceId'], // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		$order = $orders[0] ?? null;
		if ( ! $order instanceof WC_Order || 'ghostpay' !== $order->get_payment_method() ) {
			return 'done'; // unknown invoice: acknowledge so the sender stops retrying.
		}
		$token = bin2hex( random_bytes( 16 ) );
		$identities = GhostPay_Event::identity_keys( $event );
		$names = array_map( static fn( string $identity ): string => '_ghostpay_delivery_' . hash( 'sha256', $identity ), $identities );
		$claimed = array();
		foreach ( $identities as $index => $identity ) {
			$status = $this->claim_identity( $identity, $token );
			if ( 'claimed' !== $status ) {
				$this->finish_identities( array_slice( $names, 0, count( $claimed ) ), $token, false );
				return $status;
			}
			$claimed[] = $identity;
		}

		$data = $event['data'];
		if ( $data['currency'] !== $order->get_currency() ) {
			$order->add_order_note( sprintf( /* translators: 1: event id */ __( 'GhostPay event %s ignored: currency mismatch.', 'ghostpay-for-woocommerce' ), $event['id'] ) );
			if ( ! $order->save() ) {
				$this->finish_identities( $names, $token, false );
				return 'error';
			}
			return $this->finish_identities( $names, $token, true ) ? 'done' : 'error';
		}
		$due = GhostPay_Money::to_minor( (string) $order->get_total(), (int) wc_get_price_decimals() );
		$cmp = null === $due ? null : GhostPay_Money::compare( $data['amountMinor'], $due );
		switch ( $event['type'] ) {
			case 'invoice.paid':
			case 'invoice.over':
				if ( null !== $cmp && $cmp >= 0 && ! $order->is_paid() ) {
					$order->payment_complete( $event['id'] );
					$order->add_order_note( sprintf( /* translators: 1: event id */ __( 'GhostPay payment confirmed (event %s).', 'ghostpay-for-woocommerce' ), $event['id'] ) );
				} else {
					$order->update_status( 'on-hold', sprintf( /* translators: 1: event id */ __( 'GhostPay reported a payment below the order total (event %s). Check manually.', 'ghostpay-for-woocommerce' ), $event['id'] ) );
				}
				break;
			case 'invoice.partial':
				$order->add_order_note( sprintf( /* translators: 1: event id */ __( 'GhostPay partial payment received (event %s). Order stays unpaid.', 'ghostpay-for-woocommerce' ), $event['id'] ) );
				break;
			case 'invoice.expired':
				if ( $order->has_status( 'pending' ) ) {
					$order->update_status( 'cancelled', __( 'GhostPay invoice expired without payment.', 'ghostpay-for-woocommerce' ) );
				}
				break;
		}
		if ( ! $order->save() ) {
			$this->finish_identities( $names, $token, false );
			return 'error';
		}
		return $this->finish_identities( $names, $token, true ) ? 'done' : 'error';
	}

	// ---- admin: test connection (nonce + capability) ----------------------------------------------------------

	public function handle_test_connection() {
		check_admin_referer( 'ghostpay_test_connection' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do this.', 'ghostpay-for-woocommerce' ), '', array( 'response' => 403 ) );
		}
		$base = $this->service_base();
		$ok   = false;
		if ( null !== $base ) {
			$res = wp_safe_remote_get( $base . '/health', array( 'timeout' => 5, 'redirection' => 0, 'limit_response_size' => 4096 ) );
			$ok  = ! is_wp_error( $res ) && 200 === (int) wp_remote_retrieve_response_code( $res );
		}
		$url = add_query_arg( array( 'page' => 'wc-settings', 'tab' => 'checkout', 'section' => 'ghostpay', 'ghostpay_test' => $ok ? 'ok' : 'fail' ), admin_url( 'admin.php' ) );
		wp_safe_redirect( $url );
		exit;
	}
}
