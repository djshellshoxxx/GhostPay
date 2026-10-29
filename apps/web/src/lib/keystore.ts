import { decodeMetaAddress, encodeMetaAddress, parseCompressedPoint, secretScalarFromBytes, zeroize } from '@ghostpay/core-crypto';
import { parseStrictJson, signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';

/** Versioned, encrypted seller key backup. The passphrase never leaves the page and is never stored. */
export interface KeystoreFile {
  readonly v: 1;
  readonly kdf: 'scrypt';
  readonly kdfParams: { readonly N: number; readonly r: number; readonly p: number; readonly salt: string };
  readonly cipher: 'AES-256-GCM';
  readonly iv: string;
  /** Public identifiers, bound into the AEAD as additional data so they cannot be swapped. */
  readonly meta: { readonly metaAddress: string; readonly signer: string };
  readonly ciphertext: string;
}

export interface KeystoreSecrets {
  readonly spendingKey: Uint8Array;
  readonly viewingKey: Uint8Array;
  readonly signingKey: Uint8Array;
}

export interface KeystoreOptions {
  /** scrypt cost; production uses 2^17. Only tests lower it. */
  readonly N?: number;
}

/** scrypt N=2^17, r=8, p=1 (APP_AND_RELAYER_SPEC section 1). */
export const DEFAULT_SCRYPT = { N: 1 << 17, r: 8, p: 1 } as const;
const MIN_N = 1 << 14;
/** Import ceilings sit just above the export profile (N=2^17, r=8, p=1): a crafted file cannot make the tab allocate gigabytes (S3-13). */
const MAX_N = 1 << 18;
const MAX_R = 8;
const MAX_P = 2;
export const MAX_KEYSTORE_BYTES = 8 * 1024;
const MIN_PASSPHRASE = 14;
const HEX64 = /^[0-9a-f]{64}$/;

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (s === undefined) throw new UserFacingError('This browser has no Web Crypto support.');
  return s;
}

