# P06 — Independent key roles and scoped delegation

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P06` / `key-role-separation` |
| Branch | `future/p06-key-role-separation` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | None |
| Optional integrations | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Expose narrowly scoped local cryptographic capabilities so future modules cannot accidentally exchange spending, viewing, invoice-authentication or persona authority. Keep private material client-controlled, make delegation scope explicit, and prevent stale operations from exercising a previous user's key.

Sources: [issue #284 P06](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283), and [architecture 5b](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5b.md) / [5c](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5c.md). This is a foundational provider with no future-module dependencies. **No guardians, social recovery, publisher recovery key or recovery administrator are introduced.**

## 2. Existing implementation and residual delta

- [Crypto exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/core-crypto/src/index.ts) includes `generateKeySet`, `randomScalar`, `encodeMetaAddress`, `deriveStealthPayment`, `deriveStealthSecret`, and typed secret scalars.
- [Secret-box exports](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/secret-box/src/index.ts) includes `SecretBox`, `SecretScope`, `withScope`, `withScopeAsync`, `wipe`, and `assertNoSecretBox`.
- [Session](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts) rejects reused invoice-signing/spending/viewing secrets and exports `withSessionSecrets`, `withSessionSecretsAsync`, `captureSessionGuard`, and `captureSessionVersionGuard`.
- [App lock](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/appLock.ts) exports `subscribeAppLock` and `notifyAppLock`.
- [Seller pairing](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sellerPairing.ts) exports `exportSellerPairing` and `parseSellerPairing`; preserve its actual public configuration semantics rather than calling it private-key delegation.

The delta is an explicit role/capability registry and revocable operation handles reused by future modules. Existing memory hygiene is retained. Do not invent cryptographic derivations or assume JS memory wiping is absolute.

## 3. Scope and key authority

Proposed ownership is a browser-safe role/capability layer around secret-box and session adapters. P05 owns encrypted durable storage; P04 owns invoice format; signing consumers own exact intent validation. P06 imports none of its future consumers, and offers no network API.

Roles are `spend`, `view`, `invoice-sign`, `identity-sign`, and `device-auth`. Each role has an explicit purpose/domain allowlist. Local viewing delegation can match announcements but cannot derive spend keys, sign payments or authorize exports. No viewing key is sent to RPC/indexer/relayer infrastructure.

Optional transfer to a user-controlled offline device must be separately specified through authenticated encrypted exchange, explicit scope and independent backup. It is not automatic cloud synchronization. Revoking a local handle cannot erase a secret already exported elsewhere; UI must state this limitation.

## 4. Proposed data and API

```ts
type KeyRole = 'spend' | 'view' | 'invoice-sign'
  | 'identity-sign' | 'device-auth';
