import { ANNOUNCEMENT_TOPIC, EPHEMERAL_PUBLIC_KEY_BYTES, MAX_METADATA_BYTES, MAX_SCHEME_ID, MIN_METADATA_BYTES, type Hex } from './wire.js';

/** One raw announcer log as returned by `eth_getLogs`, already shape-checked by the RPC reader. */
export interface RawLog {
  readonly address: Hex;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly logIndex: number;
  readonly transactionHash: Hex;
  readonly removed: boolean;
}

/** Decoded public announcement fields (no chain position). */
export interface DecodedAnnouncement {
  readonly schemeId: bigint;
  readonly stealthAddress: Hex;
  readonly caller: Hex;
  readonly ephemeralPublicKey: Hex;
  readonly metadata: Hex;
}

const WORD = 64; // hex chars per 32-byte word

function topicAddress(topic: Hex): Hex | undefined {
  const body = topic.slice(2);
  if (body.length !== WORD || !/^0{24}/.test(body)) return undefined;
  return `0x${body.slice(24)}`;
}

/** Reads `bytes` at byte offset `offset` of the ABI data body (hex without 0x). Bounds-checked. */
function readBytes(body: string, offset: bigint): string | undefined {
  const start = offset * 2n;
  if (offset % 32n !== 0n || start + BigInt(WORD) > BigInt(body.length)) return undefined;
  const at = Number(start);
  const len = BigInt(`0x${body.slice(at, at + WORD)}`);
  const dataStart = start + BigInt(WORD);
  if (dataStart + len * 2n > BigInt(body.length)) return undefined;
  return body.slice(Number(dataStart), Number(dataStart + len * 2n));
}

/**
 * Decodes an ERC-5564 `Announcement(uint256 indexed, address indexed, address indexed, bytes, bytes)` log.
 * Returns `undefined` for anything that is not a well-formed announcement or that falls outside the v1 record limits
 * (33-byte ephemeral key, 1..4096-byte metadata, 64-bit scheme id); the caller counts those as `omitted`.
 *
 * @security Pure function over public data. It does not interpret the view tag or run any matching.
 */
export function decodeAnnouncementLog(log: RawLog): DecodedAnnouncement | undefined {
  if (log.topics.length !== 4 || log.topics[0] !== ANNOUNCEMENT_TOPIC) return undefined;
  const [, schemeTopic, stealthTopic, callerTopic] = log.topics as readonly [Hex, Hex, Hex, Hex];
  const stealthAddress = topicAddress(stealthTopic);
  const caller = topicAddress(callerTopic);
  if (schemeTopic.length !== WORD + 2 || stealthAddress === undefined || caller === undefined) return undefined;
  const schemeId = BigInt(schemeTopic);
  if (schemeId > MAX_SCHEME_ID) return undefined;
  const body = log.data.slice(2);
  if (body.length < 2 * WORD) return undefined;
  const pk = readBytes(body, BigInt(`0x${body.slice(0, WORD)}`));
  const meta = readBytes(body, BigInt(`0x${body.slice(WORD, 2 * WORD)}`));
  if (pk === undefined || meta === undefined) return undefined;
  const metaLen = meta.length / 2;
  if (pk.length / 2 !== EPHEMERAL_PUBLIC_KEY_BYTES || metaLen < MIN_METADATA_BYTES || metaLen > MAX_METADATA_BYTES) return undefined;
  return { schemeId, stealthAddress, caller, ephemeralPublicKey: `0x${pk}`, metadata: `0x${meta}` };
}
