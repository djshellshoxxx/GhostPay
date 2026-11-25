// Fixed v1 seller keystore written once by `encryptKeystore` (N=2^14) over the public TEST-ONLY keys of
// test-vectors/scheme1.json vector scheme1-001 plus a synthetic invoice signer 0x44..44. Shared by the known-answer
// and fuzz tests; never imported by production code.
export const SCHEME1_001 = { spending: '11'.repeat(32), viewing: '22'.repeat(32), signing: '44'.repeat(32) } as const;
export const KEYSTORE_V1_PASSPHRASE = 'synthetic vector harbor lantern quartz';
export const KEYSTORE_V1 = JSON.stringify({
  v: 1,
  kdf: 'scrypt',
  kdfParams: { N: 16384, r: 8, p: 1, salt: '1f0b8f2c7bd26980b3fddfc4bb05851e' },
  cipher: 'AES-256-GCM',
  iv: '6e5a77f36728ef62fc3874e2',
  meta: {
    metaAddress: 'st:eth:0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27',
    signer: '032c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991',
  },
  ciphertext:
    'a2eaefc7a66072801230c3173597ff2ad28b9019578d68703498c440b7719791f8cc4ba2be30ba23889accc64696eeeb2cd572c41694cfd30a1e3973efe08bec45a2293b6184c52970da1db3c753b619730303af8836491fab0791bcef705eadbc229f8e93fea54a11891ed245c0e3814fad3d719432b3ac80c2e7c525e39b01d22e702ce78206530b1c3ee6ec655a23e61bbd9d7ea0b86600d5da6405921c5914b04e7744c2d93e32a918e93368f7c1ecba3508411cf8414bbad8719e1d8a149a6f20851d1e502ad9e0be36cfd54b276d3dff60f3523029b67cd8c962321e27abf5f7b6f4626aec36bc0c1df1c72347b7dbe41566283fecc41ad5e4deb2f2d503eb',
}, null, 2);
