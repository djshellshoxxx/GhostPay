<?php
/**
 * Minimal WordPress + WooCommerce shim for the CLI gateway tests (no WordPress here). Fake data only.
 *
 * wp_options lives in in-memory SQLite and $wpdb runs the plugin's real SQL (the MySQL spellings it uses are mapped
 * to SQLite). The option API mirrors WordPress: add_option() checks with get_option(), fires the 'add_option'
 * action, then upserts, so it is NOT an atomic claim. ghostpay_test_yield() runs before every database step and in
 * that add_option() window; a test can run a competing request there to replay a race deterministically. Each
 * request gets its own object cache, like separate PHP processes.
 */

define( 'ABSPATH', __DIR__ . '/' );
define( 'HOUR_IN_SECONDS', 3600 );

/** wp_send_json() ends the request: here it throws the reply to the test. */
final class GhostPay_Test_Reply extends Exception {
	public $status;
	public $body;

	public function __construct( int $status, array $body ) {
		parent::__construct( 'reply ' . $status );
		$this->status = $status;
		$this->body   = $body;
	}
}

/** Serves php://input from GhostPay_Test::$input while a webhook request runs. */
final class GhostPay_Test_Input {
	public $context;
	private $pos = 0;

	public function stream_open( $path, $mode, $options, &$opened_path ) {
		return 'php://input' === $path;
	}

	public function stream_read( $count ) {
		$chunk      = (string) substr( GhostPay_Test::$input, $this->pos, $count );
		$this->pos += strlen( $chunk );
		return $chunk;
	}

	public function stream_eof() {
		return $this->pos >= strlen( GhostPay_Test::$input );
	}

	public function stream_stat() {
		return array();
	}
}

final class GhostPay_Test {
	public static $hooks          = array();
	public static $cache          = array();
	public static $orders         = array();
	public static $notes          = array();
	public static $payments       = array();
	public static $http           = array();
	public static $http_response  = null;
	public static $notices        = array();
	public static $price_decimals = 2;
	public static $can            = true;
	public static $input          = '';
	public static $yield_at       = 0;
	public static $yields         = 0;
	public static $competitor     = null;

	/** Fresh database, caches and orders (hooks registered by the plugin files stay). */
	public static function reset(): void {
		$GLOBALS['wpdb']      = new GhostPay_Test_Wpdb();
		self::$cache          = array();
		self::$orders         = array();
		self::$notes          = array();
		self::$payments       = array();
		self::$http           = array();
		self::$http_response  = null;
		self::$notices        = array();
		self::$price_decimals = 2;
		self::$can            = true;
	}

	/** Run $fn as a separate request: its own object cache, as in another PHP process. */
	public static function as_request( callable $fn ) {
		$saved       = self::$cache;
		self::$cache = array();
		try {
			return $fn();
		} finally {
			self::$cache = $saved;
		}
	}

	/** Run $first; at its $step-th database step run $second as a concurrent request. @return bool $second ran. */
	public static function race( callable $first, callable $second, int $step ): bool {
		$ran              = false;
		self::$yields     = 0;
		self::$yield_at   = $step;
		self::$competitor = static function () use ( $second, &$ran ): void {
			$ran = true;
			$second();
		};
		try {
			$first();
		} finally {
			self::$competitor = null;
			self::$yield_at   = 0;
		}
		return $ran;
	}
}

function ghostpay_test_yield(): void {
	++GhostPay_Test::$yields;
	if ( GhostPay_Test::$yields === GhostPay_Test::$yield_at && null !== GhostPay_Test::$competitor ) {
		$competitor                 = GhostPay_Test::$competitor;
		GhostPay_Test::$competitor = null;
		GhostPay_Test::as_request( $competitor );
	}
}

final class GhostPay_Test_Wpdb {
	public $options    = 'wp_options';
	public $last_error = '';
	private $pdo;

	public function __construct() {
		$this->pdo = new PDO( 'sqlite::memory:' );
		$this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
		$this->pdo->exec( "CREATE TABLE wp_options (option_id INTEGER PRIMARY KEY AUTOINCREMENT, option_name TEXT NOT NULL UNIQUE, option_value TEXT NOT NULL, autoload TEXT NOT NULL DEFAULT 'yes')" );
	}

	public function prepare( $query, ...$args ) {
		$args = isset( $args[0] ) && is_array( $args[0] ) ? $args[0] : $args;
		$i    = 0;
		return preg_replace_callback(
			'/%[sd]/',
			static function ( array $m ) use ( &$i, $args ): string {
				$v = $args[ $i++ ];
				return '%d' === $m[0] ? (string) (int) $v : "'" . str_replace( "'", "''", (string) $v ) . "'";
			},
			$query
		);
	}

