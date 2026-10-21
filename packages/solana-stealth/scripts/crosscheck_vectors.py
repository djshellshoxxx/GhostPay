#!/usr/bin/env python3
"""Independent cross-check of test-vectors/solana-stealth.json (ADR-0017).

Shares NO code with the TypeScript implementation: ed25519 group arithmetic is a from-scratch
port of the RFC 8032 section 6 reference algorithms (Python ints), hashing uses hashlib, base58 is
re-implemented here, the legacy Solana message format is parsed by hand, ATA PDAs are derived
here, and every signature is additionally verified with OpenSSL via `cryptography` (if present).

Usage: python3 -I crosscheck_vectors.py <path/to/solana-stealth.json>
Exit 0 on success; raises AssertionError with the failing field otherwise.
"""
import hashlib
import json
import sys

P = 2**255 - 19
L = 2**252 + 27742317777372353535851937790883648493
D = (-121665 * pow(121666, P - 2, P)) % P
SQRT_M1 = pow(2, (P - 1) // 4, P)


def _add(p1, p2):
    x1, y1, z1, t1 = p1
    x2, y2, z2, t2 = p2
    a = (y1 - x1) * (y2 - x2) % P
    b = (y1 + x1) * (y2 + x2) % P
    c = t1 * 2 * D * t2 % P
    d = z1 * 2 * z2 % P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def _mul(s, pt):
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _add(q, pt)
        pt = _add(pt, pt)
        s >>= 1
    return q


def _eq(p1, p2):
    x1, y1, z1, _ = p1
    x2, y2, z2, _ = p2
    return (x1 * z2 - x2 * z1) % P == 0 and (y1 * z2 - y2 * z1) % P == 0


IDENT = (0, 1, 1, 0)
GY = 4 * pow(5, P - 2, P) % P


def _recover_x(y, sign):
    if y >= P:
        return None
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P)
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P != 0:
        x = x * SQRT_M1 % P
    if (x * x - x2) % P != 0:
        return None
    if (x & 1) != sign:
        x = P - x
    return x


G = (_recover_x(GY, 0), GY, 1, _recover_x(GY, 0) * GY % P)


def encode(pt):
    x, y, z, _ = pt
    zi = pow(z, P - 2, P)
    x, y = x * zi % P, y * zi % P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def decode_strict(b):
    """RFC 8032 decode (rejects y >= p and x=0 with sign bit). Returns point or None."""
    if len(b) != 32:
        return None
    y = int.from_bytes(b, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % P)


def valid_public(b):
    """GhostPay acceptance rule: canonical, not small order, torsion-free."""
    pt = decode_strict(b)
    if pt is None or encode(pt) != bytes(b):
        return False
    if _eq(_mul(8, pt), IDENT):
        return False
    return _eq(_mul(L, pt), IDENT)


def le(b):
    return int.from_bytes(b, "little")


def le32(n):
    return int.to_bytes(n, 32, "little")


def dst(label):
    tag = ("GhostPay/solana-stealth/v1/" + label).encode()
    return bytes([len(tag)]) + tag


def h512_scalar(label, *parts):
    return le(hashlib.sha512(dst(label) + b"".join(parts)).digest()) % L


def h256(label, *parts):
    return hashlib.sha256(dst(label) + b"".join(parts)).digest()


