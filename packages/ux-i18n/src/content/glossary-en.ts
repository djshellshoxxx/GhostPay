import type { GlossaryTerm, HelpRegistry, HelpTopic } from '../glossary.js';

/** English glossary. `plain` text targets grade 8 or lower; `detail` is for advanced readers. */
export const EN_GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: 'privacy',
    term: 'Privacy',
    aliases: ['private payment', 'private payments'],
    short: 'Keeping who paid whom, and how much, out of public view.',
    plain:
      'Privacy means other people cannot easily see who you pay or how much. Public blockchains show everything by default. GhostPay adds steps to hide it.',
    detail:
      'Privacy here means unlinkability between sender, recipient and payment, not secrecy of the fact that a payment occurred.',
    topics: ['send-private', 'privacy-level'],
    related: ['stealth-address', 'anonymity-set', 'metadata'],
  },
  {
    id: 'stealth-address',
    term: 'Stealth address',
    aliases: ['stealth addresses', 'one-time address'],
    short: 'A fresh address made for one payment only.',
    plain:
      'A stealth address is a new address made for just one payment. The sender works it out from your public payment address. Nobody else can tell it belongs to you.',
    detail:
      'Derived via ECDH between the sender ephemeral key and the recipient scan key; spending requires the spend key.',
    topics: ['receive-payment', 'send-private'],
    related: ['viewing-key', 'spending-key', 'silent-payment'],
  },
  {
    id: 'silent-payment',
    term: 'Silent payment',
    aliases: ['silent payments'],
    short: 'A Bitcoin way to receive to fresh addresses with one reusable code.',
    plain:
      'A silent payment lets you share one code and still get each payment at a new address. This stops people from linking your payments together.',
    topics: ['receive-payment'],
    related: ['stealth-address', 'viewing-key'],
  },
  {
    id: 'relayer',
    term: 'Relayer',
    aliases: ['relayers', 'relay'],
    short: 'A service that sends your payment for you.',
    plain:
      'A relayer is a service that sends your payment to the network for you. Your own address is not shown as the sender. The relayer takes a small fee. It cannot spend your funds.',
    detail: 'The relayer submits a transaction it cannot alter; fees are bounded by the signed request.',
    topics: ['relayer-help', 'fees', 'send-private'],
    related: ['network-fee', 'metadata'],
  },
  {
    id: 'network-fee',
    term: 'Network fee',
    aliases: ['gas fee', 'gas', 'transaction fee'],
    short: 'The cost paid to the network to process a payment.',
    plain:
      'The network fee is a cost paid to the people who run the network. It pays for your payment to be processed. It changes with how busy the network is.',
    topics: ['fees', 'send-private'],
    related: ['relayer'],
  },
  {
    id: 'viewing-key',
    term: 'Viewing key',
    aliases: ['scan key', 'view key'],
    short: 'A key that can find your payments but cannot spend them.',
    plain:
      'A viewing key lets an app find payments that belong to you. It cannot move your money. Keep it private anyway, because it shows your payment history.',
    topics: ['receive-payment', 'keys'],
    related: ['spending-key', 'stealth-address'],
  },
  {
    id: 'spending-key',
    term: 'Spending key',
    aliases: ['spend key', 'private key'],
    short: 'The secret that lets you move your funds.',
    plain:
      'The spending key is the secret that lets you move your money. If someone else gets it, they can take everything. GhostPay keeps it on your device and never sends it anywhere.',
    topics: ['keys', 'recovery'],
    related: ['viewing-key', 'recovery-phrase'],
  },
  {
    id: 'recovery-phrase',
    term: 'Recovery phrase',
    aliases: ['seed phrase', 'backup phrase', 'secret words'],
    short: 'A list of words that can restore your wallet.',
    plain:
      'A recovery phrase is a list of words that can bring back your wallet on a new device. Write it on paper and keep it safe. Never type it into a website or share it with anyone.',
    topics: ['recovery', 'keys'],
    related: ['spending-key'],
  },
  {
    id: 'anonymity-set',
    term: 'Anonymity set',
    aliases: ['crowd', 'privacy pool'],
    short: 'The group of people you could be mistaken for.',
    plain:
      'The anonymity set is the group of payments that yours could be mixed up with. A bigger group means better privacy. A small group is easier to guess.',
    topics: ['privacy-level'],
    related: ['privacy', 'metadata'],
  },
  {
    id: 'metadata',
    term: 'Metadata',
    aliases: ['payment metadata'],
    short: 'Side details such as timing, size and who connects to whom.',
    plain:
      'Metadata is the side information around a payment, like the time, the size and which addresses connect. Even with hidden names, these clues can point to you.',
    topics: ['privacy-level'],
    related: ['privacy', 'anonymity-set'],
  },
  {
    id: 'confirmation',
    term: 'Confirmation',
    aliases: ['confirmations', 'confirmed'],
    short: 'Proof that the network accepted your payment.',
    plain:
      'A confirmation means the network has accepted your payment into its record. More confirmations make it safer to treat the payment as final.',
    topics: ['activity'],
    related: ['network-fee'],
  },
];

