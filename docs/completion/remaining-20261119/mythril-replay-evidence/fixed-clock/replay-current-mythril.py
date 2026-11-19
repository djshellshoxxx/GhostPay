"""Replay the exact 28edbcf report inputs on a disposable local Anvil.

This checks the concrete supplied traces, not every symbolic path or an analyzer gate.
No chain is contacted other than the child process's loopback endpoint.
"""
from pathlib import Path
import hashlib
import json
import socket
import subprocess
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
ANVIL = Path('/workspace/scratch/75c78c17e2fc/contract-tools/anvil')
CAST = ANVIL.with_name('cast')
REPORT = Path('/workspace/scratch/6eafdb04d91b/GhostPay/docs/handoffs/agents/evidence/mythril-28edbcf-20261119/report.log')
raw = REPORT.read_text()
assert hashlib.sha256(REPORT.read_bytes()).hexdigest() == '84f4f5846b68054fac52dc4968da78996d520c03c4049318ddc62ba4424b642e'
decoder = json.JSONDecoder()
reports = []
cursor = 0
while True:
    cursor = raw.find('{', cursor)
    if cursor < 0:
        break
    try:
        report, size = decoder.raw_decode(raw[cursor:])
    except json.JSONDecodeError:
        cursor += 1
        continue
    cursor += size
    if isinstance(report, dict) and 'issues' in report:
        reports.append(report)
assert len(reports) == 5

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
endpoint = f'http://127.0.0.1:{port}'
sequence_id = 0

def rpc(method, params):
    global sequence_id
    sequence_id += 1
    req = urllib.request.Request(endpoint, json.dumps({
        'jsonrpc': '2.0', 'id': sequence_id, 'method': method, 'params': params,
    }).encode(), {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)

selectors = {}
for error in ['Expired()', 'InvalidAmount()', 'ZeroAmount()', 'InvalidDestination()', 'ImplementationHasNoCode()']:
    selector = subprocess.check_output([str(CAST), 'sig', error], text=True).strip()
    selectors[selector] = error

log = open(HERE / 'mythril-current-anvil.log', 'w')
child = subprocess.Popen([str(ANVIL), '--host', '127.0.0.1', '--port', str(port), '--timestamp', '0', '--silent'], stdout=log, stderr=log)
output = {
    'scope': 'Exact 28edbcf Mythril trace inputs; fresh concrete replay, no patched production code',
    'analyzedSource': '28edbcf55093a6d6056232fd59ef37a2ae832b9a',
    'recordedUtc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    'anvilSha256': hashlib.sha256(ANVIL.read_bytes()).hexdigest(),
    'castSha256': hashlib.sha256(CAST.read_bytes()).hexdigest(),
    'reportSha256': hashlib.sha256(raw.encode()).hexdigest(),
    'anvilVersion': subprocess.check_output([str(ANVIL), '--version'], text=True).strip(),
    'stateModel': 'Anvil precompiles with explicit zero block timestamp interval; original creation bytecode and supplied calldata; deployer funded and impersonated only; report initialState actor balances/storage not injected',
    'errorSelectors': selectors,
    'findings': [],
}
try:
    for _ in range(100):
        try:
            rpc('eth_chainId', [])
            break
        except (urllib.error.URLError, ConnectionError):
            if child.poll() is not None:
                raise RuntimeError('Anvil exited before startup')
            time.sleep(0.05)
    else:
        raise RuntimeError('Anvil startup timed out')
    interval = rpc('anvil_setBlockTimestampInterval', [0])
    assert 'error' not in interval, interval
    output['blockTimestampInterval'] = 0
    output['implementationAddressCode'] = rpc('eth_getCode', ['0x0000000000000000000000000000000000000001', 'latest'])['result']
    assert output['implementationAddressCode'] == '0x'
    for report_index, report in enumerate(reports):
        for issue_index, issue in enumerate(report['issues']):
            steps = issue['tx_sequence']['steps']
            creation = steps[0]
            origin = creation['origin']
            rpc('anvil_setBalance', [origin, hex(10**30)])
            rpc('anvil_impersonateAccount', [origin])
            tx = {'from': origin, 'data': creation['input'], 'value': creation['value'], 'gas': hex(20_000_000)}
            item = {
                'reportIndex': report_index, 'issueIndex': issue_index,
                'contract': issue['contract'], 'swc': issue['swc-id'], 'pc': issue['address'],
                'creationInputSha256': hashlib.sha256(creation['input'].encode()).hexdigest(),
            }
            result = rpc('eth_call', [tx, 'latest'])
            if report_index == 4:
                item['creationCall'] = result.get('error', {'unexpectedSuccess': True})
                item['expectedConstructorRejection'] = result.get('error', {}).get('data') in selectors and selectors[result['error']['data']] == 'ImplementationHasNoCode()'
            else:
                assert 'error' not in result, result
                sent = rpc('eth_sendTransaction', [tx])
                assert 'result' in sent, sent
                receipt = None
                for _ in range(100):
                    receipt = rpc('eth_getTransactionReceipt', [sent['result']])['result']
                    if receipt is not None:
                        break
                    time.sleep(0.05)
                assert receipt is not None, 'receipt timeout'
                assert receipt['status'] == '0x1', receipt
                address = receipt['contractAddress']
                block = rpc('eth_getBlockByNumber', [receipt['blockNumber'], False])['result']
                item['deploymentTimestamp'] = int(block['timestamp'], 16)
                item['calls'] = []
                for step in steps[1:]:
                    rpc('anvil_setBalance', [step['origin'], hex(10**30)])
                    call = rpc('eth_call', [{'from': step['origin'], 'to': address, 'data': step['input'], 'value': step['value'], 'gas': hex(20_000_000)}, 'latest'])
                    error = call.get('error')
                    item['calls'].append({
                        'inputSha256': hashlib.sha256(step['input'].encode()).hexdigest(),
                        'result': call.get('result'), 'error': error,
                        'decodedError': selectors.get(error.get('data')) if error else None,
                    })
            output['findings'].append(item)
finally:
    child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=5)
    log.close()
    (HERE / 'mythril-current-concrete-replay.json').write_text(json.dumps(output, indent=2) + '\n')
assert all(x.get('deploymentTimestamp', 0) == 0 for x in output['findings'])
assert len(output['findings']) == 11
assert sum(x.get('expectedConstructorRejection') is True for x in output['findings']) == 8
assert [[c['decodedError'] for c in x['calls']] for x in output['findings'] if 'calls' in x] == [['InvalidAmount()'], ['ZeroAmount()'], ['InvalidDestination()']]
print(json.dumps({'findings': len(output['findings']), 'factory_constructor_rejections': 8, 'expiry_calls_rejected': 3, 'state_model': output['stateModel']}))