async function derive(pass: string, salt: Uint8Array, N: number, r: number, p: number): Promise<CryptoKey> {
  const raw = await scryptAsync(utf8ToBytes(pass.normalize('NFKC')), salt, { N, r, p, dkLen: 32, maxmem: 2 ** 29 });
  try {
    return await subtle().importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

function aad(meta: KeystoreFile['meta'], N: number, r: number, p: number): Uint8Array<ArrayBuffer> {
  return utf8ToBytes(`GhostPay.keystore.v1|${meta.metaAddress}|${meta.signer}|${String(N)}|${String(r)}|${String(p)}`);
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** Bits credited to a character that a guesser's rules produce almost for free (see `cheapCharacters`); a repeat earns none. */
const RULE_BITS = 1;

/**
 * Lower-case words that guessers try first (L1-06): very common passwords, this app's name and wallet words, months and
 * seasons. They are matched anywhere in the passphrase, also behind simple digit and symbol swaps such as 0 for o.
 */
const COMMON = [
  'password', 'passphrase', 'qwerty', 'letmein', 'admin', 'iloveyou', 'welcome', 'monkey', 'dragon', 'football', 'baseball',
  'sunshine', 'princess', 'master', 'shadow', 'superman', 'batman', 'trustno', 'whatever', 'freedom', 'starwars', 'login',
  'hello', 'secret', 'changeme', 'default',
  'ghostpay', 'ghost', 'stealth', 'wallet', 'vault', 'keystore', 'seller', 'invoice', 'bitcoin', 'ethereum', 'crypto',
  'satoshi', 'backup',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'spring', 'summer', 'autumn', 'winter',
];
/** Swaps undone before COMMON is matched; '1' is tried as both i and l. */
const LEET: Readonly<Record<string, string>> = { '0': 'o', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't' };
/** US QWERTY rows and their offsets in key widths. Keys in neighbouring rows touch when their centres are less than one key apart. */
const KEY_ROWS: readonly (readonly [string, number])[] = [['`1234567890-=', 0], ['qwertyuiop[]\\', 1.5], ["asdfghjkl;'", 1.75], ['zxcvbnm,./', 2.25]];
const SHIFTED: Readonly<Record<string, string>> = {
  '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', _: '-', '+': '=',
  '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
};
const KEY_POSITION = new Map<string, readonly [row: number, x: number]>(
  KEY_ROWS.flatMap(([keys, offset], row) => Array.from(keys, (key, i) => [key, [row, offset + i]] as const)),
);

function adjacentKeys(a: string | undefined, b: string | undefined): boolean {
  const pa = a === undefined ? undefined : KEY_POSITION.get(a);
  const pb = b === undefined ? undefined : KEY_POSITION.get(b);
  if (pa === undefined || pb === undefined || a === b) return false;
  const dx = Math.abs(pa[1] - pb[1]);
  return pa[0] === pb[0] ? dx === 1 : Math.abs(pa[0] - pb[0]) === 1 && dx < 1;
}

/**
 * Bits for the characters that a guesser's rules generate cheaply; undefined for every other character. COMMON words
 * (also with swapped digits or symbols), 19xx/20xx years, alphabet or digit sequences ("abcd", "9876") and keyboard walks
 * of four or more keys, where each key touches the previous one or the one before it ("qwerty", "qazwsxedc"), earn
 * RULE_BITS per character. Runs of one character ("!!!!") and any four characters seen earlier ("ghostpayghostpay")
 * earn nothing.
 */
function cheapCharacters(chars: readonly string[]): (number | undefined)[] {
  const n = chars.length;
  const bits = new Array<number | undefined>(n).fill(undefined);
  const mark = (from: number, to: number, credit: number): void => { for (let i = from; i < to; i++) bits[i] = Math.min(bits[i] ?? credit, credit); };
  // One UTF-16 unit per character keeps string indexes equal to character indexes; nothing else can match below.
  const flat = chars.map((c) => { const lower = c.toLowerCase(); return lower.length === 1 ? lower : '\u0000'; });
  for (const one of ['i', 'l']) {
    const text = flat.map((c) => (c === '1' ? one : LEET[c] ?? c)).join('');
    for (const word of COMMON) {
      for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) mark(at, at + word.length, RULE_BITS);
    }
  }
  for (const year of flat.join('').matchAll(/(?:19|20)\d\d/g)) mark(year.index, year.index + 4, RULE_BITS);
  const code = (i: number): number | undefined => (/^[a-z0-9]$/.test(flat[i] ?? '') ? (flat[i] as string).charCodeAt(0) : undefined);
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (i >= 2 && flat[i] === flat[i - 1] && flat[i] === flat[i - 2]) mark(i - 1, i + 1, 0);
    const [a, b, c] = [code(i - 2), code(i - 1), code(i)];
    if (a !== undefined && b !== undefined && c !== undefined && Math.abs(c - b) === 1 && c - b === b - a) mark(i - 1, i + 1, RULE_BITS);
    const gram = flat.slice(i, i + 4).join('');
    if (gram.length === 4 && seen.has(gram)) mark(i, i + 4, 0);
    seen.add(gram);
  }
  const keys = chars.map((c) => SHIFTED[c] ?? c.toLowerCase());
  let start = 0;
  for (let i = 1; i <= n; i++) {
    const walking = i < n && (adjacentKeys(keys[i - 1], keys[i]) || (i - 2 >= start && KEY_POSITION.has(keys[i - 1] ?? '') && adjacentKeys(keys[i - 2], keys[i])));
    if (walking) continue;
    if (i - start >= 4) mark(start + 1, i, RULE_BITS);
    start = i;
  }
  return bits;
}

export interface PassphraseStrength {
  /** 0 (reject) to 4 (strong). */
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: 'too short' | 'weak' | 'fair' | 'good' | 'strong';
  /** Rough entropy estimate in bits. An estimate of effort for a random guesser, not a guarantee. */
  readonly bits: number;
}

/**
 * Crude strength estimate: character-pool size times an effective length that discounts repeated characters, where the
 * characters a guesser's rules produce cheaply (common words, the app name, years, keyboard walks, sequences and
 * repeats) only earn the bits `cheapCharacters` gives them. It rejects the obvious and is shown as an estimate.
 */
export function passphraseStrength(pass: string): PassphraseStrength {
  const chars = Array.from(pass);
  if (chars.length < MIN_PASSPHRASE) return { score: 0, label: 'too short', bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(pass)) pool += 26;
  if (/[A-Z]/.test(pass)) pool += 26;
  if (/[0-9]/.test(pass)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pass)) pool += 33;
  const cheap = cheapCharacters(chars);
  const free = chars.filter((_, i) => cheap[i] === undefined);
  const distinct = new Set(free).size;
  const effective = distinct + (free.length - distinct) * 0.25;
  const bits = Math.max(0, Math.round(effective * Math.log2(Math.max(pool, 2)) + cheap.reduce<number>((sum, b) => sum + (b ?? 0), 0)));
  if (bits < 45) return { score: 1, label: 'weak', bits };
  if (bits < 60) return { score: 2, label: 'fair', bits };
  if (bits < 80) return { score: 3, label: 'good', bits };
  return { score: 4, label: 'strong', bits };
}

