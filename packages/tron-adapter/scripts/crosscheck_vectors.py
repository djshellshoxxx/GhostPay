#!/usr/bin/env python3
"""Independent cross-check of test-vectors/tron.json (ADR-0019). Shares no code with the TypeScript.

Own implementations here: base58check (hashlib sha256), keccak-256 (Keccak-f[1600]), secp256k1
affine arithmetic, and a hand-written protobuf reader for Transaction.raw.
Usage: python3 -I crosscheck_vectors.py [path/to/tron.json]
"""
import hashlib, json, os, sys

A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def b58enc(b):
    n = int.from_bytes(b, 'big'); s = ''
    while n:
        n, r = divmod(n, 58); s = A[r] + s
    return '1' * (len(b) - len(b.lstrip(b'\0'))) + s

def b58dec(s):
    n = 0
    for ch in s: n = n * 58 + A.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    return b'\0' * (len(s) - len(s.lstrip('1'))) + raw

def dsha(b): return hashlib.sha256(hashlib.sha256(b).digest()).digest()
def tron_enc(raw21): return b58enc(raw21 + dsha(raw21)[:4])
def tron_dec(s):
    d = b58dec(s); assert len(d) == 25 and d[0] == 0x41, 'shape'
    assert dsha(d[:21])[:4] == d[21:], 'checksum'
    return d[:21]

