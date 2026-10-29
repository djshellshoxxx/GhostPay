<?php
/**
 * GhostPay for PrestaShop (skeleton): redirects the customer to a GhostPay payment link created by the merchant's own
 * invoice service, and completes the order from a signed webhook. No remote scripts, no third-party calls.
 *
 * @package GhostPay_PrestaShop
 */

if ( ! defined( '_PS_VERSION_' ) ) {
	exit;
}

require_once __DIR__ . '/classes/class-ghostpay-signature.php';
require_once __DIR__ . '/classes/class-ghostpay-money.php';
require_once __DIR__ . '/classes/class-ghostpay-event.php';
require_once __DIR__ . '/classes/class-ghostpay-secrets.php';

use PrestaShop\PrestaShop\Core\Payment\PaymentOption;

class Ghostpay extends PaymentModule {

	public function __construct() {
		$this->name                   = 'ghostpay';
		$this->tab                    = 'payments_gateways';
		$this->version                = '0.1.0';
		$this->author                 = 'GhostPay contributors';
		$this->need_instance          = 0;
		$this->ps_versions_compliancy = array( 'min' => '8.0.0', 'max' => _PS_VERSION_ );
		$this->bootstrap              = true;
		parent::__construct();
		$this->displayName = $this->trans( 'GhostPay', array(), 'Modules.Ghostpay.Admin' );
		$this->description = $this->trans( 'Private crypto payments via a GhostPay payment link.', array(), 'Modules.Ghostpay.Admin' );
		// Secrets live only in constants or the environment: delete copies stored by earlier versions and warn until each
		// is replaced. PrestaShop's Module Manager lists modules with a warning (Alerts); getContent() shows it too.
		GhostPay_Secrets::purge_stored();
		$unrotated = GhostPay_Secrets::unrotated();
		if ( array() !== $unrotated ) {
			$this->warning = $this->trans(
				'An earlier version stored %names% in the shop configuration, where database backups and the webservice API expose them. They were deleted. Generate new secrets, set them in config/defines_custom.inc.php (or the environment) and in your invoice service; the old values must not be used again.',
				array( '%names%' => implode( ', ', $unrotated ) ),
				'Modules.Ghostpay.Admin'
			);
		}
	}

	public function install() {
		return parent::install()
			&& $this->registerHook( 'paymentOptions' )
			&& $this->createInvoiceTable()
			&& $this->createOrderState();
	}

	public function uninstall() {
		return parent::uninstall()
			&& Configuration::deleteByName( 'GHOSTPAY_SERVICE_URL' )
			&& Configuration::deleteByName( 'GHOSTPAY_PAY_HOST' )
			&& Configuration::deleteByName( 'GHOSTPAY_SERVICE_SECRET' )
			&& Configuration::deleteByName( 'GHOSTPAY_WEBHOOK_SECRET' )
			&& Configuration::deleteByName( GhostPay_Secrets::EXPOSED )
			&& Db::getInstance()->execute( 'DROP TABLE IF EXISTS `' . _DB_PREFIX_ . 'ghostpay_invoice`' )
			&& Db::getInstance()->execute( 'DROP TABLE IF EXISTS `' . _DB_PREFIX_ . 'ghostpay_event_claim`' )
			&& Db::getInstance()->execute( 'DROP TABLE IF EXISTS `' . _DB_PREFIX_ . 'ghostpay_nonce`' );
	}