export function passphraseProblem(pass: string): string | undefined {
  if (Array.from(pass).length < MIN_PASSPHRASE) return `Use a passphrase of at least ${String(MIN_PASSPHRASE)} characters (four random words work well).`;
  if (passphraseStrength(pass).score < 2) return 'That passphrase is too easy to guess: it is mostly common words or names, a year, a keyboard or alphabet pattern, or repetition. Use several unrelated words, such as a suggested passphrase.';
  return undefined;
}

/** Words for generated passphrases: 1024 (2^10) distinct lower-case words of 4 to 8 letters, none of them in COMMON. */
export const PASSPHRASE_WORDS: readonly string[] = `
  acorn acrobat adobe agate alcove alder alloy allspice almond alpaca amber amethyst amulet anchor anchovy anemone
  angle ankle antelope anthem anvil apiary apple apricot apron aqua arbor arcade arch archer arena aroma
  arrow aspen aspic aster atlas atom attic aurora avenue avocado awning axle azalea azure backpack badge
  badger bagel bagpipe bakery balcony balloon bamboo banana banister banjo banner banquet barge barley barn barrel
  basil basin basket baton bauble bayou bazaar beach beacon beagle beaker beam bean beaver bedrock beech
  beetle begonia bell bench beret berry birch biscuit bison bistro blanket blaze blender blimp bloom blossom
  blotter bluebell bluejay boat bobbin bobcat bonfire bonnet bonsai bookcase boulder bouquet bracket bramble branch brass
  bread breeze brick bridge brioche bronze brooch brook broom brownie bucket buckle buffalo bugle bungalow bunny
  burlap burrito burrow bushel butter button buzzard cabbage cabin cabinet cable cactus caddy calico calliope camel
  camellia cameo canal canary candle candy canoe canopy canteen canvas canyon caramel caravan cardinal cargo carousel
  carpet carrot cartoon cascade cashew cashmere castle catalog catfish cattle cauldron cavern cedar celery cello cereal
  chalice chalk chapel charcoal chariot charm cheddar cheese cheetah cherry chestnut chicory chili chimney chipmunk chisel
  chive chord chorus chowder cicada cider cinder cinnamon citrus clam clarinet clay cliff clipper cloak clover
  coast cobalt cobble cocoa coconut cocoon codex comet comma compass compote conch condor confetti cookbook copper
  coral cork corn cornet corridor corsage cosmos cottage cotton cougar cove cowbell coyote crab cradle crane
  crater crayon cream creek crepe crest cribbage cricket crockery crocus croquet crouton crow crown crumpet crystal
  cuckoo cumin cupcake curlew currant curtain cushion custard cymbal cypress daffodil dahlia daisy dawn daybreak decanter
  delta denim derby desert desk dewberry dewdrop diadem dial dinghy dingo diorama dolmen dolphin domino donkey
  donut doorbell doublet dove drawer drizzle drum duckling duet dulcimer dumpling dune dusk dynamo eagle earring
  easel ebony echo eclipse eggplant egret elbow elixir ember emblem emerald encore engine envelope equator ermine
  espresso estuary etching fable fairway falafel falcon fanfare fawn feather fedora fennel fern ferret ferry festival
  fiddle field figurine filbert finch firefly fireside fjord flag flagon flame flamingo flannel flask flint flotilla
  flurry flute foal folio footpath forge fossil fountain foxglove fresco fritter frost fudge fulcrum funnel gable
  galaxy galleon gallon gannet garden gardenia garland garlic garnet gazebo gazelle gecko gelato gemstone geranium gerbil
  geyser ginger gingham ginkgo giraffe glacier glade glen glider globe glove goblet goldfish gondola goose gopher
  gorge gosling gourd granary granite granola grape gravel gravy grebe greenery griddle grotto grouse grove guava
  guild guitar gull gumdrop guppy haddock halibut halyard hamlet hammer hammock hamster hangar harbor hare harmony
  harp harvest hatchet hawk hayloft hazel headland hearth heather hedge hedgehog helmet hemlock herald heron herring
  hibiscus hickory hill hillside hinge hippo holly honey horizon hornet hummus husky hyacinth hyena ibex icicle
  igloo iguana impala indigo inkwell inlet iris island isthmus ivory jackal jacket jaguar jamboree jasmine jasper
  jelly jetty jigsaw journal jubilee juggler jukebox jungle juniper kayak keepsake kelp kernel kestrel ketchup kettle
  kiln kimono kinship kitten kiwi knapsack knoll koala krill lacquer ladder ladle lagoon lake lamb landmark
  lantern lanyard lapwing larch lark lasagna latch lattice laurel lava lavender lawn leaf ledge leek legume
  lemon lemonade lemur lentil leopard lettuce lifeboat lilac lily lime limerick linden linen lion lizard llama
  lobster locket locust lodge lollipop lookout loom lotus lullaby lute lychee lynx macaroon macaw mackerel madrigal
  magnet magnolia magpie mailbox mainsail mallard mallet manatee mandolin mango manor mantis mantle maple marble marigold
  marina marlin marmot marquee marsh marzipan mason masonry mayfly meadow meerkat melody melon meringue mesa meteor
  millpond mimosa minaret mink minnow minstrel mint mirror mitten moat mole monocle monsoon moonbeam moorland moose
  mosaic moss moth motif mountain muffin muffler mulberry mule museum muslin mussel mustard myrtle napkin narwhal
  nautilus nebula necklace nectar needle nettle newt nickel nomad noodle notebook nougat nugget nutmeg nutshell oasis
  oatmeal obelisk oboe ocean ocelot octopus oilcloth okapi olive omelet onion onyx opal orange orbit orca
  orchard orchid oregano origami oriole osprey ostrich otter outpost overture owlet oyster paddle paddock pagoda palace
  palette palm pamphlet pancake panda pansy panther papaya paprika parade parasol parcel parrot parsley parsnip passport
  pasta pastry pasture pavilion peach peacock peanut pear pearl pebble pecan pelican pencil pendant penguin penknife
  peony pepper perch petal petunia pewter pheasant piano pickle pier pigeon pike pillow pine pinwheel pipeline
  pitcher pizza placemat planet plank planter plateau plaza plover plum pocket polenta pollen pony poodle poplar
  poppy porch portrait possum postcard potato potluck pottery prairie prawn pretzel primrose prism pudding puddle puffin
  pulley puma pumpkin puppy pushcart puzzle quadrant quail quarry quartz quasar quill quilt quince quinoa rabbit
  raccoon radiator radish raft rainbow raisin rake ramble ranch rapids rattan raven ravine recital redwood reef
  regatta reindeer relic ribbon ridge risotto river roadster robin rocket rooster root rose rosemary rotunda rowan
  rowboat ruby rucksack rudder ruler saddle saffron sage sailboat salad salmon salsa sandal sandbar sapling sapphire
  sardine satchel satin sauce sausage sawmill scaffold scallop scarf schooner scone scroll seagull seal seashell sequoia
  serenade sesame shamrock shark sheep shell sherbet shipyard shore shrimp shrub sienna signpost silk silo sitar
  skillet skunk skylark skyline sled sleet sleigh slope sloth snail snapper snow snowdrop solstice sonnet sorbet
  sorrel spade spaniel sparrow spatula spinach sponge spoon sprocket spruce squash squid stable starfish starling statue
  steeple stencil stirrup stork storm stream sturgeon suede summit sunbeam sundae sundial sunlight sunset swallow swamp
  swan sweater sycamore symphony syrup tableau taco tadpole tandem tangelo tapestry tapir tarragon tavern teacup teapot
  tempo tent termite terrace terrier thatch thermos thicket thimble thistle thrush thunder thyme tiara tiger timber
  timpani toast toboggan toffee tofu tollgate tomato topaz topsail torch tornado tortoise toucan towel tower trapeze
  trellis trinket tripod trombone trout trowel truffle trumpet tugboat tulip tundra tunnel turkey turnip turtle tuxedo
  tweed twig typhoon ukulele umbrella unicorn upland urchin vagabond valise valley vanilla vase vellum velvet veranda
  viaduct vine vineyard viola violet violin vireo volcano voyage vulture wafer waffle wagon wainscot walkway walnut
  walrus warbler wardrobe wasp weasel weaver wheat whisker whistle wicker willow windmill windsock wishbone wombat woodland
  woodpile wool wren yacht yarrow yearling yogurt yolk zebra zenith zephyr zeppelin zinnia zipper zodiac zucchini
`.trim().split(/\s+/);
/** Words in a generated passphrase: 6 x 10 bits = 60 bits, far beyond offline guessing at scrypt N=2^17. */
export const GENERATED_PASSPHRASE_WORDS = 6;
export const GENERATED_PASSPHRASE_BITS = GENERATED_PASSPHRASE_WORDS * Math.log2(PASSPHRASE_WORDS.length);

