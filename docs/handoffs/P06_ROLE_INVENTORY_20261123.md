# P06 seller key operation inventory

P06 section 10 starts by mapping existing operations to key roles. The local branch `qualification/p06-existing-role-inventory-20261123` adds a read-only list of export names and negative fixtures. The module uses compile-time references to the original package interfaces. It returns frozen lists of strings.

| Role | Existing exports in the slice | Current private inputs |
| --- | --- | --- |
| view | `core-crypto.checkAnnouncement`, `policy-scheme.checkScheme2Announcement` | Viewing secret. Both operations also take a public spending key. |
| spend | `core-crypto.deriveStealthSecret`, `policy-scheme.deriveScheme2OwnerKey` | Spending and viewing secrets. These derivations are accessible through the current Sweep and policy receive flows. |
| invoice-sign | `invoice-schema.signInvoice`, `invoice-schema.signReceipt` | Seller signing key used by invoice creation and receipt creation. |
| identity-sign, device-auth, service-authorize | Empty inventories | These roles require separately reviewed interfaces. |

The implementation stays outside all production entry points. It carries no keys, callbacks, authorization, fee configuration or protocol domains. Scope is limited to the six named exports in the existing seller flows. Current keystore, public pairing and wallet operations retain their own workflows.

## Evidence

| Item | Result |
| --- | --- |
| Owning spec base | `db5b5cdaf08a08fc11ee3e772f96410ff1da6738`; observed main `e0cb4681e453af77bb10be45ba61b4d19579f41b` |
| Ownership and negative fixture | Claim `01b71de5`; pre-implementation suite `673a3270` failed to import the missing module. |
| Tested implementation | `7e6e745b23469e686ec9992a1dc61291022e7374`, tree `14c7a0df47e9f5b2b8a41addfeceb2603f77bacc` |
| Web Vitest | 8/8 passed, including one fast-check property for 200 unknown role strings at seed 602311. Correct and wrong-role pairs, reserved roles, private export and unrestricted signing are covered. Loading any of the three crypto implementations fails the test. |
| Scoped V8 coverage | 9/9 statements and lines, 4/4 branches and 1/1 functions. |
| Other local gates | Strict TypeScript and typed ESLint on both files passed; secret scan, 111 pinned-action references, 39 Solidity files and Git whitespace checks passed. |

Run from the repository root:

```sh
npm exec -w @ghostpay/web -- vitest run src/lib/keyRoleInventory.test.ts --maxWorkers=1 --coverage --coverage.include=src/lib/keyRoleInventory.ts
```

Host CI, whole-web typecheck and complete full/lean application qualification remain open. Production role domains, handle lifetimes, isolated handles and invalidation remain the decisions and work listed in later P06 slices. This inventory alone cannot supply F11 owner authentication.