	public function esc_like( $text ) {
		return addcslashes( $text, '_%\\' );
	}

	/** The MySQL spellings the plugin uses, in SQLite. */
	private static function sqlite( string $sql ): string {
		$sql = preg_replace( '/\A\s*INSERT\s+IGNORE\s+INTO\b/i', 'INSERT OR IGNORE INTO', $sql );
		return preg_replace( "/\\bLIKE\\s+('(?:[^']|'')*')/", "LIKE \$1 ESCAPE '\\\\'", $sql );
	}

	/** @return PDOStatement|false */
	private function run( string $sql, array $params = array() ) {
		ghostpay_test_yield();
		try {
			$st = $this->pdo->prepare( self::sqlite( $sql ) );
			$st->execute( $params );
			return $st;
		} catch ( PDOException $e ) {
			$this->last_error = $e->getMessage();
			return false;
		}
	}

	/** Like wpdb::query(): affected rows for writes, selected rows otherwise, false on a database error. */
	public function query( $sql ) {
		$st = $this->run( $sql );
		if ( false === $st ) {
			return false;
		}
		return preg_match( '/\A\s*(insert|delete|update|replace)\s/i', $sql ) ? $st->rowCount() : count( $st->fetchAll() );
	}

	public function get_var( $sql ) {
		$st = $this->run( $sql );
		$v  = false === $st ? false : $st->fetchColumn();
		return false === $v || null === $v ? null : (string) $v;
	}

	public function update( $table, $data, $where, $format = null, $where_format = null ) {
		$set  = implode( ', ', array_map( static fn( $k ) => "$k = ?", array_keys( $data ) ) );
		$cond = implode( ' AND ', array_map( static fn( $k ) => "$k = ?", array_keys( $where ) ) );
		$st   = $this->run( "UPDATE $table SET $set WHERE $cond", array_merge( array_values( $data ), array_values( $where ) ) );
		return false === $st ? false : $st->rowCount();
	}
}

// ---- object cache and option API (WordPress semantics, simplified) ---------------------------------------------

function wp_cache_get( $key, $group = '' ) {
	return GhostPay_Test::$cache[ $group ][ $key ] ?? false;
}

function wp_cache_set( $key, $data, $group = '' ) {
	GhostPay_Test::$cache[ $group ][ $key ] = $data;
	return true;
}

function wp_cache_delete( $key, $group = '' ) {
	unset( GhostPay_Test::$cache[ $group ][ $key ] );
	return true;
}

function maybe_serialize( $data ) {
	return is_array( $data ) || is_object( $data ) ? serialize( $data ) : $data;
}

function maybe_unserialize( $data ) {
	return is_string( $data ) && preg_match( '/\A(a|O|s|i|b|d):/', $data ) ? unserialize( $data, array( 'allowed_classes' => false ) ) : $data;
}

function get_option( $option, $default_value = false ) {
	global $wpdb;
	$notoptions = wp_cache_get( 'notoptions', 'options' );
	if ( is_array( $notoptions ) && isset( $notoptions[ $option ] ) ) {
		return $default_value;
	}
	$value = wp_cache_get( $option, 'options' );
	if ( false === $value ) {
		$value = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s LIMIT 1", $option ) );
		if ( null === $value ) {
			$notoptions            = is_array( $notoptions ) ? $notoptions : array();
			$notoptions[ $option ] = true;
			wp_cache_set( 'notoptions', $notoptions, 'options' );
			return $default_value;
		}
		wp_cache_set( $option, $value, 'options' );
	}
	return maybe_unserialize( $value );
}

/** WordPress add_option(): cached/DB existence check, the 'add_option' action, then INSERT ... ON DUPLICATE KEY UPDATE. */
function add_option( $option, $value = '', $deprecated = '', $autoload = 'yes' ) {
	global $wpdb;
	$notoptions = wp_cache_get( 'notoptions', 'options' );
	if ( ! is_array( $notoptions ) || ! isset( $notoptions[ $option ] ) ) {
		if ( false !== get_option( $option ) ) {
			return false;
		}
	}
	ghostpay_test_yield(); // do_action( 'add_option' ) runs here in WordPress: nothing is locked.
	$autoload = ( 'no' === $autoload || false === $autoload ) ? 'no' : 'yes';
	$result   = $wpdb->query( $wpdb->prepare( "INSERT INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, %s) ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value, autoload = excluded.autoload", $option, maybe_serialize( $value ), $autoload ) );
	if ( ! $result ) {
		return false;
	}
	$notoptions = wp_cache_get( 'notoptions', 'options' );
	if ( is_array( $notoptions ) && isset( $notoptions[ $option ] ) ) {
		unset( $notoptions[ $option ] );
		wp_cache_set( 'notoptions', $notoptions, 'options' );
	}
	wp_cache_set( $option, maybe_serialize( $value ), 'options' );
	return true;
}

