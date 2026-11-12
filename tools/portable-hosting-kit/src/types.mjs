// @ts-check
// Shared type contracts (JSDoc only; no runtime code). FROZEN for parallel work: change only through the coordinator.
// Every module imports types from here with `@typedef {import('./types.mjs').X} X`.

export {};

/**
 * Bounds applied while inventorying an input site. All are inclusive maxima.
 * @typedef {object} Limits
 * @property {number} maxFiles        number of regular files
 * @property {number} maxTotalBytes   sum of file sizes
 * @property {number} maxFileBytes    size of any single file
 * @property {number} maxPathBytes    UTF-8 bytes of a relative path
 * @property {number} maxSegmentBytes UTF-8 bytes of one path segment
 * @property {number} maxDepth        number of path segments
 * @property {number} maxDirEntries   entries visited while walking (files + dirs + rejected), bounds hostile trees
 */

/**
 * One accepted regular file of the input site.
 * @typedef {object} InventoryEntry
 * @property {string} path     POSIX relative path, NFC, validated (no leading "/", no "." / ".." segments)
 * @property {number} size     bytes
 * @property {string} absPath  absolute filesystem path it was read from
 */

/**
 * @typedef {'error' | 'warning'} Severity
 */

/**
 * A validation finding. `code` is an ErrorCode from errors.mjs; `rule` names the specific policy rule.
 * @typedef {object} Finding
 * @property {import('./errors.mjs').ErrorCode} code
 * @property {string} rule
 * @property {Severity} severity
 * @property {string} message
 * @property {string} [path]
 */

/**
 * Result of validating an input directory. `ok` is true iff there is no finding with severity "error".
 * @typedef {object} ValidationReport
 * @property {boolean} ok
 * @property {string} siteDir           absolute, realpath of the input directory
 * @property {string} entrypoint        relative path of the HTML entrypoint (default "index.html")
 * @property {InventoryEntry[]} entries sorted by UTF-8 byte order of `path`
 * @property {Finding[]} findings
 * @property {number} totalBytes
 * @property {string[]} trustSensitive  paths that look like application trust configuration (never modified)
 */

/**
 * Per-file record in the manifest. Shape intentionally equals Replikrazy's draft ArtifactFile.
 * @typedef {object} FileRecord
 * @property {string} path
 * @property {number} size
 * @property {string} sha256 lowercase hex
 */

/**
 * @typedef {object} Provenance
 * @property {string} label                  operator-chosen release label, e.g. "v0.1.0" or "demo"
 * @property {number | null} sourceDateEpoch from SOURCE_DATE_EPOCH or --source-date-epoch; never wall-clock
 * @property {{ kind: 'git', commit: string, dirty: boolean | null } | { kind: 'directory' }} source
 * @property {string[]} notes                free-text, operator supplied
 */

/**
 * The versioned manifest stored as HOSTING-MANIFEST.json inside the archive.
 * @typedef {object} HostingManifest
 * @property {'ghostpay.hosting-kit.manifest'} schema
 * @property {1} schemaVersion
 * @property {string} appId                  [a-z0-9][a-z0-9._-]{0,79}
 * @property {{ name: string, version: string }} kit
 * @property {{ id: string, version: number, limits: Limits, allowSourceMaps: boolean }} policy
 * @property {{ root: 'site/', entrypoint: string, fileCount: number, totalBytes: number, digest: string, files: FileRecord[] }} content
 *           digest = "sha256:" + hex(sha256(canonicalJson({ entrypoint, files })))
 * @property {Provenance} provenance
 * @property {string[]} trustSensitive
 * @property {string[]} metadataFiles        other files at the archive top level (excluding SHA256SUMS), sorted
 */

/**
 * Public, host-specific configuration. Contains no secrets and no application trust settings
 * (chain IDs, contract addresses, RPC URLs are rejected: they belong to the application build).
 * @typedef {object} HostConfig
 * @property {1} schemaVersion
 * @property {'clearnet' | 'onion' | 'i2p'} transport
 * @property {string | null} publicOrigin   "https://host" | "http://<56 base32>.onion" | "http://<52 base32>.b32.i2p" | null (not known yet)
 * @property {string} basePath              "/" or "/seg/.../" (leading and trailing slash)
 * @property {Listener} listen              where the local web server listens (loopback or unix socket only)
 * @property {string} mirrorLabel           short human label shown in mirror metadata
 * @property {string | null} onionLocation  clearnet only: an onion origin to advertise with Onion-Location
 */

/**
 * @typedef {{ kind: 'tcp', host: string, port: number } | { kind: 'unix', path: string }} Listener
 */

/**
 * One header rule from a Netlify/Cloudflare-style `_headers` file.
 * @typedef {object} HeaderRule
 * @property {string} pattern                URL path pattern as written ("/*", "/assets/*", "/index.html")
 * @property {Array<[string, string]>} set   headers to add (name in canonical case, value)
 * @property {string[]} detach               header names removed by "! Name" lines
 */

/**
 * The response-header policy for one site at one base path.
 * @typedef {object} HeaderPolicy
 * @property {HeaderRule[]} rules
 * @property {'site' | 'kit-default'} source  whether rules came from the site's `_headers` or the kit default
 */

/**
 * How a request path resolves (shared semantics of the preview server and the nginx profile).
 * @typedef {{ kind: 'file', path: string } | { kind: 'fallback', path: string } | { kind: 'not-found' } | { kind: 'forbidden' } | { kind: 'redirect', location: string }} RouteResult
 *   file: serve this relative path; fallback: SPA deep link, serve the entrypoint with status 200;
 *   redirect: 301 to location (only for the bare base path without trailing slash)
 */
