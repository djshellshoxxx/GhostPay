#!/usr/bin/env python3
"""Qualify pinned WooCommerce callbacks in a disposable loopback-only WordPress/MariaDB fixture.

Requires PHP with mysqli, ctype, mbstring, XML, curl, and a MariaDB prefix containing
bin/mariadb, bin/mariadb-install-db and sbin/mariadbd. Never points at an existing shop/database.
"""
import argparse
import concurrent.futures
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ARCHIVES = [
    ('wordpress-7.1.4.tar.gz', 'https://wordpress.org/wordpress-7.1.4.tar.gz', '881e53a4681ff2cd911651b11cccdede5ae477ddf0765af5d6a1a8b219a1d835'),
    ('woocommerce.11.2.2.zip', 'https://downloads.wordpress.org/plugin/woocommerce.11.2.2.zip', 'a4746183efd951de5837396aad119f7cf508f06cb699ccb590a01cada4c44932'),
]


def fetch_archive(cache, specification):
    name, url, expected = specification
    target = cache / name
    if not target.exists():
        with urllib.request.urlopen(url, timeout=60) as response, target.open('xb') as output:
            shutil.copyfileobj(response, output)
    if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        raise RuntimeError(f'Archive digest mismatch: {name}; remove it before retrying')
    return target