/** A fresh passphrase of random PASSPHRASE_WORDS joined by hyphens, picked on this device with crypto.getRandomValues (L1-06). */
export function generatePassphrase(): string {
  for (;;) {
    const picks = randomBytes(GENERATED_PASSPHRASE_WORDS * 2);
    // 2^16 is a multiple of the 2^10 list, so each 16-bit value modulo 1024 picks every word with the same probability.
    const words = Array.from({ length: GENERATED_PASSPHRASE_WORDS }, (_, i) => PASSPHRASE_WORDS[(((picks[2 * i] as number) << 8) | (picks[2 * i + 1] as number)) % PASSPHRASE_WORDS.length] as string);
    const phrase = words.join('-');
    // Draws the estimator would refuse (such as one word six times) are vanishingly rare; draw again rather than offer one.
    if (passphraseProblem(phrase) === undefined) return phrase;
  }
}

/** Encrypts the three seller secrets. Returns pretty JSON text for download. */
export async function encryptKeystore(
  secrets: KeystoreSecrets,
  meta: KeystoreFile['meta'],
  passphrase: string,
  options: KeystoreOptions = {},
): Promise<string> {
  const problem = passphraseProblem(passphrase);
  if (problem !== undefined) throw new UserFacingError(problem);
  const { r, p } = DEFAULT_SCRYPT;
  const N = options.N ?? DEFAULT_SCRYPT.N;
  if (!Number.isInteger(N) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) throw new UserFacingError('Invalid scrypt cost.');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await derive(passphrase, salt, N, r, p);
  const plain = utf8ToBytes(
    JSON.stringify({
      spendingKey: bytesToHex(secrets.spendingKey),
      viewingKey: bytesToHex(secrets.viewingKey),
      signingKey: bytesToHex(secrets.signingKey),
    }),
  ) as Uint8Array<ArrayBuffer>;
  try {
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(meta, N, r, p), tagLength: 128 }, key, plain));
    const file: KeystoreFile = {
      v: 1,
      kdf: 'scrypt',
      kdfParams: { N, r, p, salt: bytesToHex(salt) },
      cipher: 'AES-256-GCM',
      iv: bytesToHex(iv),
      meta,
      ciphertext: bytesToHex(ct),
    };
    return JSON.stringify(file, null, 2);
  } finally {
    plain.fill(0);
  }
}

