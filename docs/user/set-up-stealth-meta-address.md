# Set up a stealth meta-address

A *stealth meta-address* is the one public address you give to customers. From it, each payer's wallet or the GhostPay app derives a fresh one-time address for every payment. Only you, holding your private keys, can find and spend from those addresses.

> Testnet only for now. GhostPay is pre-audit and nothing is deployed. Use test funds.

## What you create

| Item | Public? | What it does |
|---|---|---|
| Meta-address | Yes, share it | Lets payers derive one-time addresses for you. Contains two public keys (spending and viewing). |
| Spending private key | **Never share** | Needed to move funds out of a one-time address. |
| Viewing private key | **Never share** | Lets software *find* your payments. Anyone holding it can see all your incoming payments (but not spend). |
| Invoice-signing key | Public key shown, private key secret | Signs invoices so a payer can check a link was not altered. A separate key from the two above, on purpose. |

## Steps

1. Open the app and go to **Seller keys**.
2. Choose **Generate new keys**. Keys are created inside the page using your browser's secure random generator. They live in memory only: reloading or closing the tab forgets them. Until you back them up they exist nowhere else, so the app shows a "no backup" banner, keeps the meta-address, Create invoice and registry publishing behind a typed waiver, and the idle lock (Settings) leaves them loaded.
3. **Back up now.** Under *Back up (encrypted)*, keep the suggested passphrase (six random words: write it down) or choose your own of at least 14 characters, repeat it and download the encrypted keystore. The file is encrypted with scrypt and AES-256-GCM. **Neither the file nor the passphrase can be recovered by anyone**, including the project. Store the file and the passphrase separately. Saving the optional encrypted vault in this browser also counts as a backup, but browser data can be cleared, so keep the file as well; do not let the browser save the vault passphrase.
4. Copy your **meta-address**. This is what you share on your website, in invoices, or with customers.
5. To use the keys later, choose *Import an encrypted keystore*, select the file and enter the passphrase, or unlock the browser vault. You can also import raw hex keys, but typing private keys into any web page is riskier than using the keystore; avoid it unless you must. Enter the invoice-signing key too: left empty, a new one is generated that exists only in this tab, and the keys count as not backed up until you download a keystore or save the vault.
6. When you are done, choose **Wipe keys from memory** (under *Forget keys*). Keys without a backup ask for confirmation first. The idle lock also wipes keys from memory after the minutes set in Settings, but only keys that can be loaded again.

## What to know before you share the meta-address

- **It is a stable identifier.** Every invoice you create carries the same meta-address. Anyone holding two of your invoice links can tell they come from the same seller. If you publish it in the ERC-6538 registry it becomes publicly tied to the wallet that published it. (The app's *Public registry* page publishes it only after your explicit consent, and only for keys that are backed up or after the typed waiver.) A per-client meta-address mode does not exist yet (audit finding D3).
- **A bad actor can post fake payment notices to it** (see [Receive and scan](receive-and-scan.md)). Never ship goods because a notice exists; check that the money is actually there.
- **The viewing key is sensitive.** It does not let anyone spend, but it reveals your whole payment history. Keep it as private as the spending key.
- **Browser keystore security depends on your device.** A browser extension or malware on your computer can read page memory. GhostPay has had no external audit.
- **If you lose the spending key, funds in your one-time addresses are gone.** There is no recovery service.

## Checklist

- [ ] I downloaded the keystore and tested importing it (use a second browser profile).
- [ ] The passphrase is stored somewhere other than the keystore file.
- [ ] I only shared the meta-address, never a private key.
- [ ] I understand that anyone holding two of my invoices can link them to one seller.
