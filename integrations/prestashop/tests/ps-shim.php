<?php
/**
 * Minimal PrestaShop shim for the CLI module/controller tests (no PrestaShop here). Fake data only.
 *
 * Db runs the module's real SQL on a SQLite file (env GHOSTPAY_TEST_DB) shared with tests/request.php, which runs one
 * controller request per process because the controllers exit(). Only the MySQL spellings the module uses are mapped
 * to SQLite; every SQL error throws what PrestaShop 8's DbPDO::_query() throws on PHP 8 (a PrestaShopException with the
 * PDOException as previous), so drift between the install DDL and the controller queries fails the tests. Orders,
 * currencies, order history, customers, customer threads with their messages, and configuration are plain tables made
 * by ghostpay_test_platform_schema(); OrderHistory::changeIdOrderState() returns nothing, like PrestaShop's.
 */

define( '_PS_VERSION_', '8.1.0' );
define( '_DB_PREFIX_', 'ps_' );
define( '_MYSQL_ENGINE_', 'InnoDB' );

class PrestaShopException extends Exception {}

class Db {
	const INSERT = 1;

	/** A test stops the request at its $stop_at-th query (a crash or a timeout there): that query does not run. */
	public static $stop_at = 0;
	public static $queries = 0;

	private static $instance;
	private $pdo;
	private $in_transaction = false; // PDO does not track a BEGIN sent as SQL

	public static function getInstance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		$this->pdo = new PDO( 'sqlite:' . getenv( 'GHOSTPAY_TEST_DB' ) );
		$this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
		$this->pdo->setAttribute( PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC );
		$this->pdo->exec( 'PRAGMA busy_timeout = 5000' );
	}

	/** The MySQL spellings used by the module, in SQLite. */
	public static function sqlite( string $sql ): string {
		$map = array(
			'/\s*ENGINE=\w+\s+DEFAULT\s+CHARSET=\w+/i' => '',
			'/,\s*KEY\s*\([^)]*\)/i'                   => '',
			'/(`\w+`)\s+ENUM\(([^)]*)\)/i'             => '$1 TEXT CHECK ($1 IN ($2))',
			'/\A\s*START\s+TRANSACTION\s*\z/i'         => 'BEGIN',
			'/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i'     => 'ON CONFLICT DO UPDATE SET',
			'/\bVALUES\((`\w+`)\)/i'                   => 'excluded.$1',
			'/\bIF\(/i'                                => 'iif(',
		);
		$sql = preg_replace( array_keys( $map ), array_values( $map ), $sql );
		// MySQL ENUM values are double-quoted strings.
		return preg_replace_callback( '/CHECK \((`\w+`) IN \(([^)]*)\)\)/', static fn( array $m ): string => 'CHECK (' . $m[1] . ' IN (' . str_replace( '"', "'", $m[2] ) . '))', $sql );
	}

	/** Like PrestaShop 8's DbPDO::_query(): a PDO error is rethrown as PrestaShopException, the PDOException as previous. */
	private function query( string $sql ): PDOStatement {
		if ( 0 !== self::$stop_at && ++self::$queries === self::$stop_at ) {
			throw new RuntimeException( 'request stopped' );
		}
		try {
			return $this->pdo->query( $sql );
		} catch ( PDOException $exception ) {
			throw new PrestaShopException( $exception->getMessage(), (int) $exception->getCode(), $exception );
		}
	}

	public function execute( $sql, $use_cache = true ) {
		$sql = self::sqlite( (string) $sql );
		if ( preg_match( '/\A\s*DELETE\s+FROM\s+`?(\w+)`?/i', $sql, $m ) && _DB_PREFIX_ . Configuration::get( 'GHOSTPAY_TEST_FAIL_DELETE' ) === $m[1] ) {
			$this->query( 'SELECT ghostpay_test_server_has_gone_away()' ); // as GHOSTPAY_TEST_FAIL_INSERT, for deletes
		}
		if ( preg_match( '/\A\s*(COMMIT|ROLLBACK)\s*\z/i', $sql ) ) {
			if ( ! $this->in_transaction ) {
				return true; // MySQL accepts both outside a transaction.
			}
			$this->in_transaction = false;
		}
		$this->query( $sql );
		$this->in_transaction = $this->in_transaction || 'BEGIN' === $sql;
		return true;
	}

	/** Like PrestaShop: LIMIT 1, string values (as MySQL returns them), false when there is no row. */
	public function getRow( $sql, $use_cache = true ) {
		$row = $this->query( self::sqlite( rtrim( (string) $sql, " \t\n\r\0\x0B;" ) . ' LIMIT 1' ) )->fetch();
		return false === $row ? false : array_map( static fn( $v ) => null === $v ? null : (string) $v, $row );
	}

	public function getValue( $sql, $use_cache = true ) {
		$row = $this->getRow( $sql, $use_cache );
		return false === $row ? false : array_shift( $row );
	}

	/** Like PrestaShop: every row, string values. */
	public function executeS( $sql, $array = true, $use_cache = true ) {
		return array_map(
			static fn( array $row ): array => array_map( static fn( $v ) => null === $v ? null : (string) $v, $row ),
			$this->query( self::sqlite( (string) $sql ) )->fetchAll()
		);
	}

	/** The id of the row just inserted. */
	public function Insert_ID() {
		return (int) $this->pdo->lastInsertId();
	}

	/** Like PrestaShop: every value is quoted as-is (callers pSQL() it). */
	public function insert( $table, $data, $null_values = false, $use_cache = true, $type = self::INSERT, $add_prefix = true ) {
		$table = ( $add_prefix ? _DB_PREFIX_ : '' ) . $table;
		if ( _DB_PREFIX_ . Configuration::get( 'GHOSTPAY_TEST_FAIL_INSERT' ) === $table ) {
			// A test makes inserts into this table fail with a database error that is not a duplicate key (a lost
			// connection, a deadlock): here a real PDO error with SQLSTATE HY000.
			$this->query( 'SELECT ghostpay_test_server_has_gone_away()' );
		}
		$this->query( 'INSERT INTO `' . $table . '` (`' . implode( '`,`', array_keys( $data ) ) . "`) VALUES ('" . implode( "','", array_values( $data ) ) . "')" );
		return true;
	}
}