interface KeyDescriptorV1 {
  version: 1; keyId: string; role: KeyRole;
  profileScope: string; personaScope?: string;
  publicFingerprint: string; epoch: string;
}
interface KeyGrantV1 {
  version: 1; role: KeyRole;
  allowedPurposes: readonly string[];
  expiresAt: string; profileScope: string;
}
interface KeyRoleProvider {
  acquire(grant: KeyGrantV1, ctx: OperationContext):
    ModuleResult<SecretHandle>;
  use<T>(handle: SecretHandle, purpose: string,
    operation: ScopedKeyOperation<T>, ctx: OperationContext):
      Promise<ModuleResult<T>>;
  revoke(handle: SecretHandle): void;
  capability(): CapabilityDescriptorV1;
}
```

`ScopedKeyOperation` is a closed reviewed operation set, not arbitrary plugin code with raw key access. Public results may include signatures or fingerprints; secrets cannot escape in return values, errors, serialization or thenables. Handles bind role, purpose, profile, epoch and deadline and are nonserializable.

## 5. Lifecycle and refusal behavior

1. Load or generate independent role keys through existing vetted primitives; validate public/key consistency.
2. Confirm caller purpose and explicit user action for spending or export-related operations.
3. Capture session epoch, issue a short-lived handle and retain secret bytes only in scoped storage.
4. Immediately before cryptographic use, verify role, purpose, expiry, active profile and operation context.
5. After completion or failure, wipe temporary copies and invalidate single-use authority.
6. Manual/idle/sleep lock revokes all active grants and cancels operations before late results are exposed.
7. Role rotation creates a new epoch. Old ciphertext and payment addresses retain recovery requirements; no automatic movement of funds follows.

In-memory handle revocation is not on-chain revocation. EIP-712/4337/7702 authority, chain nonces and contract policies belong to their respective consumers. A chain reorg cannot restore a revoked local capability; consumers must separately revalidate settlement/nonce state. Unknown outcomes never justify reacquiring spend permission silently.

## 6. Proposed resource and export limits

At most 128 live handles, 16 active profile descriptors and 32 purpose labels per grant. Serialized public descriptors are capped at 8 KiB; unknown roles/purposes refuse. Spend/export-related handles expire within 60 seconds and are single-use; long scans use renewable viewing operations without expanding authority.

No raw-key logging, clipboard export or browser storage is provided by P06. Canonical spec 18 export remains a deliberate separately reviewed flow. Limit one secret-bearing crypto operation per role/profile unless independent scoped concurrency is proved safe. Cancellation deadlines and worker cleanup require measured browser acceptance.

## 7. Privacy and authority matrix

| Party / failure | Authority or exposure | Required treatment |
|---|---|---|
| Viewing delegate | Discovery/linkage of matching payments | Narrow local use; disclose loss of payment-history privacy |
| Invoice signer | Authenticates invoice intent | Cannot spend or prove real-world identity |
| Persona key reuse | Linkage across customer/project scopes | Independent scope and explicit public reuse |
| Active-origin compromise | Possible key use while unlocked | Reduce lifetime; no impossible containment guarantee |
| Export recipient | Persistent bearer-secret authority | Explicit export scope; revocation limits |
| Stale async consumer | Previous user's keys/results | Epoch checks before use and publication |

## 8. Pricing policy

Role isolation, local key generation, locking and revocation remain free security primitives. No feature fee is charged merely for using separate keys. P06 has no fee dependency, recipient or transfer method. Optional products may charge only for their independently defined services; they cannot withhold key recovery or weaken separation for free users.

## 9. Acceptance cases

- **P06-A01:** Generated spend/view/invoice keys are independent and match published existing vectors.
- **P06-A02:** Wrong-role use refuses before crypto operations; view handles never sign/spend.
- **P06-A03:** Handles cannot be JSON-serialized, structured-cloned into persistent storage or returned as secret bytes.
- **P06-A04:** Profile/key replacement invalidates all prior epochs, including operations completing later.
- **P06-A05:** Lock during async signing discards late output and wipes temporary copies.
- **P06-A06:** Purpose/domain substitution and expired grants refuse with secret-free codes.
- **P06-A07:** Local viewing delegation generates no network request or remote key upload.
- **P06-A08:** Rotation preserves old recovery needs and never silently transfers funds.
- **P06-A09:** Published-key identity checks reject mismatches without modifying existing custody.
- **P06-A10:** There is no guardian, publisher master key or default remote recovery path.

## 10. Implementation slices and future verification

Slice 1 maps existing role operations and negative capability fixtures. Slice 2 adds sealed handles and epoch invalidation around session. Slice 3 integrates one viewing and one invoice-signing consumer. Slice 4 independently reviews secret flow, real sleep/restart and documented revocation limits.

Existing scripts for future implementation; **not run here**:

```bash
npm run test -w @ghostpay/core-crypto
npm run test -w @ghostpay/secret-box
npm run typecheck -w @ghostpay/secret-box
npm run lint -w @ghostpay/secret-box
npm run test -w @ghostpay/web
npm run build -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Adapt current session keys to descriptors without deriving replacements or changing addresses. Preserve legacy keystore formats and independent backup paths. Rollback removes the facade only after all consumers return to reviewed role-specific entry points; it cannot serialize handles or weaken guards. Decide domain labels, grant durations and offline viewing-device export separately. Guardian authority remains excluded.