	private function createInvoiceTable(): bool {
		$db = Db::getInstance();
		return $db->execute(
			'CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'ghostpay_invoice` (
				`invoice_id` VARCHAR(128) NOT NULL, `id_order` INT UNSIGNED NOT NULL,
				PRIMARY KEY (`invoice_id`), KEY (`id_order`)) ENGINE=' . _MYSQL_ENGINE_ . ' DEFAULT CHARSET=utf8mb4'
		) && $db->execute(
			// Unique identity keys atomically serialize both provider event IDs and transaction IDs.
			'CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'ghostpay_event_claim` (
				`claim_key` CHAR(64) NOT NULL, `claim_token` CHAR(32) NOT NULL,
				`claim_state` ENUM("processing","complete") NOT NULL, `lease_until` INT UNSIGNED NOT NULL,
				PRIMARY KEY (`claim_key`), KEY (`lease_until`)) ENGINE=' . _MYSQL_ENGINE_ . ' DEFAULT CHARSET=utf8mb4'
		) && $db->execute(
			// Primary key makes the nonce claim atomic (INSERT fails on a duplicate).
			'CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'ghostpay_nonce` (
				`nonce` VARCHAR(64) NOT NULL, `expires` INT UNSIGNED NOT NULL, PRIMARY KEY (`nonce`)) ENGINE=' . _MYSQL_ENGINE_ . ' DEFAULT CHARSET=utf8mb4'
		);
	}

	private function createOrderState(): bool {
		if ( Configuration::get( 'GHOSTPAY_OS_AWAITING' ) ) {
			return true;
		}
		$state                = new OrderState();
		$state->name          = array_fill_keys( Language::getIDs( false ), 'Awaiting GhostPay payment' );
		$state->color         = '#4169E1';
		$state->send_email    = false;
		$state->logable       = false;
		$state->paid          = false;
		return $state->add() && Configuration::updateValue( 'GHOSTPAY_OS_AWAITING', (int) $state->id );
	}

	/**
	 * Back-office settings. Form posts are protected by PrestaShop's admin token; capability is the admin session. No
	 * secret fields: Configuration is in every database backup and the webservice API (see GhostPay_Secrets).
	 */
	public function getContent() {
		$out = '' === (string) $this->warning ? '' : $this->displayWarning( $this->warning );
		if ( Tools::isSubmit( 'submitGhostpay' ) ) {
			$url  = trim( (string) Tools::getValue( 'GHOSTPAY_SERVICE_URL' ) );
			$host = strtolower( trim( (string) Tools::getValue( 'GHOSTPAY_PAY_HOST' ) ) );
			if ( ! preg_match( '#\Ahttps://[^\s/?\#@]+(/[^\s?\#]*)?\z#', $url ) || ! preg_match( '/\A[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\z/', $host ) ) {
				$out .= $this->displayError( $this->trans( 'Invalid URL or host.', array(), 'Modules.Ghostpay.Admin' ) );
			} else {
				Configuration::updateValue( 'GHOSTPAY_SERVICE_URL', rtrim( $url, '/' ) );
				Configuration::updateValue( 'GHOSTPAY_PAY_HOST', $host );
				$out .= $this->displayConfirmation( $this->trans( 'Saved.', array(), 'Modules.Ghostpay.Admin' ) );
			}
		}
		// TODO(skeleton): render the form with HelperForm (the two fields above only; never a secret input).
		return $out;
	}

	public function hookPaymentOptions( $params ) {
		if ( ! $this->active || '' === (string) Configuration::get( 'GHOSTPAY_SERVICE_URL' ) ) {
			return array();
		}
		$option = new PaymentOption();
		$option->setModuleName( $this->name )
			->setCallToActionText( $this->trans( 'Pay with GhostPay', array(), 'Modules.Ghostpay.Shop' ) )
			// CSRF: the static token is checked in the validation controller.
			->setAction( $this->context->link->getModuleLink( $this->name, 'validation', array( 'token' => Tools::getToken( false ) ), true ) );
		return array( $option );
	}

	/** @internal Used by controllers. @param string $which 'service' or 'webhook'. @return string|null binary secret from a constant or the environment only */
	public function secret( string $which ): ?string {
		return GhostPay_Signature::secret_from_hex( GhostPay_Secrets::hex( $which ) );
	}

	/** @internal Used by the validation controller: link an invoice to its order. @return bool false if not stored */
	public function recordInvoice( string $invoice_id, int $order_id ): bool {
		try {
			return (bool) Db::getInstance()->insert( 'ghostpay_invoice', array( 'invoice_id' => pSQL( $invoice_id ), 'id_order' => $order_id ) );
		} catch ( Exception $e ) {
			if ( self::isDuplicateKey( $e ) ) {
				return false; // the invoice id is already linked to an order: never relink it
			}
			throw $e;
		}
	}

	/**
	 * @internal True for a duplicate key (SQLSTATE 23000). On PHP 8 PDO throws it; PrestaShop 8's DbPDO rethrows it as a
	 * PrestaShopException with the PDOException as previous. Any other database error is not a duplicate.
	 */
	public static function isDuplicateKey( Throwable $e ): bool {
		for ( $cause = $e; null !== $cause; $cause = $cause->getPrevious() ) {
			if ( $cause instanceof PDOException && '23000' === (string) $cause->getCode() ) {
				return true;
			}
		}
		return false;
	}

	/** Return the exact DECIMAL persisted by PrestaShop, never a float round-trip. */
	public function exactOrderTotal( int $order_id ): ?string {
		if ( $order_id <= 0 ) {
			return null;
		}
		$value = Db::getInstance()->getValue(
			'SELECT CAST(`total_paid` AS CHAR) FROM `' . _DB_PREFIX_ . 'orders` WHERE `id_order` = ' . (int) $order_id
		);
		return is_string( $value ) ? $value : null;
	}

	/**
	 * @internal Used by both controllers: the exact order total in the GhostPay app's minor units of its currency
	 * (GhostPay_Money::currency_minor), never scaled by the shop's display precision. Null if not exactly representable.
	 */
	public function orderTotalMinor( int $order_id, string $iso_code ): ?string {
		$exact_total = $this->exactOrderTotal( $order_id );
		return null === $exact_total ? null : GhostPay_Money::currency_minor( $exact_total, $iso_code );
	}
}
