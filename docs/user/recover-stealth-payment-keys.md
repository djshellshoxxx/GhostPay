# Recover stealth payment keys without GhostPay

> **Experimental software, testnet only.** This page explains how to open the stealth key export files defined in
> [spec 18](../specs/18-stealth-keypair-export.md) without the original GhostPay installation, website, host or
> account. The byte-level rules are in the [normative format reference](../specs/18-stealth-keypair-export-formats.md).
> Never paste a real key, passphrase or export file into a document, chat, issue or AI tool.

## Status

| Path | Status |
|---|---|
| Reference recovery script (`scripts/recovery/stealth-export-recover.mjs`) | Implemented; tested against the reference vectors and against files freshly written by the GhostPay codec |
| Raw private key in an independent EVM wallet tool | Tested with Foundry `cast` on a local anvil chain only (`scripts/recovery/raw-key-anvil.test.mjs`): synthetic test key, no real network, no real funds |
| Loading an export in a freshly opened GhostPay page | Specified by spec 18; desktop and mobile browser acceptance is **pending** (not yet exercised) |
| Import into third-party wallets, hardware wallets or phones | **Pending: not exercised.** No wallet, device or browser beyond the rows above has been tested |

## Which file do I have?

All names are fixed and never contain an address, key, chain or date.

| File | What it holds | Encrypted? |
|---|---|---|
| `ghostpay-stealth-public.json` | One payment's public record: address, public key, announcement location. **No secret.** | No (and not authenticated) |
| `ghostpay-stealth-keypair.json` | One payment's one-time private key | Private-key body only (passphrase); header public |
| `ghostpay-stealth-keypairs.json` | Several payments' one-time private keys (selected or all discovered on one chain) | Private-key body only (passphrase); header public |
| `ghostpay-stealth-master.json` | Your master **spending and viewing** keys | Private-key body only (passphrase); header public |
| `ghostpay-stealth-private-key.txt` | One payment's private key as plain text | **No: anyone with the file can spend** |

The master backup is separate from the older encrypted seller keystore (the file *Back up (encrypted)* downloads, see
[Set up a stealth meta-address](set-up-stealth-meta-address.md)). The master backup never contains the
invoice-signing key; payment-key files never contain master keys.

### Encryption does not hide the public header

Payment-key files encrypt their private-key body. Their public header is authenticated against tampering, but it is
not encrypted: anyone who obtains the file can read the chain, payment count, every included stealth address and
public key, and announcement locators without knowing the passphrase. An archive therefore links all its included
payments to the same collection. The master-backup header likewise exposes its meta-address and public spending
and viewing keys. Keep these files private even when their private keys are encrypted; share a smaller export when
you do not want to reveal the other entries. Authentication protects integrity, not confidentiality.

### Keep viewing keys separate from exported payment keys

In scheme 1, someone who obtains your private viewing key, one of your one-time payment private keys, and that
payment's public announcement can reconstruct your master spending key. The private viewing key lets them compute
the announcement's shared-secret tweak; subtracting that tweak from the one-time private key yields the master
spending key modulo the secp256k1 curve order. They can then derive spending keys for your other discoverable
scheme-1 payments.

Do not give a watch-only service, scanner, or device that holds your private viewing key an exported payment private
key. The same restriction applies to an encrypted payment-key file once that service or device can decrypt it.
A payment private key by itself controls its one-time address; combining it with the private viewing key crosses
that boundary. Encrypting the private-key body protects its stored key material but does not change this cryptographic relationship.

## Before you start

1. Work offline if you can: disconnect the network, or use a machine you trust that is not shared.
2. Copy the export file to that machine. Keep the original where it was.
3. Have the passphrase ready. Wrong passphrase and a modified file give the **same** error on purpose, so the error
   cannot tell you which one happened.
4. Decide where any revealed key will go *before* you reveal it. Do not put it in a notes app, cloud folder, chat or
   clipboard manager.

## Option A: GhostPay in a fresh browser

Spec 18 requires that an encrypted export opens in a freshly opened GhostPay page without the original installation,
site, host or account: GhostPay is a static page and does no server-side recovery. Use a new browser profile, open a
GhostPay build you trust (one you built or verified yourself is best), load the file and enter the passphrase. The
page checks every key against its address before showing anything, and a file with any problem is refused as a whole.

Status: this in-app import has not yet passed its desktop and mobile browser acceptance. Until that is recorded, use
Option B to check a file independently.

## Option B: the reference recovery script

The script is a separate implementation of the formats. It uses only Node.js built-ins (`node:crypto` scrypt and
AES-256-GCM) and the `@noble/curves` and `@noble/hashes` libraries, and it imports no GhostPay code. It makes no network
requests.

1. Install Node.js 22 or newer. From a checkout of this repository, run `npm ci` once (only `@noble/curves` and
   `@noble/hashes` are needed by the script). Do this step while online, then go offline.
2. Check a file without a passphrase (header only, nothing is decrypted):

   ```sh
   node scripts/recovery/stealth-export-recover.mjs ghostpay-stealth-keypairs.json --inspect
   ```