B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58enc(b):
    n = int.from_bytes(b, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out


def b58dec(s):
    n = 0
    for c in s:
        n = n * 58 + B58.index(c)
    pad = len(s) - len(s.lstrip("1"))
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\0" * pad + body


def sign_scalar(p, msg, aux):
    a = encode(_mul(p, G))
    nonce_key = hashlib.sha512(dst("nonce") + le32(p)).digest()[:32]
    k = le(hashlib.sha512(nonce_key + aux + msg).digest()) % L
    r = encode(_mul(k, G))
    c = le(hashlib.sha512(r + a + msg).digest()) % L
    return r + le32((k + c * p) % L)


def verify_rfc8032(sig, msg, pub):
    a = decode_strict(pub)
    r = decode_strict(sig[:32])
    s = le(sig[32:])
    if a is None or r is None or s >= L:
        return False
    c = le(hashlib.sha512(sig[:32] + pub + msg).digest()) % L
    return _eq(_mul(s, G), _add(r, _mul(c, a)))


try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    def verify_openssl(sig, msg, pub):
        try:
            Ed25519PublicKey.from_public_bytes(pub).verify(sig, msg)
            return True
        except Exception:
            return False

except ImportError:  # pragma: no cover
    verify_openssl = None


def check(cond, what):
    if not cond:
        raise AssertionError(what)


def meta_address(cluster_byte, s_pub, v_pub):
    payload = bytes([1, cluster_byte]) + s_pub + v_pub
    return "st:sol:" + b58enc(payload + h256("checksum", payload)[:4])


def pda(seeds, program):
    for bump in range(255, -1, -1):
        h = hashlib.sha256(b"".join(seeds) + bytes([bump]) + program + b"ProgramDerivedAddress").digest()
        if decode_strict(h) is None:  # off curve
            return h
    raise AssertionError("no PDA")


def compact_u16(buf, i):
    v = shift = 0
    while True:
        b = buf[i]
        i += 1
        v |= (b & 0x7F) << shift
        if not b & 0x80:
            return v, i
        shift += 7


def parse_legacy_message(m):
    hdr = m[0:3]
    n, i = compact_u16(m, 3)
    keys = [m[i + 32 * k : i + 32 * (k + 1)] for k in range(n)]
    i += 32 * n
    blockhash = m[i : i + 32]
    i += 32
    nix, i = compact_u16(m, i)
    ixs = []
    for _ in range(nix):
        prog = m[i]
        i += 1
        na, i = compact_u16(m, i)
        accts = list(m[i : i + na])
        i += na
        nd, i = compact_u16(m, i)
        ixs.append((prog, accts, m[i : i + nd]))
        i += nd
    check(i == len(m), "trailing message bytes")
    return hdr, keys, blockhash, ixs


def role(hdr, nkeys, idx):
    nsig, ro_signed, ro_unsigned = hdr
    signer = idx < nsig
    writable = idx < nsig - ro_signed if signer else idx < nkeys - ro_unsigned
    return signer, writable


def expect_ix(hdr, keys, ix, program, metas, data):
    prog, accts, d = ix
    check(keys[prog] == b58dec(program), "program id")
    check(len(accts) == len(metas), "account count")
    for a, (addr, signer, writable) in zip(accts, metas):
        check(keys[a] == addr, "account key")
        check(role(hdr, len(keys), a) == (signer, writable), "account role")
    check(bytes(d) == data, "instruction data")


def main(path):
    doc = json.load(open(path))
    progs = doc["programs"]
    sysp, tokp, atap, memop = (b58dec(progs[k]) for k in ("system", "token", "associatedToken", "memo"))
    for i, c in enumerate(doc["cases"]):
        seed = bytes.fromhex(c["seed"])
        s = h512_scalar("spend-key", seed)
        v = h512_scalar("view-key", seed)
        check(le32(s).hex() == c["spendSecret"] and le32(v).hex() == c["viewSecret"], f"case {i} keys")
        S, V = encode(_mul(s, G)), encode(_mul(v, G))
        check(S.hex() == c["spendPublicKey"] and V.hex() == c["viewPublicKey"], f"case {i} pubs")
        check(valid_public(S) and valid_public(V), f"case {i} pub validity")
        check(meta_address(1, S, V) == c["metaAddressDevnet"], f"case {i} meta devnet")
        check(meta_address(0, S, V) == c["metaAddressMainnet"], f"case {i} meta mainnet")
        r = le(bytes.fromhex(c["ephemeralSecret"]))
        R = encode(_mul(r, G))
        check(R.hex() == c["ephemeralPublicKey"], f"case {i} R")
        Z_send = encode(_mul(r, decode_strict(V)))
        Z_recv = encode(_mul(v, decode_strict(R)))
        check(Z_send == Z_recv, f"case {i} DH symmetry")
        h = h512_scalar("shared", R, Z_send, S)
        check(le32(h).hex() == c["tweak"], f"case {i} tweak")
        check(h256("view-tag", R, Z_send)[0] == c["viewTag"], f"case {i} view tag")
        Pt = encode(_add(decode_strict(S), _mul(h, G)))
        check(Pt.hex() == c["stealthPublicKey"], f"case {i} P")
        check(b58enc(Pt) == c["stealthAddress"], f"case {i} base58 P")
        p = (s + h) % L
        check(le32(p).hex() == c["spendKey"], f"case {i} spend key")
        check(encode(_mul(p, G)) == Pt, f"case {i} p*G == P")
        check(c["memo"] == "gpst1:" + b58enc(R + bytes([c["viewTag"]])), f"case {i} memo")
        msg, aux, sig = (bytes.fromhex(c[k]) for k in ("signMessage", "signAux", "signature"))
        check(sign_scalar(p, msg, aux) == sig, f"case {i} signature bytes")
        check(verify_rfc8032(sig, msg, Pt), f"case {i} rfc8032 verify")
        if verify_openssl:
            check(verify_openssl(sig, msg, Pt), f"case {i} openssl verify")
    inv = doc["invalidPoints"]
    t = decode_strict(bytes.fromhex(inv["smallOrder"][1]))
    check(_eq(_mul(8, t), IDENT) and not _eq(_mul(4, t), IDENT), "torsion generator has order 8")
    check(len(set(inv["smallOrder"])) == 8, "8 distinct small-order points")
    for k in ("smallOrder", "mixedOrder", "nonCanonical", "notOnCurve"):
        for e in inv[k]:
            check(not valid_public(bytes.fromhex(e)), f"invalid point accepted: {k}")
    for tx in doc["transactions"]:
        hdr, keys, bh, ixs = parse_legacy_message(bytes.fromhex(tx["messageBytes"]))
        check(bh == b58dec(tx["blockhash"]), tx["name"] + " blockhash")
        check(keys[0] == b58dec(tx["feePayer"]), tx["name"] + " fee payer first")
        stealth = b58dec(tx.get("stealthAddress") or tx["payer"])
        amount = int(tx["amount"]).to_bytes(8, "little")
        if tx["name"] == "sol-payment":
            payer = b58dec(tx["payer"])
            check(hdr == bytes([1, 0, 2]), "sol header")
            expect_ix(hdr, keys, ixs[0], progs["system"], [(payer, True, True), (stealth, False, True)],
                      (2).to_bytes(4, "little") + amount)
            expect_ix(hdr, keys, ixs[1], progs["memo"], [], tx["memo"].encode())
            check(len(ixs) == 2, "sol ix count")
        elif tx["name"] == "spl-payment-sponsored":
            payer, fee, mint = b58dec(tx["payer"]), b58dec(tx["feePayer"]), b58dec(tx["mint"])
            check(hdr[0] == 2, "two signers")
            ata = pda([stealth, tokp, mint], atap)
            src = pda([payer, tokp, mint], atap)
            check(b58enc(ata) == tx["creditedAccount"], "stealth ATA")
            expect_ix(hdr, keys, ixs[0], progs["associatedToken"],
                      [(fee, True, True), (ata, False, True), (stealth, False, False), (mint, False, False),
                       (sysp, False, False), (tokp, False, False)], b"\x01")
            expect_ix(hdr, keys, ixs[1], progs["token"],
                      [(src, False, True), (mint, False, False), (ata, False, True), (payer, True, False)],
                      b"\x0c" + amount + bytes([tx["decimals"]]))
            expect_ix(hdr, keys, ixs[2], progs["memo"], [], tx["memo"].encode())
            check(len(ixs) == 3, "spl ix count")
        elif tx["name"] == "spl-sweep-sponsored-close":
            fee, mint, dest = b58dec(tx["feePayer"]), b58dec(tx["mint"]), b58dec(tx["destination"])
            src = pda([stealth, tokp, mint], atap)
            dst_ata = pda([dest, tokp, mint], atap)
            expect_ix(hdr, keys, ixs[0], progs["associatedToken"],
                      [(fee, True, True), (dst_ata, False, True), (dest, False, False), (mint, False, False),
                       (sysp, False, False), (tokp, False, False)], b"\x01")
            expect_ix(hdr, keys, ixs[1], progs["token"],
                      [(src, False, True), (mint, False, False), (dst_ata, False, True), (stealth, True, False)],
                      b"\x0c" + amount + bytes([tx["decimals"]]))
            expect_ix(hdr, keys, ixs[2], progs["token"],
                      [(src, False, True), (fee, True, True), (stealth, True, False)], b"\x09")
            sig = bytes.fromhex(tx["stealthSignature"])
            msg = bytes.fromhex(tx["messageBytes"])
            check(verify_rfc8032(sig, msg, stealth), "sweep sig rfc8032")
            if verify_openssl:
                check(verify_openssl(sig, msg, stealth), "sweep sig openssl")
        else:
            raise AssertionError("unknown tx vector " + tx["name"])
    print(f"OK: {len(doc['cases'])} cases, {sum(len(v) for v in inv.values())} invalid points, "
          f"{len(doc['transactions'])} transactions; openssl={'yes' if verify_openssl else 'no'}")


if __name__ == "__main__":
    main(sys.argv[1])
