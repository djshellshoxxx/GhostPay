from pathlib import Path
import subprocess,json,hashlib
root=Path.cwd()
path=root/'test-vectors/meta-address-sol-tron-v1.json'
before=path.read_bytes()
try:
    subprocess.run(['/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node','packages/chain-solana/scripts/gen-meta-address-sol-tron-vectors.mjs'],check=True)
    actual=json.loads(path.read_bytes()); expected=json.loads(before)
    actual_metadata={k:actual.pop(k) for k in ('generatedAt','node')}
    expected_metadata={k:expected.pop(k) for k in ('generatedAt','node')}
    assert actual==expected, 'web-generated vectors differ beyond generation date and Node version'
    semantic=json.dumps(actual,sort_keys=True,separators=(',',':')).encode()
    print(json.dumps({'vector_payload_identical':True,'semantic_sha256':hashlib.sha256(semantic).hexdigest(),'saved_metadata':expected_metadata,'reproduced_metadata':actual_metadata,'web_only_generator':True,'original_fixture_restored':True},sort_keys=True))
finally:
    path.write_bytes(before)