/** A test sets GHOSTPAY_TEST_FAIL_WRITES to make order-history and customer-message writes fail. */
function ghostpay_test_fail_writes(): bool {
	return '1' === Configuration::get( 'GHOSTPAY_TEST_FAIL_WRITES' );
}

function pSQL( $string, $html_ok = false ) {
	return str_replace( "'", "''", (string) $string );
}

/** Tables PrestaShop itself owns, reduced to the columns the module reads or writes. */
function ghostpay_test_platform_schema(): void {
	$db = Db::getInstance();
	$db->execute( 'CREATE TABLE `ps_configuration` (`name` TEXT PRIMARY KEY, `value` TEXT)' );
	$db->execute( 'CREATE TABLE `ps_currency` (`id_currency` INTEGER PRIMARY KEY, `iso_code` TEXT NOT NULL, `precision` INTEGER NOT NULL)' );
	$db->execute( 'CREATE TABLE `ps_orders` (`id_order` INTEGER PRIMARY KEY, `id_cart` INTEGER, `id_customer` INTEGER, `id_currency` INTEGER, `id_lang` INTEGER NOT NULL DEFAULT 1, `module` TEXT, `current_state` INTEGER, `total_paid` TEXT)' );
	$db->execute( 'CREATE TABLE `ps_order_history` (`id_order_history` INTEGER PRIMARY KEY AUTOINCREMENT, `id_order` INTEGER, `id_order_state` INTEGER)' );
	$db->execute( 'CREATE TABLE `ps_order_state` (`id_order_state` INTEGER PRIMARY KEY, `name` TEXT)' );
	// Customer service: also the columns PrestaShop's own order-page and storefront message queries read (run.php).
	$db->execute( 'CREATE TABLE `ps_customer` (`id_customer` INTEGER PRIMARY KEY, `firstname` TEXT NOT NULL, `lastname` TEXT NOT NULL, `email` TEXT NOT NULL)' );
	$db->execute( 'CREATE TABLE `ps_employee` (`id_employee` INTEGER PRIMARY KEY, `firstname` TEXT NOT NULL, `lastname` TEXT NOT NULL)' );
	$db->execute( 'CREATE TABLE `ps_customer_thread` (`id_customer_thread` INTEGER PRIMARY KEY AUTOINCREMENT, `id_shop` INTEGER, `id_lang` INTEGER NOT NULL, `id_contact` INTEGER NOT NULL, `id_customer` INTEGER, `id_order` INTEGER, `status` TEXT, `email` TEXT, `token` TEXT NOT NULL, `date_add` TEXT, `date_upd` TEXT)' );
	$db->execute( 'CREATE TABLE `ps_customer_message` (`id_customer_message` INTEGER PRIMARY KEY AUTOINCREMENT, `id_customer_thread` INTEGER, `id_employee` INTEGER, `message` TEXT NOT NULL, `private` INTEGER NOT NULL DEFAULT 0, `date_add` TEXT, `date_upd` TEXT)' );
}

/** The request context: one shop, one language. */
class Context {
	private static $instance;
	public $shop;
	public $language;

	public static function getContext(): self {
		if ( null === self::$instance ) {
			self::$instance           = new self();
			self::$instance->shop     = (object) array( 'id' => 1 );
			self::$instance->language = (object) array( 'id' => 1 );
		}
		return self::$instance;
	}
}

