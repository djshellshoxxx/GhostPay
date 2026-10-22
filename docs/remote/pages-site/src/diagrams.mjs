// Diagram content. Wording is deliberately plain and conservative; every claim traces to README.md,
// docs/user/*, docs/CONTRACTS_SPEC.md, docs/remote/STATUS.md or the package READMEs (see pages-site/README in WIRING.md).
export const diagrams = [
  {
    id: 'flow',
    title: 'Overall flow of a GhostPay payment',
    desc: 'Vertical flowchart in nine steps. The seller creates keys and a meta-address, makes an invoice link whose data sits after the # and is never sent to a server, the payer reviews it and pays through the router or directly to the one-time address, an announcement event is published, the seller scans with the view tag, sweeps directly or via a relayer, and the funds land in a destination wallet.',
    caption: 'From keys to destination wallet. Public steps are marked CHAIN.',
    items: [
      { n: 1, actor: 'seller', title: 'Create keys and meta-address', lines: ['Made in the browser. Share only the public meta-address. Back up the keys: nobody can recover them.'] },
      { n: 2, actor: 'seller', title: 'Make an invoice link', lines: ['The invoice sits after the # in the link. Browsers do not send that part to the web server.'] },
      { n: 3, actor: 'payer', title: 'Open the link and review', lines: ['Check chain, token, amount, fee, expiry and signature, then choose a wallet.'] },
      {
        row: [
          { n: '4a', actor: 'payer', title: 'Pay via router', lines: ['0.25 % fee. Router passes the rest on.'] },
          { n: '4b', actor: 'payer', title: 'Pay direct', lines: ['No GhostPay fee. No router checks.'] },
        ],
      },
      { n: 5, actor: 'chain', title: 'Announcement event', lines: ['A public log entry: one-time address, ephemeral public key, view tag.'] },
      { n: 6, actor: 'seller', title: 'Scan with the view tag', lines: ['The viewing key tests each announcement. The 1-byte tag lets most non-matches be skipped quickly.'] },
      {
        row: [
          { n: '7a', actor: 'seller', title: 'Sweep direct', lines: ['Needs gas coin on the one-time address.'] },
          { n: '7b', actor: 'relayer', title: 'Sweep via relayer', lines: ['Signed order. Fee comes out of the amount.'] },
        ],
      },
      { n: 8, actor: 'seller', title: 'Destination wallet', lines: ['Use a fresh address. The payer can follow the funds from the one-time address.'] },
      { type: 'note', tone: 'warn', lines: ['Public at every step: payer address, amount, token, time, use of the router. The sweep links one-time address to destination.'] },
    ],
  },
  {
    id: 'stealth',
    title: 'How a one-time (stealth) address is made',
    desc: 'Concept diagram of stealth address derivation. The seller publishes a meta-address of two public keys. For each payment the payer makes a fresh ephemeral key, combines it with the seller viewing public key to get a shared secret, and derives a one-time address from the seller spending public key. The seller gets the same shared secret from the viewing private key and the ephemeral public key in the announcement, and can compute the one-time private key. No secret values are shown.',
    caption: 'Concept only. Real maths: secp256k1, ERC-5564 scheme 1.',
    items: [
      { actor: 'seller', title: 'Meta-address (public)', lines: ['Two public keys: spending and viewing. Shared once, reused for every invoice.'] },
      { actor: 'payer', title: 'Fresh ephemeral key per payment', lines: ['Random key pair. Only its public half goes on-chain.'], via: 'payer, new for every payment' },
      {
        row: [
          { actor: 'payer', title: 'Shared secret', lines: ['ephemeral private + viewing public'] },
          { actor: 'seller', title: 'Same secret', lines: ['viewing private + ephemeral public'] },
        ],
      },
      { actor: 'none', title: 'Hash of the secret', lines: ['Gives a 1-byte view tag (a quick filter) and a tweak number.'] },
      {
        row: [
          { actor: 'payer', title: 'One-time address', lines: ['spending public + tweak, turned into an address'] },
          { actor: 'seller', title: 'One-time key', lines: ['spending private + tweak. Only the seller has it'] },
        ],
      },
      { type: 'note', lines: ['No secret is shown on this page. Anyone can see the one-time address and ephemeral public key on-chain, but cannot tell whose address it is from that alone.'] },
    ],
  },
  {
    id: 'sweep',
    title: 'Gas-sponsored sweep through a relayer',
    desc: 'Flow of a sweep using a relayer. The seller asks for a quote, the relayer simulates and prices it, the seller signs an order that fixes token, destination, fee wallet, amount, fee, deadline and nonce, the relayer submits it and pays gas, the sweep contract checks signature, deadline and nonce, marks the nonce used, then pays the net amount to the destination and the fee to the relayer.',
    caption: 'The relayer pays gas and cannot change what the seller signed.',
    items: [
      { n: 1, actor: 'seller', title: 'Ask for a quote', lines: ['Give the relayer the one-time address, destination and token.'] },
      { n: 2, actor: 'relayer', title: 'Simulate and price', lines: ['Fee is max(gas cost x 1.10, 0.50 %), capped at 3 %.'] },
      { n: 3, actor: 'seller', title: 'Sign the order', lines: ['One signature fixes token, destination, fee wallet, amount, fee, deadline and nonce. A permit lets the contract move the tokens.'] },
      { n: 4, actor: 'relayer', title: 'Submit the transaction', lines: ['Pays the gas. Cannot change destination, amount or fee.'] },
      { n: 5, actor: 'chain', title: 'Contract checks', lines: ['Not expired. Signature is the owner’s. Nonce unused, then marked used first, so the order cannot be replayed.'] },
      {
        row: [
          { actor: 'chain', title: 'Net amount', lines: ['amount minus fee, to your destination'] },
          { actor: 'relayer', title: 'Fee', lines: ['to the fee wallet in the signed order'] },
        ],
      },
      { type: 'note', tone: 'warn', lines: ['The relayer sees one-time address, destination, token, amount, fee, hashed IP and timing, and can refuse or delay. Gasless is not unlinkable. Needs a token with permit; USDT-style tokens cannot use it.'] },
    ],
  },
  {
    id: 'fees',
    title: 'Fee model',
    desc: 'Diagram of GhostPay fees. Paying through the router costs 0.25 percent of the gross amount, rounded down. Paying the one-time address directly has no GhostPay fee. A relayer sweep costs the larger of gas cost times 1.10 or 0.50 percent, capped at 3 percent. A direct sweep has no relayer fee. Policy account creation has a flat fee, contracts only. Worked example: 100.00 USDC through the router means 0.25 USDC fee and 99.75 USDC net.',
    caption: 'Nothing is deployed, so no fee is being collected anywhere today.',
    items: [
      { actor: 'payer', title: 'How does the payer pay?', lines: ['The fee only applies where funds pass through GhostPay’s contract.'] },
      {
        row: [
          { actor: 'chain', title: 'Router', lines: ['0.25 % of gross, rounded down. Below 400 base units: 0.'] },
          { actor: 'payer', title: 'Direct', lines: ['No GhostPay fee. Also no router checks.'] },
        ],
      },
      { actor: 'seller', title: 'How does the seller sweep?', lines: ['Network gas is never a GhostPay fee.'] },
      {
        row: [
          { actor: 'relayer', title: 'Relayer', lines: ['max(gas x 1.10, 0.50 %), capped at 3 %. In the signature.'] },
          { actor: 'seller', title: 'Direct', lines: ['You pay your own gas. No relayer fee.'] },
        ],
      },
      { actor: 'none', title: 'Policy account creation', lines: ['Flat fee in a stablecoin (design value USD 3, owner to confirm). Contracts only, no app support.'] },
      { type: 'note', lines: ['Example, made-up numbers: 100.00 USDC through the router = 0.25 USDC fee, 99.75 USDC to the seller. Scanning, tags, delay, QR codes and invoices are free.'] },
    ],
  },
  {
    id: 'observers',
    title: 'What an observer sees and what stays hidden',
    desc: 'Two panels, then a card per observer. Public on-chain: payer address, token and amounts, time, use of the router, the announcement and the sweep source and destination. Not public from chain data alone: which seller owns the one-time address, the invoice contents, any keys. Then cards for the static host, RPC provider, relayer, wallet provider, holder of the invoice link and the payer, each with what they learn and what they do not.',
    caption: 'Hidden does not mean anonymous. The list on the left is the part people forget.',
    items: [
      {
        row: [
          { actor: 'observer', title: 'PUBLIC', lines: ['Payer address', 'Token and amount', 'Time', 'Router was used', 'Announcement', 'Sweep source and destination'] },
          { actor: 'seller', title: 'NOT PUBLIC', lines: ['Which seller owns the one-time address', 'Invoice contents', 'Spending and viewing keys', 'The # part of the link'] },
        ],
      },
      { noArrow: true, actor: 'observer', title: 'Static host / CDN', lines: ['Sees: your IP, user agent, files fetched, timing.', 'Not: the # part, keys, invoice.'] },
      { noArrow: true, actor: 'observer', title: 'RPC provider', lines: ['Sees: your IP, blocks and addresses you query, transactions you send.', 'Not: keys, invoice.'] },
      { noArrow: true, actor: 'observer', title: 'Relayer operator', lines: ['Sees: hashed IP, one-time address, destination, token, amount, fee, timing. Can censor.', 'Not: keys.'] },
      { noArrow: true, actor: 'observer', title: 'Anyone with the invoice link', lines: ['Sees: the whole invoice (it is a bearer link).', 'Not: seller keys.'] },
      { noArrow: true, actor: 'observer', title: 'The payer', lines: ['Knows: the one-time address, so can watch where you sweep it.', 'Not: your keys.'] },
    ],
  },
  {
    id: 'privacy-map',
    title: 'Privacy options map',
    desc: 'Pipeline of the payment lifecycle with the privacy options that apply at each stage and their honest status: pay, receive and scan, sweep, optional extras, a network-layer band, and Bitcoin. Each option is labelled built, planned or experimental. Chaining several planned methods adds cost and delay and does not add up to anonymity.',
    caption: 'Chaining runs top to bottom. Status labels are literal: BUILT means usable in the app today.',
    items: [
      {
        type: 'list',
        actor: 'payer',
        title: '1  Pay',
        entries: [
          { text: 'Random payment delay', status: 'built' },
          { text: 'Fresh payer wallet or sponsored pay', status: 'planned' },
          { text: 'Round, split or fixed amounts', status: 'planned' },
        ],
      },
      {
        type: 'list',
        actor: 'seller',
        title: '2  Receive and scan',
        entries: [
          { text: 'View-tag scan, one-time address per payment', status: 'built' },
          { text: 'Your own RPC URL', status: 'built' },
          { text: 'Aligned scan ranges, private scanning (PIR)', status: 'planned' },
        ],
      },
      {
        type: 'list',
        actor: 'seller',
        title: '3  Sweep',
        entries: [
          { text: 'Direct or relayer sweep', status: 'built' },
          { text: 'Fresh self-derived destination', status: 'planned' },
          { text: 'Policy account (fixed destination)', status: 'experimental' },
        ],
      },
      {
        type: 'list',
        actor: 'chain',
        title: '4  Optional extras after sweep',
        entries: [
          { text: 'Delayed multi-hop forwarding (weak)', status: 'planned' },
          { text: 'Pool exit (Privacy Pools, Railgun, own pool)', status: 'planned' },
          { text: 'Confidential token amounts', status: 'planned' },
        ],
      },
      {
        type: 'list',
        actor: 'relayer',
        noArrow: true,
        title: 'Network layer (under every stage)',
        entries: [
          { text: 'Tor, I2P, Nym, Oblivious HTTP profiles', status: 'planned' },
          { text: 'Tor Browser as your own browser (not an app feature, untested)', status: 'experimental' },
        ],
      },
      {
        type: 'list',
        actor: 'none',
        noArrow: true,
        title: 'Bitcoin tier',
        entries: [
          { text: 'Silent Payments (BIP-352) library', status: 'experimental' },
          { text: 'PayJoin', status: 'planned' },
        ],
      },
      { type: 'note', noArrow: true, tone: 'warn', lines: ['Chaining methods adds cost, delay and new ways to slip. It does not add up to anonymity.'] },
    ],
  },
  {
    id: 'bitcoin',
    title: 'Bitcoin Silent Payments (BIP-352)',
    desc: 'Flow of BIP-352 Silent Payments. The receiver makes a scan key and a spend key and shares one static address. The sender derives a fresh taproot output key from its own input keys and the receiver address, so there is no address reuse. The output looks like an ordinary payment on-chain. The receiver scans transactions with the scan key, and spends with the spend key plus a per-output tweak. Status: experimental library, not wired into the web app or relayer.',
    caption: 'Experimental: a tested library, not yet part of the app.',
    items: [
      { n: 1, actor: 'receiver', title: 'Make keys and address', lines: ['A scan key and a spend key give one static sp1… address (tsp1… on testnet).'] },
      { n: 2, actor: 'sender', title: 'Choose inputs', lines: ['Spend coins you control. Their private keys feed the maths.'] },
      { n: 3, actor: 'sender', title: 'Derive the output key', lines: ['Input keys + receiver’s scan key give a shared secret, which tweaks the spend key into a fresh output.'] },
      { n: 4, actor: 'chain', title: 'Ordinary-looking payment', lines: ['A normal taproot output. No reuse, no notification transaction.'] },
      { n: 5, actor: 'receiver', title: 'Scan', lines: ['Per transaction, the scan key tests whether an output is yours. A BlindBit-style server can supply the tweak data.'] },
      { n: 6, actor: 'receiver', title: 'Spend', lines: ['Spend key + that output’s tweak = its private key. Sign a key-path spend.'] },
      { type: 'note', tone: 'warn', lines: ['Amounts, timing and the sender’s inputs are still public. Library tested on official BIP-352 vectors only; never run on a real network. Testnet only. Not in the app.'] },
    ],
  },
  {
    id: 'policy',
    title: 'Policy accounts (experimental)',
    desc: 'Flow of the policy-guarded account. The seller fixes a policy: destination, delay and per-token limits. A payer pays the predicted account address. The seller deploys the small account contract, then signs a withdrawal request, waits out the delay during which the owner can cancel, and the funds go only to the fixed destination within the limit. Changing the destination takes twice the delay. Experimental: contracts and a client library only, no app support.',
    caption: 'EXPERIMENTAL. No app support and no recovery path. Do not use.',
    items: [
      { n: 1, actor: 'seller', title: 'Choose a policy', lines: ['Destination, delay and per-token limits. Only their hash goes in the meta-address.'] },
      { n: 2, actor: 'payer', title: 'Pay the account address', lines: ['A predicted address, not yet deployed. The policy router checks it matches the policy.'] },
      { n: 3, actor: 'seller', title: 'Scan, then deploy', lines: ['Anyone can deploy the small account contract. Flat creation fee.'] },
      { n: 4, actor: 'seller', title: 'Sign a withdrawal request', lines: ['Token, amount and deadline, in a signed message.'] },
      { n: 5, actor: 'chain', title: 'Wait out the delay', lines: ['The owner can cancel during the wait. A request can only ever pay the fixed destination.'] },
      { n: 6, actor: 'chain', title: 'Execute', lines: ['Funds go only to the fixed destination, within the rolling limit.'] },
      { type: 'note', tone: 'warn', lines: ['Changing the destination: propose, then wait twice the delay. A fixed destination makes the on-chain link to it permanent. The delay is a cost if you need money fast.'] },
    ],
  },
];