3. Decrypt and verify. The script asks for the passphrase without echoing it. It never accepts the passphrase as a
   command-line argument or environment variable (both can end up in shell history or process lists):

   ```sh
   node scripts/recovery/stealth-export-recover.mjs ghostpay-stealth-keypairs.json
   ```

   It prints the chain, the count and each payment's address and public key. It confirms that every decrypted key is
   in range and controls exactly the address in the file. **Private keys are not printed** unless you ask.
   You can also pipe the passphrase on standard input (one trailing newline is removed), for example from a password
   manager's command-line tool. Do not type it into an `echo` command, which stays in shell history.

4. Only when you need a key for a wallet, add `--reveal-private-keys`. The keys go to standard output only. Do not
   redirect them to a file you will forget about.

   ```sh
   node scripts/recovery/stealth-export-recover.mjs ghostpay-stealth-keypair.json --reveal-private-keys
   ```

5. Optional: `--expected-chain <id>` refuses a payment-key file for any other chain.

Exit status: `0` success, `1` refused (the error code is printed, for example `wrongPassphraseOrModified`,
`keyDoesNotMatch`, `duplicate`, `tooLarge`, `unsupportedVersion`), `2` usage error.

### Recover a payment that is in no archive (master backup)

The master pair can recompute the one-time key of **any** scheme-1 payment to your meta-address, including payments
left out of every payment-key archive. You need that payment's announcement: its ephemeral public key and stealth
address, from a block explorer's `Announcement` event log or a GhostPay public record.

```sh
node scripts/recovery/stealth-export-recover.mjs ghostpay-stealth-master.json \
  --scan-announcement '{"ephemeralPublicKey":"0x02...","stealthAddress":"0x..."}'
```

You can also pass `@announcement.json` (a file holding one announcement, an array of them, or a
`ghostpay-stealth-public-v1` record). The script reports `"owned": true` when the derived address equals the
announced one. Add `--reveal-private-keys` to print that payment's one-time key. **The master keys themselves are never
printed**; keep using the encrypted master file.

The script does not search the chain for announcements. Finding them is a scan (GhostPay's *Scan and receive*, or any
ERC-5564 scheme-1 compatible scanner given your viewing key).

### What a match means

A key/address match proves you **control** the address. It is not payment confirmation or finality: check the balance
and the transaction on the chain yourself. The view tag is only a scan filter; a payment whose announced view tag
differs from the computed one is still yours when the address matches.

## Option C: import one raw key into a general EVM wallet

The raw key (from `ghostpay-stealth-private-key.txt`, or revealed with the script) is an ordinary 32-byte EVM private
key: `0x` and 64 lowercase hex digits. It is **not** a seed phrase or recovery phrase.

1. In a wallet that supports private-key (EOA) import, choose its import-private-key option and paste the key.
2. Check that the wallet shows exactly the `Address:` from the file (it is EIP-55 checksummed: compare all 42
   characters).
3. Move funds as you would from any address. Read [Sweep funds and gas privacy](sweep-and-gas-privacy.md) first: an
   ordinary transfer from a one-time address to your usual wallet can link the payer to you.

What this does **not** do:

- A general wallet cannot find your other stealth payments. Each one-time address needs its own key, and only
  scheme-compatible tooling (GhostPay or the reference script with the master pair) can find and derive them.
- The key controls a plain EOA only. It cannot authorize funds held by a contract account, an ERC-4337 account, an
  EIP-7702 delegation or a GhostPay policy account. GhostPay refuses to export keys for those.
- External wallet and device acceptance is **pending: not exercised**. The only independent tool tested is Foundry
  `cast` on a local test chain.

## What the master pair can and cannot do

| It can | It cannot |
|---|---|
| Recompute the one-time key of every past and future scheme-1 payment to your meta-address, given the announcement | Be imported into a generic wallet as a usable account |
| Recover payments that are missing from every archive | Find announcements by itself: you still need a scan or the announcement data |
| Restore scanning in scheme-compatible tooling | Sign invoices (the invoice-signing key is not in it) |

Anyone who gets the master file **and** its passphrase can watch and spend every past and future payment to your
meta-address. Treat it like the keys themselves.

## Plaintext files and operating-system copies

- `ghostpay-stealth-private-key.txt` and any revealed key are **plaintext**. Anyone who reads them can spend funds at
  that address, including future deposits.
- Browser downloads can stay in the Downloads folder, the browser's download history, the recycle bin, and be copied
  by the operating system's backup, cloud sync, file indexing or search. Deleting a file does not reliably erase it
  from disk.
- After importing a raw key, delete the plaintext file, empty the recycle bin and check that cloud sync did not upload
  it. Prefer the encrypted files for storage.
- A private key keeps working after the funds are spent: it controls any later deposit to that address.

## For developers: checking the reference implementation

```sh
node --test scripts/recovery/*.test.mjs
```

The tests decrypt every file in `test-vectors/stealth-export.json` (TEST-ONLY keys and passphrase), refuse every
`invalid` vector with its documented error code, check tampering and bounds, recover the archive-omitted `a3` payment
from the master backup, and decrypt files freshly written by `@ghostpay/ux-vault` (run `npm run build:libs` first).
The anvil test runs when Foundry (`anvil`, `cast`) is found through `ANVIL_BIN`/`CAST_BIN`, `PATH` or
`~/.foundry/bin`. It skips otherwise, unless `REQUIRE_ANVIL=1`, where a missing tool fails the test.