# --- keccak-256 ---
RC = [0x0000000000000001,0x0000000000008082,0x800000000000808A,0x8000000080008000,0x000000000000808B,0x0000000080000001,0x8000000080008081,0x8000000000008009,0x000000000000008A,0x0000000000000088,0x0000000080008009,0x000000008000000A,0x000000008000808B,0x800000000000008B,0x8000000000008089,0x8000000000008003,0x8000000000008002,0x8000000000000080,0x000000000000800A,0x800000008000000A,0x8000000080008081,0x8000000000008080,0x0000000080000001,0x8000000080008008]
ROT = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]]
M64 = (1 << 64) - 1
def rol(x, n): return ((x << n) | (x >> (64 - n))) & M64 if n else x
def f1600(a):
    for rc in RC:
        c = [a[x][0]^a[x][1]^a[x][2]^a[x][3]^a[x][4] for x in range(5)]
        d = [c[(x-1)%5] ^ rol(c[(x+1)%5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0]*5 for _ in range(5)]
        for x in range(5):
            for y in range(5): b[y][(2*x+3*y)%5] = rol(a[x][y], ROT[x][y])
        a = [[b[x][y] ^ ((~b[(x+1)%5][y]) & b[(x+2)%5][y]) for y in range(5)] for x in range(5)]
        a[0][0] ^= rc
    return a
def keccak256(m):
    rate = 136
    m = bytearray(m); m.append(0x01)
    while len(m) % rate: m.append(0)
    m[-1] |= 0x80
    st = [[0]*5 for _ in range(5)]
    for off in range(0, len(m), rate):
        blk = m[off:off+rate]
        for i in range(rate // 8):
            st[i % 5][i // 5] ^= int.from_bytes(blk[8*i:8*i+8], 'little')
        st = f1600(st)
    out = b''.join(st[i % 5][i // 5].to_bytes(8, 'little') for i in range(4))
    return out[:32]
assert keccak256(b'').hex() == 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'

# --- secp256k1 ---
P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798, 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)
def add(p, q):
    if p is None: return q
    if q is None: return p
    if p[0] == q[0] and (p[1] + q[1]) % P == 0: return None
    if p == q: l = 3 * p[0] * p[0] * pow(2 * p[1], -1, P) % P
    else: l = (q[1] - p[1]) * pow(q[0] - p[0], -1, P) % P
    x = (l * l - p[0] - q[0]) % P
    return (x, (l * (p[0] - x) - p[1]) % P)
def mul(k, p):
    r = None
    while k:
        if k & 1: r = add(r, p)
        p = add(p, p); k >>= 1
    return r
def decomp(b):
    x = int.from_bytes(b[1:], 'big'); y = pow((x**3 + 7) % P, (P + 1) // 4, P)
    if y % 2 != b[0] % 2: y = P - y
    assert (y * y - x**3 - 7) % P == 0
    return (x, y)
def comp(pt): return bytes([2 + pt[1] % 2]) + pt[0].to_bytes(32, 'big')
def addr_of(pt): return b'\x41' + keccak256(pt[0].to_bytes(32, 'big') + pt[1].to_bytes(32, 'big'))[12:]

# --- protobuf ---
def fields(b):
    i = 0; out = []
    def rv():
        nonlocal i
        r = s = 0
        while True:
            c = b[i]; i += 1; r |= (c & 0x7f) << s; s += 7
            if not c & 0x80: return r
    while i < len(b):
        k = rv(); f, w = k >> 3, k & 7
        if w == 0: out.append((f, rv()))
        elif w == 2:
            n = rv(); out.append((f, b[i:i+n])); i += n
        else: raise AssertionError('wire')
    return out

def main(path):
    v = json.load(open(path))
    for a in v['addresses']:
        assert tron_enc(bytes.fromhex(a['hex'])).__eq__(a['base58']), a['name']
        assert tron_dec(a['base58']).hex() == a['hex'], a['name']
    # privkey 1 -> address
    assert tron_enc(addr_of(G)) == v['addresses'][1]['base58']
    s = v['stealth']
    S = decomp(bytes.fromhex(s['spendPublicKey'])); V = decomp(bytes.fromhex(s['viewPublicKey']))
    assert comp(mul(int(s['spendSecret'], 16), G)) == bytes.fromhex(s['spendPublicKey'])
    r = int(s['ephemeralSecret'], 16)
    R = mul(r, G); assert comp(R).hex() == s['ephemeralPublicKey']
    h = keccak256(comp(mul(r, V)))
    assert h[0] == s['viewTag']
    Q = add(S, mul(int.from_bytes(h, 'big') % N, G))
    assert tron_enc(addr_of(Q)) == s['stealthAddress'], 'stealth address'
    # recipient side: same shared secret via viewing key
    assert comp(mul(int(s['viewSecret'], 16), R)) == comp(mul(r, V))
    p = (int(s['spendSecret'], 16) + int.from_bytes(h, 'big')) % N
    assert tron_enc(addr_of(mul(p, G))) == s['stealthAddress'], 'spend key'
    memo = b'GPT1' + comp(R) + bytes([h[0]])
    assert memo.hex() == s['memoHex']
    for t in v['txs']:
        raw = bytes.fromhex(t['rawDataHex'])
        assert hashlib.sha256(raw).hexdigest() == t['txID']
        f = fields(raw); keys = [k for k, _ in f]
        assert keys == sorted(keys), 'field order'
        d = dict(f)
        n = int(t['refBlockNumber']); bid = bytes.fromhex(t['refBlockId'])
        assert d[1] == (n & 0xffff).to_bytes(2, 'big') and d[4] == bid[8:16]
        assert d[8] == int(t['expirationMs']) and d[14] == int(t['timestampMs'])
        assert d[10].hex() == t['memoHex']
        c = dict(fields(d[11])); any_ = dict(fields(c[2])); val = dict(fields(any_[2]))
        assert val[1] == tron_dec(t['owner'])
        if t['kind'] == 'trc20':
            assert c[1] == 31 and any_[1] == b'type.googleapis.com/protocol.TriggerSmartContract'
            assert d[18] == int(t['feeLimitSun'])
            assert val[2] == tron_dec(t['contract'])
            data = val[4]; assert len(data) == 68 and data[:4].hex() == 'a9059cbb'
            assert data[4:16] == bytes(12) and b'\x41' + data[16:36] == tron_dec(t['to'])
            assert int.from_bytes(data[36:], 'big') == int(t['amount'])
        else:
            assert c[1] == 1 and any_[1] == b'type.googleapis.com/protocol.TransferContract'
            assert 18 not in d
            assert val[2] == tron_dec(t['to']) and val[3] == int(t['amount'])
    print('tron vectors OK')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test-vectors', 'tron.json'))