def stop(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def qualify(args):
    args.output.mkdir(parents=True, exist_ok=True)
    cache = args.output / 'downloads'
    cache.mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        archives = list(pool.map(lambda item: fetch_archive(cache, item), ARCHIVES))
    with tempfile.TemporaryDirectory(prefix='ghostpay-shop-') as temporary:
        work = Path(temporary)
        wp = work / 'wordpress'
        with tarfile.open(archives[0]) as archive:
            archive.extractall(work, filter='data')
        with zipfile.ZipFile(archives[1]) as archive:
            if any(Path(name).is_absolute() or '..' in Path(name).parts for name in archive.namelist()):
                raise RuntimeError('Invalid archive paths')
            archive.extractall(wp / 'wp-content/plugins')
        shutil.copytree(ROOT / 'integrations/woocommerce/ghostpay-for-woocommerce', wp / 'wp-content/plugins/ghostpay-for-woocommerce')
        database = work / 'db'
        database.mkdir(mode=0o700)
        env = dict(os.environ, GHOSTPAY_DISPOSABLE_SHOP='1', GHOSTPAY_TEST_WP_ROOT=str(wp),
                   GHOSTPAY_SERVICE_SECRET=secrets.token_hex(32), GHOSTPAY_WEBHOOK_SECRET=secrets.token_hex(32))
        # No configured shop/keys are reused. Only the trusted pinned fixture packages are bootstrapped.
        config = """<?php
define('DB_NAME','ghostpay_shop_test');
define('DB_USER','root');
define('DB_PASSWORD','');
define('DB_HOST','127.0.0.1:13317');
define('DB_CHARSET','utf8mb4');
define('DB_COLLATE','');
define('WP_HOME','http://127.0.0.1:18886');
define('WP_SITEURL','http://127.0.0.1:18886');
define('WP_HTTP_BLOCK_EXTERNAL',true);
define('DISABLE_WP_CRON',true);
define('AUTOMATIC_UPDATER_DISABLED',true);
define('WP_DEBUG',false);
$table_prefix='wp_';
"""
        for name in ['AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY', 'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT']:
            config += f"define('{name}','{secrets.token_hex(32)}');\n"
        config += "if (!defined('ABSPATH')) {define('ABSPATH',__DIR__.'/');}\nrequire_once ABSPATH.'wp-settings.php';\n"
        (wp / 'wp-config.php').write_text(config)
        (wp / 'wp-config.php').chmod(0o600)
        mu = wp / 'wp-content/mu-plugins'
        mu.mkdir(exist_ok=True)
        (mu / 'offline-test.php').write_text("<?php\nadd_filter('pre_wp_mail', static fn() => true);\nadd_filter('pre_http_request', static fn() => new WP_Error('offline_test','External requests disabled'),10,3);\n")
        install = work / 'install.php'
        install.write_text("""<?php
define('WP_INSTALLING',true);
require getenv('GHOSTPAY_TEST_WP_ROOT').'/wp-load.php';
require_once ABSPATH.'wp-admin/includes/upgrade.php';
require_once ABSPATH.'wp-admin/includes/plugin.php';
wp_install('GhostPay disposable qualification','fixture-admin','admin@example.test',false,'',bin2hex(random_bytes(20)));
foreach (['woocommerce/woocommerce.php','ghostpay-for-woocommerce/ghostpay-for-woocommerce.php'] as $plugin) {
 $result=activate_plugin($plugin);
 if(is_wp_error($result)){throw new RuntimeException($result->get_error_message());}
}
echo 'installed';
""")
        prefix = args.mariadb_prefix
        client = [str(prefix / 'bin/mariadb'), '--no-defaults', '--protocol=tcp', '--host=127.0.0.1', '--port=13317', '-u', 'root']
        with (args.output / 'database-init.log').open('w') as log:
            subprocess.run([str(prefix / 'bin/mariadb-install-db'), '--no-defaults', '--basedir='+str(prefix), '--datadir='+str(database), '--skip-test-db', '--auth-root-authentication-method=normal'], env=env, stdout=log, stderr=log, check=True, timeout=60)
        server = http = None
        try:
            server = subprocess.Popen([str(prefix / 'sbin/mariadbd'), '--no-defaults', '--basedir='+str(prefix), '--datadir='+str(database), '--socket=', '--bind-address=127.0.0.1', '--port=13317', '--pid-file='+str(work / 'db.pid'), '--innodb-buffer-pool-size=32M', '--log-error='+str(args.output / 'database.log')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError('Database exited; inspect database.log')
                result = subprocess.run(client+['-e', 'SELECT 1'], env=env, capture_output=True, timeout=3)
                if result.returncode == 0:
                    break
                time.sleep(.1)
            else:
                raise RuntimeError('Loopback database unavailable')
            subprocess.run(client+['-e', 'CREATE DATABASE ghostpay_shop_test'], env=env, capture_output=True, check=True, timeout=10)
            installed = subprocess.run([str(args.php), str(install)], env=env, capture_output=True, text=True, timeout=90, check=True)
            if installed.stdout.strip() != 'installed':
                raise RuntimeError('WordPress installation did not complete cleanly: '+installed.stdout[-1000:])
            with (args.output / 'http.log').open('w') as log:
                http = subprocess.Popen([str(args.php), '-S', '127.0.0.1:18886', '-t', str(wp)], env=env, stdout=log, stderr=log)
                time.sleep(.3)
                run_cases(args, env)
        finally:
            stop(http)
            stop(server)


def run_cases(args, env):
    checks = []
    def call(*argv):
        result = subprocess.run([str(args.php), str(ROOT / 'scripts/companion-merchant/shop-woocommerce-probe.php'), *argv], env=env, capture_output=True, text=True, timeout=45, check=True)
        return json.loads(result.stdout)
    def check(ok, label):
        if not ok:
            raise AssertionError(label)
        checks.append(label)
        print('PASS', label, flush=True)
    def event(order, identity, kind='invoice.paid', amount='1250', currency='USD', payment='tx-default', invoice=None):
        return {'id':identity,'type':kind,'createdAt':int(time.time()),'data':{'invoiceId':invoice or order['invoiceId'],'currency':currency,'amountMinor':amount,'paymentId':payment}}
    def send(value, header=None):
        body=json.dumps(value,separators=(',',':')).encode()
        now=int(time.time()); nonce=secrets.token_hex(16)
        mac=hmac.new(bytes.fromhex(env['GHOSTPAY_WEBHOOK_SECRET']),f'{now}.{nonce}.'.encode()+body,hashlib.sha256).hexdigest()
        header=header or f't={now},n={nonce},v1={mac}'
        request=urllib.request.Request('http://127.0.0.1:18886/?wc-api=ghostpay',data=body,headers={'Content-Type':'application/json','GhostPay-Signature':header})
        try:
            with urllib.request.urlopen(request,timeout=15) as response:
                return response.status,json.loads(response.read()),header
        except urllib.error.HTTPError as error:
            return error.code,json.loads(error.read()),header
    for mode in ['legacy','hpos']:
        call('configure',mode)
        check(call('settings')=={'fieldsRendered':True,'secretInputs':False},mode+' real settings rendering without secret inputs')
        checkout=call('checkout')
        check(checkout['signedExactRequest'] and checkout['redirectAccepted'] and not checkout['bearerStored'],mode+' checkout callback validates signed fixture request and redirect')
        check(send(event(checkout,'checkout-paid-'+str(checkout['id']),payment='checkout-'+str(checkout['id'])))[0]==200 and call('inspect',str(checkout['id']))['status'] in ['processing','completed'],mode+' checkout-to-webhook transition')
        tag=mode+'-'+secrets.token_hex(4); order=call('create',tag)
        check(order['hpos']==(mode=='hpos'),mode+' requested data store active')
        check(send(event(order,'expired-old-'+tag,'invoice.expired',payment='old-'+tag,invoice='old-'+tag))[0]==200,mode+' old invoice expiry accepted')
        check(call('inspect',str(order['id']))['status']=='pending',mode+' old expiry preserves current pending invoice')
        paid=event(order,'paid-'+tag,payment='paid-'+tag)
        check(send(paid)[0]==200,mode+' webhook callback accepted')
        state=call('inspect',str(order['id']))
        check(state['status'] in ['processing','completed'],mode+' persisted order paid')
        duplicate=send(paid)
        check(duplicate[0]==200 and duplicate[1]['duplicate'],mode+' fresh nonce completed duplicate')
        check(call('inspect',str(order['id']))==state,mode+' duplicate has no repeated order effects')
        check(send(paid,header=duplicate[2])[0]==400,mode+' signature replay rejected')
        wrong=call('create','currency-'+tag)
        check(send(event(wrong,'currency-'+tag,currency='EUR',payment='currency-'+tag))[0]==200 and call('inspect',str(wrong['id']))['status']=='pending',mode+' currency mismatch stays unpaid')
        partial=call('create','partial-'+tag)
        check(send(event(partial,'partial-'+tag,'invoice.partial','100',payment='partial-'+tag))[0]==200 and call('inspect',str(partial['id']))['status']=='pending',mode+' partial stays unpaid')
        late=call('create','late-'+tag,'cancelled')
        check(send(event(late,'late-'+tag,payment='late-'+tag))[0]==200 and call('inspect',str(late['id']))['status'] in ['processing','completed'],mode+' late payment on cancelled order')
    evidence={'platform':{'wordpress':'7.1.4','woocommerce':'11.2.2'},'checks':checks,'count':len(checks),'limitations':['Invoice service is a local WordPress HTTP fixture; no live service or payment authority.','No browser, real PrestaShop, concurrent remote-side-effect, process-crash, or production qualification.']}
    (args.output / 'result.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print('PASS TOTAL',len(checks))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--php',type=Path,required=True)
    parser.add_argument('--mariadb-prefix',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    args.php=args.php.resolve(); args.mariadb_prefix=args.mariadb_prefix.resolve(); args.output=args.output.resolve()
    qualify(args)
