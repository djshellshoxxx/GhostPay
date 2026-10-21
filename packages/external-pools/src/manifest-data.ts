import { parseManifest, type PoolManifest } from './manifest.js';

const PP_README = 'https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/main/packages/sdk/README.md';
const RG_MODELS = 'https://raw.githubusercontent.com/Railgun-Community/shared-models/main/src/models/network-config.ts';

/**
 * Pinned testnet manifest (retrieved 2026-10-21).
 *
 * - Privacy Pools: NO public Sepolia or Base Sepolia deployment address was found in the primary
 *   sources (README lists mainnet only), so the entry carries no contracts. Circuit SHA-256 digests are
 *   copied from the SDK README of `@0xbow/privacy-pools-core-sdk` 1.5.0 [verified in README text].
 *   `status: 'unverified'` makes the adapter report lifecycle `unknown`.
 * - Railgun Sepolia: proxy and relay-adapt addresses are copied from `shared-models` `network-config.ts`
 *   [verified in that file]; runtime code hashes could NOT be read (no RPC egress in the build sandbox),
 *   so the entry stays `unverified` until an operator fills `codeHashes` from a trusted RPC.
 *   Base Sepolia is not a Railgun network in shared-models, so no entry exists [verified by absence].
 *
 * @security Never infer addresses from RPC or SDK defaults (EP-GEN-3). Promote an entry to `verified`
 *   only with code hashes read from a node you trust.
 */
export const TESTNET_MANIFEST: PoolManifest = parseManifest({
  schema: 1,
  retrieved: '2026-10-21',
  entries: [
    {
      route: 'privacy-pools',
      chainId: 11155111,
      status: 'unverified',
      contracts: {},
      codeHashes: {},
      artifactSha256: {
        'commitment.wasm': '254d2130607182fd6fd1aee67971526b13cfe178c88e360da96dce92663828d8',
        'commitment.vkey': '7d48b4eb3dedc12fb774348287b587f0c18c3c7254cd60e9cf0f8b3636a570d8',
        'commitment.zkey': '494ae92d64098fda2a5649690ddc5821fcd7449ca5fe8ef99ee7447544d7e1f3',
        'withdraw.wasm': '36cda22791def3d520a55c0fc808369cd5849532a75fab65686e666ed3d55c10',
        'withdraw.vkey': '666bd0983b20c1611543b04f7712e067fbe8cad69f07ada8a310837ff398d21e',
        'withdraw.zkey': '2a893b42174c813566e5c40c715a8b90cd49fc4ecf384e3a6024158c3d6de677',
      },
      sources: [PP_README],
      notes: 'No public Sepolia address found; deploy scripts exist upstream (script/Deploy.s.sol EthereumSepolia). UNVERIFIED liveness.',
    },
    {
      route: 'railgun',
      chainId: 11155111,
      status: 'unverified',
      contracts: {
        proxy: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea',
        relayAdapt: '0x7e3d929EbD5bDC84d02Bd3205c777578f33A214D',
        wrappedBaseToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      },
      codeHashes: {},
      deploymentBlock: 5784866,
      sources: [RG_MODELS],
      notes: 'Addresses from shared-models; code hashes UNVERIFIED (no RPC egress). PPOI node and broadcaster liveness UNVERIFIED.',
    },
  ],
});