const BAD = 'This is not a valid GhostPay keystore file.';

function rec(v: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new UserFacingError(BAD);
  if (keys !== undefined && Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) throw new UserFacingError(BAD);
  return v as Record<string, unknown>;
}
function hex(v: unknown, min: number, max: number): Uint8Array {
  if (typeof v !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(v) || v.length < min * 2 || v.length > max * 2) throw new UserFacingError(BAD);
  return hexToBytes(v);
}

/** Validates the complete bounded envelope before a QR/file transfer may request a passphrase. */
export function validateKeystoreEnvelope(text: string): KeystoreFile {
  if (typeof text !== 'string' || text.length > MAX_KEYSTORE_BYTES || new TextEncoder().encode(text).byteLength > MAX_KEYSTORE_BYTES) throw new UserFacingError(BAD);
  let parsed: unknown;
  try { parsed = parseStrictJson(text); } catch { throw new UserFacingError(BAD); }
  const f = rec(parsed, ['v', 'kdf', 'kdfParams', 'cipher', 'iv', 'meta', 'ciphertext']);
  if (f['v'] !== 1 || f['kdf'] !== 'scrypt' || f['cipher'] !== 'AES-256-GCM') throw new UserFacingError(BAD);
  const kp = rec(f['kdfParams'], ['N', 'r', 'p', 'salt']);
  const N = kp['N']; const r = kp['r']; const p = kp['p'];
  if (typeof N !== 'number' || !Number.isInteger(N) || N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) throw new UserFacingError(BAD);
  if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > MAX_R) throw new UserFacingError(BAD);
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > MAX_P) throw new UserFacingError(BAD);
  hex(kp['salt'], 16, 64); hex(f['iv'], 12, 12); hex(f['ciphertext'], 17, 1024);
  const m = rec(f['meta'], ['metaAddress', 'signer']);
  if (typeof m['metaAddress'] !== 'string' || m['metaAddress'].length !== 141 || typeof m['signer'] !== 'string' || !/^(02|03)[0-9a-f]{64}$/.test(m['signer'])) throw new UserFacingError(BAD);
  try {
    if (encodeMetaAddress(decodeMetaAddress(m['metaAddress'])) !== m['metaAddress']) throw new Error();
    parseCompressedPoint(hexToBytes(m['signer']));
  } catch { throw new UserFacingError(BAD); }
  return f as unknown as KeystoreFile;
}

