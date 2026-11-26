# Recover stealth payment keys without GhostPay

> **Experimental software, testnet only.** This page explains how to open the stealth key export files defined in
> [spec 18](../specs/18-stealth-keypair-export.md) without the original GhostPay installation, website, host or
> account. The byte-level rules are in the [normative format reference](../specs/18-stealth-keypair-export-formats.md).
> Never paste a real key, passphrase or export file into a document, chat, issue or AI tool.

## Export one payment from Scan

1. Scan with your seller keys, then open **Payment details** on the row for the address you want to recover. Compare the displayed network and one-time address with your records.
2. Choose the public record for a shareable key and announcement, or choose **Download encrypted keypair** for spending authority. For a secret export, reauthenticate with the current seller's encrypted vault or matching keystore backup. Set and repeat a passphrase for the encrypted file.
3. Keep the downloaded file and its passphrase separately. Use the panel to select the exact saved file and verify it locally. If the browser blocks or interrupts the download, use **Retry this download** while the panel is open to save the same encrypted file again. After cancellation, a lock or a seller change, start again under the intended seller.
4. For a wallet that accepts a raw EVM private key, choose **Prepare the private key download**, read the plaintext warning and confirm **Download the private key**. The downloaded text identifies the network, address and single private key. Anyone who obtains it can spend future deposits at that address.

Export checks account code at the selected scan RPC. The provider sees the payment address. Recovery from the saved file is offline and needs neither that provider nor a GhostPay account. The reference-tool instructions below let you verify the address and public key before deliberately revealing the spending key.

