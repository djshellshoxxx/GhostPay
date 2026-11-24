/**
 * Offline provenance/configuration gate. A well-formed claim is not independent
 * chain verification: source review, RPC readback and acceptance remain separate.
 */
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const integer = (min, max) => (value) => Number.isSafeInteger(value) && value >= min && value <= max;
const address = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0+$/.test(value);
const hash = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0+$/.test(value);
const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const https = (value) => {
  if (!text(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname); }
  catch { return false; }
};
const calendarDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const contract = (value, verified) => exactKeys(value, ['address', 'codehash']) && address(value.address) && (hash(value.codehash) || (!verified && value.codehash === null));
const deployment = (value) => exactKeys(value, ['manifest', 'sha256', 'readback'])
  && /^deployments\/[1-9][0-9]*\.json$/.test(value.manifest)
  && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) && !/^0+$/.test(value.sha256)
  && https(value.readback);

/** Validate every configured chain, token and feed. Release mode rejects pending required cells. */
export function validateChainMatrix(matrix, config, { release = false } = {}) {
  const errors = [];
  const error = (path, message) => errors.push(`${path}: ${message}`);
  if (!exactKeys(matrix, ['schemaVersion', 'chains']) || matrix.schemaVersion !== 1 || !Array.isArray(matrix.chains)) {
    return ['matrix: expected schemaVersion 1 and chains array, with no other keys'];
  }
  const cell = (value, path, valid, required) => {
    if (!exactKeys(value, ['status', 'value', 'source', 'retrieved', 'reason'])) {
      error(path, 'invalid cell fields'); return undefined;
    }
    if (!['verified', 'unverified', 'n/a'].includes(value.status)) error(path, 'invalid status');
    if (value.status === 'verified') {
      if (!https(value.source) || !calendarDate(value.retrieved)) error(path, 'verified cell requires HTTPS source and retrieval date');
      if (value.reason !== null) error(path, 'verified cell reason must be null');
      if (value.value === null) error(path, 'verified cell cannot be null');
    } else {
      if (!text(value.reason)) error(path, 'unverified/n/a cell requires a reason');
      if ((value.source === null) !== (value.retrieved === null)) error(path, 'source and retrieval date must occur together');
      if (value.source !== null && (!https(value.source) || !calendarDate(value.retrieved))) error(path, 'invalid source or retrieval date');
      if (value.status === 'n/a' && value.value !== null) error(path, 'n/a value must be null');
    }
    if (value.value !== null && !valid(value.value, value.status === 'verified')) error(path, 'invalid value');
    if (required && value.status !== 'verified') error(path, 'required release cell is not verified');
    return value.value;
  };
  const compare = (actual, expected, path, addresses = false) => {
    if (addresses ? !sameAddress(actual, expected) : actual !== expected) error(path, 'value differs from configuration');
  };
  const matchRows = (rows, configured, key, path, check) => {
    if (!Array.isArray(rows)) { error(path, 'expected array'); return; }
    const seen = new Set();
    for (const row of rows) {
      if (!record(row)) { error(path, 'invalid row'); continue; }
      const id = key(row);
      if (seen.has(id)) error(path, `duplicate row ${id}`);
      seen.add(id);
      const expected = configured.find((item) => key(item) === id);
      if (!expected) { error(path, `unknown row ${id}`); continue; }
      check(row, expected, `${path}[${id}]`);
    }
    for (const expected of configured) if (!seen.has(key(expected))) error(path, `missing row ${key(expected)}`);
  };
  matchRows(matrix.chains, config.chains, (chain) => chain.chainId, 'chains', (chain, expected, path) => {
    if (!exactKeys(chain, ['chainId', 'enabled', 'gasToken', 'finalityDepth', 'getLogsMaxRange', 'announcer', 'registry', 'deployment', 'tokens', 'feeds'])) {
      error(path, 'invalid chain fields'); return;
    }
    compare(chain.enabled, expected.enabled, `${path}.enabled`);
    const required = release && expected.enabled === true;
    for (const [name, value, valid] of [
      ['gasToken', expected.nativeSymbol, text],
      ['finalityDepth', expected.finalityDepth, integer(1, Number.MAX_SAFE_INTEGER)],
      ['getLogsMaxRange', expected.getLogsMaxRange, integer(1, Number.MAX_SAFE_INTEGER)],
    ]) compare(cell(chain[name], `${path}.${name}`, valid, required), value, `${path}.${name}`);
    for (const name of ['announcer', 'registry']) {
      const value = cell(chain[name], `${path}.${name}`, contract, required);
      const canonical = config[name];
      if (value !== null && value !== undefined && canonical !== undefined) compare(value.address, canonical, `${path}.${name}.address`, true);
    }
    const pin = cell(chain.deployment, `${path}.deployment`, deployment, required);
    if (record(pin) && pin.manifest !== `deployments/${chain.chainId}.json`) error(`${path}.deployment`, 'manifest path differs from chain id');
    matchRows(chain.tokens, config.tokens.filter((token) => token.chainId === chain.chainId), (token) => token.symbol, `${path}.tokens`, (token, expectedToken, tokenPath) => {
      if (!exactKeys(token, ['symbol', 'address', 'decimals', 'permit', 'blacklist', 'eip3009'])) { error(tokenPath, 'invalid token fields'); return; }
      compare(cell(token.address, `${tokenPath}.address`, address, required), expectedToken.address, `${tokenPath}.address`, true);
      compare(cell(token.decimals, `${tokenPath}.decimals`, integer(0, 30), required), expectedToken.decimals, `${tokenPath}.decimals`);
      const permit = cell(token.permit, `${tokenPath}.permit`, (value, verified) => (verified ? ['erc2612', 'dai', 'none'] : ['erc2612', 'dai', 'none', 'unknown']).includes(value), required);
      // The current runtime flag only advertises ERC-2612. Do not infer another permit standard from false.
      if (expectedToken.permit ? permit !== 'erc2612' : permit === 'erc2612') error(`${tokenPath}.permit`, 'value differs from configuration');
      const blacklist = cell(token.blacklist, `${tokenPath}.blacklist`, (value) => typeof value === 'boolean', required);
      if (expectedToken.blacklistCapable !== undefined) compare(blacklist, expectedToken.blacklistCapable, `${tokenPath}.blacklist`);
      cell(token.eip3009, `${tokenPath}.eip3009`, (value) => typeof value === 'boolean', required);
    });
    matchRows(chain.feeds, config.feeds.filter((feed) => feed.chainId === chain.chainId), (feed) => `${feed.base}/${feed.quote}`, `${path}.feeds`, (feed, expectedFeed, feedPath) => {
      if (!exactKeys(feed, ['base', 'quote', 'address', 'decimals', 'heartbeatSec', 'acceptance'])) { error(feedPath, 'invalid feed fields'); return; }
      compare(cell(feed.address, `${feedPath}.address`, address, required), expectedFeed.address, `${feedPath}.address`, true);
      compare(cell(feed.decimals, `${feedPath}.decimals`, integer(0, 30), required), expectedFeed.decimals, `${feedPath}.decimals`);
      compare(cell(feed.heartbeatSec, `${feedPath}.heartbeatSec`, integer(1, Number.MAX_SAFE_INTEGER), required), expectedFeed.heartbeatSec, `${feedPath}.heartbeatSec`);
      cell(feed.acceptance, `${feedPath}.acceptance`, https, required);
    });
  });
  return errors;
}