/** Strictly parses and decrypts a keystore. Wrong passphrase and tampering are indistinguishable by design. */
export async function decryptKeystore(text: string, passphrase: string): Promise<KeystoreSecrets> {
  const f = validateKeystoreEnvelope(text);
  const { N, r, p } = f.kdfParams;
  const salt = hexToBytes(f.kdfParams.salt); const iv = hexToBytes(f.iv); const ct = hexToBytes(f.ciphertext);
  const { metaAddress, signer } = f.meta;
  const key = await derive(passphrase, salt, N, r, p);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer>, additionalData: aad({ metaAddress, signer }, N, r, p), tagLength: 128 },
        key,
        ct,
      ),
    );
  } catch {
    throw new UserFacingError('Wrong passphrase, or the keystore was modified.');
  }
  try {
    const body = rec(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(plain)), ['spendingKey', 'viewingKey', 'signingKey']);
    const out: Record<string, Uint8Array> = {};
    for (const k of ['spendingKey', 'viewingKey', 'signingKey']) {
      const v = body[k];
      if (typeof v !== 'string' || !HEX64.test(v)) throw new UserFacingError(BAD);
    }
    for (const k of ['spendingKey', 'viewingKey', 'signingKey']) out[k] = hexToBytes(body[k] as string);
    const secrets = { spendingKey: out['spendingKey'] as Uint8Array, viewingKey: out['viewingKey'] as Uint8Array, signingKey: out['signingKey'] as Uint8Array };
    try {
      const publicOf = (bytes: Uint8Array): string => {
        const scalar = secretScalarFromBytes(bytes);
        try { return signerPublicKeyHex(scalar); } finally { zeroize(scalar); }
      };
      const spendPub = publicOf(secrets.spendingKey); const viewPub = publicOf(secrets.viewingKey); const signingPub = publicOf(secrets.signingKey);
      const actualMeta = encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(hexToBytes(spendPub)), viewingPublicKey: parseCompressedPoint(hexToBytes(viewPub)) });
      if (actualMeta !== metaAddress || signingPub !== signer || signingPub === spendPub || signingPub === viewPub) throw new UserFacingError('The keystore metadata does not match its independent seller keys.');
      return secrets;
    } catch (error) {
      zeroize(secrets.spendingKey, secrets.viewingKey, secrets.signingKey);
      throw error;
    }
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError(BAD);
  } finally {
    plain.fill(0);
  }
}