function update_option( $option, $value, $autoload = null ) {
	global $wpdb;
	$old = get_option( $option );
	if ( false === $old ) {
		return add_option( $option, $value, '', false === $autoload ? 'no' : 'yes' );
	}
	if ( $value === $old ) {
		return false;
	}
	$rows = $wpdb->update( $wpdb->options, array( 'option_value' => maybe_serialize( $value ) ), array( 'option_name' => $option ) );
	wp_cache_set( $option, maybe_serialize( $value ), 'options' );
	return (bool) $rows;
}

function delete_option( $option ) {
	global $wpdb;
	$rows = $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s", $option ) );
	wp_cache_delete( $option, 'options' );
	return (bool) $rows;
}

// ---- hooks, i18n, escaping, misc ---------------------------------------------------------------------------------

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
	GhostPay_Test::$hooks[ $hook ][] = $callback;
	return true;
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
	return add_action( $hook, $callback, $priority, $accepted_args );
}

function do_action( $hook, ...$args ) {
	foreach ( GhostPay_Test::$hooks[ $hook ] ?? array() as $callback ) {
		call_user_func_array( $callback, $args );
	}
}

function apply_filters( $hook, $value, ...$args ) {
	foreach ( GhostPay_Test::$hooks[ $hook ] ?? array() as $callback ) {
		$value = call_user_func_array( $callback, array_merge( array( $value ), $args ) );
	}
	return $value;
}

function register_activation_hook( $file, $callback ) {}
function register_deactivation_hook( $file, $callback ) {}

function __( $text, $domain = 'default' ) {
	return $text;
}

function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

function esc_attr( $text ) {
	return esc_html( $text );
}

function esc_html__( $text, $domain = 'default' ) {
	return esc_html( $text );
}

function sanitize_key( $key ) {
	return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

function wp_unslash( $value ) {
	return $value;
}

function current_user_can( $capability ) {
	return GhostPay_Test::$can;
}

function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}

function wp_json_encode( $data, $options = 0, $depth = 512 ) {
	return json_encode( $data, $options, $depth );
}

function nocache_headers() {}

function wp_send_json( $response, $status_code = null ) {
	throw new GhostPay_Test_Reply( (int) $status_code, $response );
}

final class WP_Error {}

function is_wp_error( $thing ) {
	return $thing instanceof WP_Error;
}

function wp_safe_remote_post( $url, $args = array() ) {
	GhostPay_Test::$http[] = array( 'url' => $url, 'args' => $args );
	return GhostPay_Test::$http_response;
}

function wp_remote_retrieve_response_code( $response ) {
	return is_array( $response ) ? $response['response']['code'] : '';
}

function wp_remote_retrieve_body( $response ) {
	return is_array( $response ) ? $response['body'] : '';
}

// ---- WooCommerce ------------------------------------------------------------------------------------------------

function wc_get_price_decimals() {
	return GhostPay_Test::$price_decimals;
}

function wc_add_notice( $message, $notice_type = 'success' ) {
	GhostPay_Test::$notices[] = array( $notice_type, $message );
}

class WC_Settings_API {
	public $id;
	public $form_fields = array();
	public $settings    = array();

	public function get_option_key() {
		return 'woocommerce_' . $this->id . '_settings';
	}

	public function init_settings() {
		$this->settings = get_option( $this->get_option_key(), null );
		if ( ! is_array( $this->settings ) ) {
			$defaults = array();
			foreach ( $this->form_fields as $key => $field ) {
				if ( isset( $field['default'] ) ) {
					$defaults[ $key ] = $field['default'];
				}
			}
			$this->settings = array_merge( array_fill_keys( array_keys( $this->form_fields ), '' ), $defaults );
		}
	}

	/** WooCommerce returns stored values for ANY key, including keys that are no longer form fields. */
	public function get_option( $key, $empty_value = null ) {
		if ( empty( $this->settings ) ) {
			$this->init_settings();
		}
		if ( ! isset( $this->settings[ $key ] ) ) {
			$this->settings[ $key ] = $this->form_fields[ $key ]['default'] ?? '';
		}
		if ( null !== $empty_value && '' === $this->settings[ $key ] ) {
			$this->settings[ $key ] = $empty_value;
		}
		return $this->settings[ $key ];
	}
}

class WC_Payment_Gateway extends WC_Settings_API {
	public $enabled;
	public $title;
	public $description;
	public $method_title;
	public $method_description;
	public $has_fields;
	public $supports = array();
}

final class WC_Meta_Data {
	public $key;
	public $value;

	public function __construct( array $meta ) {
		$this->key   = $meta['key'];
		$this->value = $meta['value'];
	}
}