class Tools {
	/** The submitted form values (a test sets them). */
	public static $values = array();

	public static function isSubmit( $submit ) {
		return isset( self::$values[ $submit ] );
	}

	public static function getValue( $key, $default_value = false ) {
		return self::$values[ $key ] ?? $default_value;
	}

	public static function passwdGen( $length = 8, $flag = 'ALPHANUMERIC' ) {
		return substr( bin2hex( random_bytes( $length ) ), 0, $length );
	}
}

class Customer {
	public $id;
	public $firstname;
	public $lastname;
	public $email;

	public function __construct( $id = null ) {
		$row = Db::getInstance()->getRow( 'SELECT * FROM `ps_customer` WHERE `id_customer` = ' . (int) $id );
		if ( $row ) {
			$this->id        = (int) $row['id_customer'];
			$this->firstname = $row['firstname'];
			$this->lastname  = $row['lastname'];
			$this->email     = $row['email'];
		}
	}
}

/** PrestaShop's CustomerThread: ObjectModel::add() inserts the fields and sets the id and dates. */
class CustomerThread {
	public $id;
	public $id_shop;
	public $id_lang;
	public $id_contact;
	public $id_customer;
	public $id_order;
	public $status;
	public $email;
	public $token;

	public function add() {
		$db  = Db::getInstance();
		$now = date( 'Y-m-d H:i:s' );
		$db->insert( 'customer_thread', array( 'id_shop' => (int) $this->id_shop, 'id_lang' => (int) $this->id_lang, 'id_contact' => (int) $this->id_contact, 'id_customer' => (int) $this->id_customer, 'id_order' => (int) $this->id_order, 'status' => pSQL( $this->status ), 'email' => pSQL( $this->email ), 'token' => pSQL( $this->token ), 'date_add' => $now, 'date_upd' => $now ) );
		$this->id = $db->Insert_ID();
		return true;
	}

	/** PrestaShop 8.1.7's query. */
	public static function getIdCustomerThreadByEmailAndIdOrder( $email, $id_order ) {
		return Db::getInstance()->getValue(
			'SELECT cm.id_customer_thread FROM ' . _DB_PREFIX_ . 'customer_thread cm WHERE cm.email = \'' . pSQL( $email ) . '\' AND cm.id_shop = ' . (int) Context::getContext()->shop->id . ' AND cm.id_order = ' . (int) $id_order
		);
	}
}

/** PrestaShop's CustomerMessage (ObjectModel::add()). */
class CustomerMessage {
	public $id;
	public $id_customer_thread;
	public $id_employee;
	public $message;
	public $private;

	public function add() {
		if ( ghostpay_test_fail_writes() ) {
			return false;
		}
		$db  = Db::getInstance();
		$now = date( 'Y-m-d H:i:s' );
		$db->insert( 'customer_message', array( 'id_customer_thread' => (int) $this->id_customer_thread, 'id_employee' => (int) $this->id_employee, 'message' => pSQL( $this->message ), 'private' => (int) $this->private, 'date_add' => $now, 'date_upd' => $now ) );
		$this->id = $db->Insert_ID();
		return true;
	}
}

class Configuration {
	public static function get( $key, $id_lang = null, $id_shop_group = null, $id_shop = null, $default = false ) {
		$value = Db::getInstance()->getValue( "SELECT `value` FROM `ps_configuration` WHERE `name` = '" . pSQL( $key ) . "'" );
		return false === $value ? $default : $value;
	}

	public static function updateValue( $key, $values, $html = false, $id_shop_group = null, $id_shop = null ) {
		return Db::getInstance()->execute( "INSERT INTO `ps_configuration` (`name`, `value`) VALUES ('" . pSQL( $key ) . "', '" . pSQL( (string) $values ) . "') ON CONFLICT (`name`) DO UPDATE SET `value` = excluded.`value`" );
	}

	public static function deleteByName( $key ) {
		return Db::getInstance()->execute( "DELETE FROM `ps_configuration` WHERE `name` = '" . pSQL( $key ) . "'" );
	}

	/** One shop here: the global value is the value. */
	public static function getGlobalValue( $key, $id_lang = null ) {
		return self::get( $key );
	}

	public static function updateGlobalValue( $key, $values, $html = false ) {
		return self::updateValue( $key, $values, $html );
	}
}

class Validate {
	public static function isLoadedObject( $object ) {
		return is_object( $object ) && ! empty( $object->id );
	}
}

class Language {
	public static function getIDs( $active = true ) {
		return array( 1 );
	}
}

class OrderState {
	public $id;
	public $name;
	public $color;
	public $send_email;
	public $logable;
	public $paid;

