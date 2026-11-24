# Mobile browser qualification

Run from the repository root after installing locked dependencies and building the workspace libraries. The suite uses the static Pages build, a signed synthetic deployment, an injected test wallet and a local RPC fixture. Browser profiles are ephemeral.

```sh
./node_modules/.bin/playwright install --with-deps chromium webkit
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web -- --config=playwright.mobile.config.ts
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e -w @ghostpay/web -- --config=playwright.mobile.config.ts
```

| Workflow | Automated evidence | Hardware acceptance |
|---|---|---|
| Wallet and invoice | Create and sign an invoice, open it, connect a synthetic EIP-6963 wallet, verify the transaction it receives and exercise account and transaction changes. | On a supported mobile wallet/browser combination, connect a throwaway account, cancel and reconnect, confirm the return to the invoice and check that cancellation sends nothing. |
| QR and file import | Import a generated signed-invoice raster through the file chooser, review it and explicitly open Pay. Chromium also exercises a virtual camera, permission denial and track cleanup. | Use the system camera and photo picker, deny/regrant permission, scan the displayed invoice and confirm the camera stops. |
| Backup | Tap to download an encrypted seller keystore, select that saved file and verify it against the loaded keys. | Locate the download in Files/Downloads, reopen it through the OS picker and verify the same keys. |
| Touch and navigation | Use touch on Pay, the scanner disclosure, file pickers and backup actions. Check nine routes and the loaded payment review for horizontal overflow and clipped controls. | Repeat in portrait and landscape with the on-screen keyboard, and verify navigation after returning from the wallet. |

The four automated projects run Linux Chromium with Pixel and Galaxy tablet descriptors and Linux WebKit with iPhone and iPad descriptors. They reuse the main-branch Pages fixtures and the explicit WebKit launch setting used by PR #373. No wallet extension, OS picker UI or physical camera is under automation.

For hardware sign-off, use the [physical device matrix](../qr/PHYSICAL_DEVICE_ACCEPTANCE.md) for current and previous iOS Safari, current mid-range and low-end Android Chrome, and tablets. Record app commit, device, OS/browser and wallet versions, case, result and tester. Keep encrypted backups and QR payloads out of attachments.