/** Order objects are per request copies of the stored order (save() writes the copy back, like the database). */
class WC_Order {
	private $data;

	public function __construct( array $data ) {
		$this->data = $data;
	}

	public function get_id() {
		return $this->data['id'];
	}

	public function get_total() {
		return $this->data['total'];
	}

	public function get_currency() {
		return $this->data['currency'];
	}

	public function get_payment_method() {
		return $this->data['payment_method'];
	}

	public function get_status() {
		return $this->data['status'];
	}

	public function has_status( $status ) {
		return in_array( $this->data['status'], (array) $status, true );
	}

	public function is_paid() {
		return $this->has_status( array( 'processing', 'completed' ) );
	}

	public function add_meta_data( $key, $value, $unique = false ) {
		$this->data['meta'][] = array( 'key' => $key, 'value' => $value );
	}

	/** Meta in insertion (meta id) order, as WooCommerce reads it. */
	public function get_meta( $key = '', $single = true, $context = 'view' ) {
		$found = array();
		foreach ( $this->data['meta'] as $meta ) {
			if ( $meta['key'] === $key ) {
				$found[] = new WC_Meta_Data( $meta );
			}
		}
		if ( $single ) {
			return isset( $found[0] ) ? $found[0]->value : '';
		}
		return $found;
	}

	public function add_order_note( $note ) {
		GhostPay_Test::$notes[ $this->get_id() ][] = $note;
		return 1;
	}

	/** Like WooCommerce, the note is recorded only together with an actual status change. */
	public function update_status( $new_status, $note = '' ) {
		if ( $new_status !== $this->data['status'] && '' !== $note ) {
			$this->add_order_note( $note );
		}
		$this->data['status'] = $new_status;
		$this->save();
		return true;
	}

	/** Same status gate as WooCommerce: only these statuses become paid; for others it changes nothing. */
	public function payment_complete( $transaction_id = '' ) {
		if ( $this->has_status( apply_filters( 'woocommerce_valid_order_statuses_for_payment_complete', array( 'on-hold', 'pending', 'failed', 'cancelled' ), $this ) ) ) {
			$this->data['transaction_id'] = $transaction_id;
			$this->data['status']         = 'processing';
			GhostPay_Test::$payments[]    = $this->get_id();
			$this->save();
		}
		return true;
	}

	public function save() {
		GhostPay_Test::$orders[ $this->get_id() ] = $this->data;
		return $this->get_id();
	}
}

function wc_get_order( $order_id ) {
	return isset( GhostPay_Test::$orders[ $order_id ] ) ? new WC_Order( GhostPay_Test::$orders[ $order_id ] ) : false;
}

function wc_get_orders( $args ) {
	foreach ( GhostPay_Test::$orders as $data ) {
		foreach ( $data['meta'] as $meta ) {
			if ( $meta['key'] === $args['meta_key'] && $meta['value'] === $args['meta_value'] ) {
				return array( new WC_Order( $data ) );
			}
		}
	}
	return array();
}

/** Store a fake order. $invoices: GhostPay invoice ids, oldest first. */
function ghostpay_test_order( int $id, string $status, string $total, string $currency, array $invoices ): void {
	$meta = array();
	foreach ( $invoices as $invoice ) {
		$meta[] = array( 'key' => '_ghostpay_invoice_id', 'value' => $invoice );
	}
	GhostPay_Test::$orders[ $id ] = array(
		'id'             => $id,
		'status'         => $status,
		'total'          => $total,
		'currency'       => $currency,
		'payment_method' => 'ghostpay',
		'meta'           => $meta,
	);
}

/** One webhook request through handle_webhook(). @return array{0:int,1:array} status and JSON body. */
function ghostpay_test_deliver( string $body, string $signature ): array {
	static $depth = 0;
	$saved                              = array( $_SERVER, GhostPay_Test::$input );
	$_SERVER['REQUEST_METHOD']          = 'POST';
	$_SERVER['HTTP_GHOSTPAY_SIGNATURE'] = $signature;
	GhostPay_Test::$input               = $body;
	if ( 0 === $depth++ ) {
		stream_wrapper_unregister( 'php' );
		stream_wrapper_register( 'php', 'GhostPay_Test_Input' );
	}
	try {
		return GhostPay_Test::as_request(
			static function (): array {
				try {
					( new WC_Gateway_GhostPay() )->handle_webhook();
				} catch ( GhostPay_Test_Reply $reply ) {
					return array( $reply->status, $reply->body );
				}
				return array( 0, array() );
			}
		);
	} finally {
		if ( 0 === --$depth ) {
			stream_wrapper_restore( 'php' );
		}
		list( $_SERVER, GhostPay_Test::$input ) = $saved;
	}
}