	public function add() {
		$db       = Db::getInstance();
		$this->id = 1 + (int) $db->getValue( 'SELECT COALESCE(MAX(`id_order_state`), 99) FROM `ps_order_state`' );
		return $db->execute( 'INSERT INTO `ps_order_state` (`id_order_state`, `name`) VALUES (' . (int) $this->id . ", '" . pSQL( (string) reset( $this->name ) ) . "')" );
	}
}

class Currency {
	public $id;
	public $iso_code;
	public $precision;

	public function __construct( $id = null ) {
		$row = Db::getInstance()->getRow( 'SELECT * FROM `ps_currency` WHERE `id_currency` = ' . (int) $id );
		if ( $row ) {
			$this->id        = (int) $row['id_currency'];
			$this->iso_code  = $row['iso_code'];
			$this->precision = (int) $row['precision'];
		}
	}
}

class Order {
	public $id;
	public $id_cart;
	public $id_customer;
	public $id_currency;
	public $id_lang;
	public $module;
	public $current_state;
	public $total_paid; // PrestaShop exposes the DECIMAL as a float

	public function __construct( $id = null ) {
		$row = Db::getInstance()->getRow( 'SELECT * FROM `ps_orders` WHERE `id_order` = ' . (int) $id );
		if ( $row ) {
			$this->id            = (int) $row['id_order'];
			$this->id_cart       = (int) $row['id_cart'];
			$this->id_customer   = (int) $row['id_customer'];
			$this->id_currency   = (int) $row['id_currency'];
			$this->id_lang       = (int) $row['id_lang'];
			$this->module        = $row['module'];
			$this->current_state = (int) $row['current_state'];
			$this->total_paid    = (float) $row['total_paid'];
		}
	}

	public function update() {
		return Db::getInstance()->execute( 'UPDATE `ps_orders` SET `current_state` = ' . (int) $this->current_state . ' WHERE `id_order` = ' . (int) $this->id );
	}
}

class OrderHistory {
	public $id_order;
	public $id_order_state;

	/** Like PrestaShop: updates and saves the order's current state and returns NOTHING (it dies or throws on failure). */
	public function changeIdOrderState( $new_order_state, $id_order, $use_existing_payment = false ) {
		$order                = is_object( $id_order ) ? $id_order : new Order( (int) $id_order );
		$this->id_order_state = (int) $new_order_state;
		$order->current_state = $this->id_order_state;
		$order->update();
	}

	/** Saves the history row (PrestaShop also sends the state e-mail). */
	public function addWithemail( $autodate = true, $template_vars = false, $context = null ) {
		if ( ghostpay_test_fail_writes() ) {
			return false;
		}
		return Db::getInstance()->insert( 'order_history', array( 'id_order' => (int) $this->id_order, 'id_order_state' => (int) $this->id_order_state ) );
	}
}

class PaymentModule {
	public $name;
	public $tab;
	public $version;
	public $author;
	public $need_instance;
	public $ps_versions_compliancy;
	public $bootstrap;
	public $displayName;
	public $description;
	public $currentOrder;
	public $context;
	public $active = true;
	public $warning; // PrestaShop's Module Manager lists modules with a warning (Alerts)

	public function __construct() {}

	public function install() {
		return true;
	}

	public function uninstall() {
		return true;
	}

	public function registerHook( $hook_name ) {
		return true;
	}

	public function trans( $id, array $parameters = array(), $domain = null, $locale = null ) {
		return strtr( $id, $parameters );
	}

	/** Like PrestaShop's Module::displayError() / displayWarning() / displayConfirmation(): alert markup around the text. */
	public function displayError( $error ) {
		return '<div class="module_error alert alert-danger">' . $error . '</div>';
	}

	public function displayWarning( $warning ) {
		return '<div class="module_warning alert alert-warning">' . $warning . '</div>';
	}

	public function displayConfirmation( $text ) {
		return '<div class="module_confirmation conf confirm alert alert-success">' . $text . '</div>';
	}
}

class ModuleFrontController {
	public $module;
	public $context;
	public $errors = array();

	public function __construct() {
		$this->context = Context::getContext(); // as PrestaShop's Controller::__construct()
	}

	protected function trans( $id, array $parameters = array(), $domain = null, $locale = null ) {
		return strtr( $id, $parameters );
	}
}

/** Serves php://input from GhostPay_Test_Input::$body inside tests/request.php. */
final class GhostPay_Test_Input {
	public static $body = '';
	public $context;
	private $pos = 0;

	public function stream_open( $path, $mode, $options, &$opened_path ) {
		return 'php://input' === $path;
	}

	public function stream_read( $count ) {
		$chunk      = (string) substr( self::$body, $this->pos, $count );
		$this->pos += strlen( $chunk );
		return $chunk;
	}

	public function stream_eof() {
		return $this->pos >= strlen( self::$body );
	}

	public function stream_stat() {
		return array();
	}
}