The individual export controls are under review for the Pages client. Archive and master formats are also documented below. The broader recovery work and device qualification are tracked in [PR #539](https://github.com/djshellshoxxx/GhostPay/pull/539).

## Which file do I have?

All names are fixed and never contain an address, key, chain or date.

| File | What it holds | Encrypted? |
|---|---|---|
| `ghostpay-stealth-public.json` | One payment's public record: address, public key, announcement location. **No secret.** | No (and not authenticated) |
| `ghostpay-stealth-keypair.json` | One payment's one-time private key | Private-key body only (passphrase); header public |
| `ghostpay-stealth-keypairs.json` | Several payments' one-time private keys (selected or all discovered on one chain) | Private-key body only (passphrase); header public |
| `ghostpay-stealth-master.json` | Your master **spending and viewing** keys | Private-key body only (passphrase); header public |
| `ghostpay-stealth-private-key.txt` | One payment's private key as plain text | **No: anyone with the file can spend** |
| `ghostpay-keystore.json` | Your seller keys: spending, viewing and invoice-signing (the seller keystore) | Keys encrypted (passphrase); meta-address and invoice signer public |

The master backup is separate from the older encrypted seller keystore (the file *Back up (encrypted)* downloads, see
[Set up a stealth meta-address](set-up-stealth-meta-address.md)). The master backup never contains the
invoice-signing key; payment-key files never contain master keys. The reference script reads the seller keystore too:
see [Recover from the seller keystore without GhostPay](#recover-from-the-seller-keystore-without-ghostpay).

### Network disclosure when creating a payment-key export

Creating an encrypted single-payment export, encrypted archive or raw private-key export checks each included
payment address for contract code through the RPC used by the scan. That provider can associate those addresses,
request times and the connecting IP address; the check sends no private key. The single-payment export panel and
archive instructions explain the check before the export action. Opening payment details and downloading a
public-only record do not make that request. Opening an existing export for recovery does not require a network request.

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

**The payer can do the same.** The payer chose that payment's ephemeral secret, so the payer already knows its tweak
without your viewing key. Never send a payment's private key, raw-key file or decrypted payment-key file to the person
who paid it, for example as a refund. Anyone who has both the key and the payer's ephemeral secret can compute your
master spending key. To return money, send it from the one-time address instead.

## Before you start

1. Work offline if you can: disconnect the network, or use a machine you trust that is not shared.
2. Copy the export file to that machine. Keep the original where it was.
3. Have the passphrase ready. A wrong passphrase and an authentication failure give the **same** error on purpose,
   so that error cannot tell you which one happened. Malformed or unsupported files can be refused earlier with a
   specific format or version error.
4. Decide where any revealed key will go *before* you reveal it. Do not put it in a notes app, cloud folder, chat or
   clipboard manager.

## Option A: GhostPay in a fresh browser

Use these steps in a build that includes **Open a stealth key export**. If Seller keys only offers the regular
keystore form, use [the reference recovery script](#option-b-the-reference-recovery-script) for a Spec 18 file.

Open **Seller keys**, then **Open a stealth key export**. The app accepts an encrypted export without the original
installation, site, host or account: GhostPay is a static page and does no server-side recovery. Use a new browser
profile, open a GhostPay build you trust (one you built or verified yourself is best), load the file and enter the passphrase. The
page checks every key against its address before showing anything, and a file with any problem is refused as a whole.

### Verify a backup without replacing your keys

To check an existing encrypted file, select it under **Open a stealth key export**, enter its passphrase, and choose
**Verify backup without importing**. A successful verification authenticates the file, checks each private key
against its public identity, and disposes the recovered private material. It does not install keys into the current
session. A public-only record cannot pass as a recoverable secret backup.

After creating an encrypted payment, archive or master backup, use **Keep and verify this backup**:

If the browser blocks the download, the panel keeps the generated encrypted file available for **Retry this download**
while the current session remains active. Retrying does not regenerate keys, prove that a file was saved, or mark the
backup verified. A lock, session replacement or navigation clears this pending export.

1. Keep the downloaded file and its passphrase separately. Confirm **I saved this backup file and kept its passphrase
   separately.** A started download alone never proves the file was retained.
2. Select the actual retained file under **Saved backup file** and enter **Passphrase of the saved backup**.
3. Choose **Verify the saved backup**. This flow first requires the file to match the export just generated, then
   decrypts it and checks every key. Choosing another file, cancelling or locking cancels that operation.

Verification proves the selected file was recoverable at that time. Keep your copies protected and check them again
after moving storage. Payment-key archives recover only their listed addresses. The master backup recovers the
spending and viewing keys, but never the invoice-signing key. Keep the older full seller keystore backup if you need
to preserve that signing key; verifying a Spec 18 file does not waive full-session backup safeguards.

### Restore the master spending and viewing keys

Select `ghostpay-stealth-master.json`, enter its passphrase, and choose **Open export**. Review the recovered
meta-address before choosing **Load these spending and viewing keys**. If another wallet is loaded, review the
replacement details and choose **Replace the loaded keys** only for the intended backup. An existing saved or verified
copy does not skip that confirmation. Cancelling leaves the current keys in place; locking or changing the selected
file invalidates pending recovery and confirmation.

Restoring the master pair creates a **new invoice-signing key**. The master file never contains the old signing key
and cannot preserve the new one. Use the full seller-keystore backup after restoration if you need to preserve the
new signer. Verifying a Spec 18 file does not mark the complete three-key seller session as backed up.

## Option B: the reference recovery script

The script is a separate implementation of the formats. It uses only Node.js built-ins (`node:crypto` scrypt and
AES-256-GCM) and the `@noble/curves` and `@noble/hashes` libraries, and it imports no GhostPay code. It makes no network
requests.

1. Prepare the script and dependencies while online. Install Node.js 22 or newer. From a checkout of this repository,
   `npm ci --ignore-scripts` installs the locked dependencies. The recovery script itself needs only
   `@noble/curves` 2.4.0 and `@noble/hashes` 2.4.0. To keep a standalone recovery folder outside the checkout, copy
   `scripts/recovery/stealth-export-recover.mjs` into an empty folder, open a terminal in that folder, and run:

   ```sh
   npm install --ignore-scripts --save-exact @noble/curves@2.4.0 @noble/hashes@2.4.0
   ```

   Keep the script, `node_modules`, `package.json` and `package-lock.json` together with your offline recovery kit.
   In that folder the commands below use `node stealth-export-recover.mjs` instead of the repository path. Disconnect
   from the network before supplying the backup or passphrase. No GhostPay packages, browser storage or hosted
   service are required at recovery time.
2. Use `--inspect` to check public information without entering the passphrase. Combining it with
   `--reveal-private-keys` or `--scan-announcement` returns a usage error before the file is opened.

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

5. Optional: `--expected-chain <id>` refuses a payment archive, public record or raw-key file labelled for another
   chain. It also applies to `--inspect`. This checks the recorded identifier, not live chain state; public and raw
   metadata are not authenticated. A master backup or seller keystore is chain-neutral and refuses this option rather
   than pretending to verify a network.
6. Optional, for a master backup or seller keystore: `--expected-meta-address st:eth:0x...` refuses a file that
   belongs to another meta-address, before you type a passphrase. It also applies to `--inspect`, but the header is
   authenticated only when the file decrypts: a match under `--inspect` does not prove the file is yours.

Exit status: `0` success, `1` refused (the error code is printed, for example `wrongPassphraseOrModified`,
`keyDoesNotMatch`, `sellerKeysDoNotMatch`, `wrongMetaAddress`, `duplicate`, `tooLarge`, `unsupportedVersion`),
`2` usage error.

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

### Recover from the seller keystore without GhostPay

The script also reads `ghostpay-keystore.json`, the seller keystore that *Back up (encrypted)* downloads. Use it to
check a keystore backup, or to recover payment keys from it, without GhostPay, the original browser profile, its
storage or the device it was made on. The byte-level rules are in
[the keystore format reference](../specs/18-seller-keystore-v1-format.md).

1. See which seller the file belongs to, without the passphrase:

   ```sh
   node scripts/recovery/stealth-export-recover.mjs ghostpay-keystore.json --inspect
   ```

   The meta-address and invoice signer shown are read from the file. Step 2 confirms them.
2. Decrypt and check the file. Pass the meta-address you expect (Seller keys shows it as *Your meta-address
   (public)*), so another seller's keystore is refused before you type a passphrase:

   ```sh
   node scripts/recovery/stealth-export-recover.mjs ghostpay-keystore.json --expected-meta-address st:eth:0x...
   ```

   On success the script prints the meta-address, both public keys and the invoice signer. It confirms that all three
   keys decrypted, are in range and distinct, and match them. It never prints the spending, viewing or
   invoice-signing key.
3. To recover one payment, add `--scan-announcement` with that payment's announcement, exactly as for a master backup
   above. Add `--reveal-private-keys` only when you need that payment's one-time key for a wallet:

   ```sh
   node scripts/recovery/stealth-export-recover.mjs ghostpay-keystore.json \
     --scan-announcement '{"ephemeralPublicKey":"0x02...","stealthAddress":"0x..."}' --reveal-private-keys
   ```

What this does not do:

- It does not restore invoice signing. To sign invoices again, open Seller keys in any browser profile, choose
  *Import an encrypted keystore* and select the file.
- It does not find payments. You still need each payment's announcement, from a scan or a block explorer.
- A successful check shows that this file and passphrase open these keys with this script. It says nothing about
  your other copies, and it is not payment confirmation.
- Refusals use the exit status codes listed above. `sellerKeysDoNotMatch` means the file decrypted, but its keys do
  not match the identity written in it: do not use that file.

### What a match means

A key/address match proves you **control** the address. It is not payment confirmation or finality: check the balance
and the transaction on the chain yourself. The view tag is only a scan filter; a payment whose announced view tag
differs from the computed one is still yours when the address matches.

## Option C: import one raw key into a general EVM wallet

The raw key (from `ghostpay-stealth-private-key.txt`, or revealed with the script) is an ordinary 32-byte EVM private
key: `0x` and 64 lowercase hex digits. It is **not** a seed phrase or recovery phrase.

The chain label records where the payment was found. It is authenticated in an encrypted export; standalone public records
and raw-key files have no authentication. The private key itself is not restricted to that chain: the same key
derives the same address on EVM networks using the same address rules. Select the intended network and check the
account's current state before using it; exposing the key can also affect that address on other chains.

1. In a wallet that supports private-key (EOA) import, choose its import-private-key option and paste the key.
2. Check that the wallet shows exactly the `Address:` from the file (it is EIP-55 checksummed: compare all 42
   characters).
3. Move funds as you would from any address. Read [Sweep funds and gas privacy](sweep-and-gas-privacy.md) first: an
   ordinary transfer from a one-time address to your usual wallet can link the payer to you.

What this does **not** do:

- A general wallet cannot find your other stealth payments. Each one-time address needs its own key, and only
  scheme-compatible tooling (GhostPay or the reference script with the master pair) can find and derive them.
- GhostPay exports scheme-1 payment private keys only when its export-time code check returns empty. Recovery for
  ERC-4337, EIP-7702-delegated, policy and other contract accounts is outside this feature's supported scope. Their
  authority must be evaluated from the account's design and current state. In particular,
  [EIP-7702 permits delegated EOAs to originate transactions](https://eips.ethereum.org/EIPS/eip-7702#transaction-origination),
  so protect an exported key even if its address is later delegated. This guide supplies no recovery procedure for
  those account models.
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
node scripts/build-workspaces.mjs --workspace @ghostpay/ux-vault
REQUIRE_ANVIL=1 node --test scripts/recovery/*.test.mjs
```

The tests decrypt every file in `test-vectors/stealth-export.json` (TEST-ONLY keys and passphrase), refuse every
`invalid` vector with its documented error code, check tampering and bounds, recover the archive-omitted `a3` payment
from the master backup, and decrypt files freshly written by the built `@ghostpay/ux-vault` codec.
The standalone test copies the script and only its two noble dependencies into a fresh directory and restricts
the child process's filesystem reads to that directory. It checks all five formats, recovers the expected archive
keys, verifies that unlisted payments are absent, and derives an archive-omitted key from the master backup without
printing the master secrets. This is separate from browser or external wallet-device acceptance.

`scripts/recovery/seller-keystore-recover.test.mjs` checks the seller keystore reader against
`test-vectors/seller-keystore-v1.json` (TEST-ONLY). Both GhostPay's codec and the script must accept the valid files and
refuse every invalid one; the one exception is documented in the format reference. Files freshly written by the built
codec, including one at the production cost, must open in the script. The test also checks that the script derives the
same one-time keys as the master-backup vectors, and recovers a payment in an isolated directory.
`apps/web/e2e/independent-keystore-recovery.spec.ts` downloads a keystore in one browser profile and closes it. The
script then recovers a payment key from that file, and a fresh profile imports the same file.
`scripts/recovery/seller-keystore-recover.fuzz.test.mjs` fuzzes the reader against GhostPay's codec. It is
deterministic: set `FUZZ_SEED` to replay a reported case, and `FUZZ_SCALE` (for example 10) for a deeper run.

The anvil test runs when Foundry (`anvil`, `cast`) is found through `ANVIL_BIN`/`CAST_BIN`, `PATH` or
`~/.foundry/bin`. It skips otherwise, unless `REQUIRE_ANVIL=1`, where a missing tool fails the test.