/** English help topics keyed to UI contexts. */
export const EN_HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'send-private',
    title: 'Sending a private payment',
    summary:
      'Enter an amount and a recipient, then pick a privacy level. GhostPay sends the payment to a new address that only the recipient can link to themselves.',
    steps: [
      'Enter the amount.',
      'Paste the recipient code.',
      'Choose a privacy level.',
      'Review the fee, then confirm.',
    ],
    termIds: ['privacy', 'stealth-address', 'relayer', 'network-fee'],
    relatedTopicIds: ['privacy-level', 'fees'],
  },
  {
    id: 'receive-payment',
    title: 'Receiving a payment',
    summary:
      'Share your payment code. Each sender makes a fresh address for you, so your payments cannot be tied together by outsiders.',
    steps: ['Open Receive.', 'Share your payment code.', 'Wait for the payment to show up.'],
    termIds: ['stealth-address', 'silent-payment', 'viewing-key'],
    relatedTopicIds: ['keys'],
  },
  {
    id: 'privacy-level',
    title: 'Choosing a privacy level',
    summary:
      'Higher privacy hides more but can take longer or cost more. Standard is faster and shows more details.',
    termIds: ['privacy', 'anonymity-set', 'metadata'],
    relatedTopicIds: ['send-private'],
  },
  {
    id: 'relayer-help',
    title: 'What a relayer does',
    summary:
      'A relayer sends your payment so your address is not shown as the sender. It charges a fee. It cannot spend your funds.',
    termIds: ['relayer', 'network-fee'],
    relatedTopicIds: ['fees', 'send-private'],
  },
  {
    id: 'fees',
    title: 'Understanding fees',
    summary:
      'Every payment pays a network fee. If a relayer is used, it adds its own small fee. You see the total before you confirm.',
    termIds: ['network-fee', 'relayer'],
    relatedTopicIds: ['relayer-help'],
  },
  {
    id: 'keys',
    title: 'Your keys',
    summary: 'Your spending key moves money. Your viewing key only finds payments. Both stay on your device.',
    termIds: ['spending-key', 'viewing-key', 'recovery-phrase'],
    relatedTopicIds: ['recovery'],
  },
  {
    id: 'recovery',
    title: 'Recovering your wallet',
    summary:
      'Your recovery phrase restores your wallet. Write it on paper and keep it where only you can reach it. Support will never ask for it.',
    termIds: ['recovery-phrase', 'spending-key'],
    relatedTopicIds: ['keys'],
  },
  {
    id: 'activity',
    title: 'Reading your activity',
    summary:
      'Pending means the network has not accepted the payment yet. Confirmed means it has. Failed means no funds moved.',
    termIds: ['confirmation'],
    relatedTopicIds: ['fees'],
  },
];

/** English help registry. */
export const EN_HELP: HelpRegistry = { terms: EN_GLOSSARY, topics: EN_HELP_TOPICS };
