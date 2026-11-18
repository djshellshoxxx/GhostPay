# QR and camera: physical-device acceptance checklist

Status: **PENDING. No physical-device run has been performed.** Every result cell below is `pending` until a person
runs the case on the named hardware and records the evidence (date, app commit, device/OS/browser version, tester,
pass/fail, notes). Automated results do not fill this table:

- Unit tests (jsdom, fake MediaDevices) prove component logic only.
- `apps/web/e2e/qr-camera.spec.ts` drives Chromium's **virtual** camera (`--use-file-for-fake-video-capture` with a
  generated Y4M of clean QR frames). It proves the browser pipeline (getUserMedia → frame grab → local decode → preview →
  track stop) and permission-denied fallback in a real engine. It does not exercise autofocus, exposure, glare, motion,
  low resolution, printed media, or the real permission UI of iOS Safari / Android Chrome.
- The Playwright `pixel-7-chromium`, `iphone-se-chromium`, `ipad-mini-chromium` projects are Chromium viewport/touch
  emulation only; they are not WebKit or real devices.

Release classification while this table is pending: **implementation complete, not device-qualified**.

## How to run a case

1. Serve the exact commit under test over HTTPS (camera APIs need a secure context; `localhost` also counts).
2. Use fixtures from `apps/web/e2e/qr-video.mjs` (render the same texts to a screen or print) or generate live codes in
   the app on a second device.
3. Never use real funds, real seller keys or a real keystore backup. Use a throwaway keystore and test-network invoices.
4. Record evidence in the table; attach screenshots only if they contain no secret QR (red SECRET frames must never be
   photographed — use a throwaway keystore and still crop the code out).

## Environments

| ID | Device / OS | Browser | Camera |
|---|---|---|---|
| E1 | iPhone (current iOS) | Safari | rear |
| E2 | iPhone (previous major iOS) | Safari | rear |
| E3 | Android (current) mid-range | Chrome | rear |
| E4 | Android low-end, ≤ 8 MP camera | Chrome | rear |
| E5 | Desktop Windows/macOS/Linux | Chromium (Chrome/Edge) | USB/integrated webcam |
| E6 | Desktop | Firefox | webcam |
| E7 | macOS | Safari (WebKit) | integrated webcam |
| E8 | iPad / Android tablet | Safari / Chrome | rear and front (switching) |

## Cases

| # | Case | Expected | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | First "Scan with camera" | OS/browser permission prompt appears only after the click; GhostPay explanation visible | pending | pending | pending | pending | pending | pending | pending | pending |
| P2 | Deny permission | Clear denied message; paste and image import still work; no retry loop | pending | pending | pending | pending | pending | pending | pending | pending |
| P3 | Permission previously denied in site settings | Same as P2, message tells user how to re-enable | pending | pending | pending | pending | pending | pending | pending | pending |
| P4 | Camera in use by another app | "Camera in use" message, no crash | pending | pending | pending | pending | pending | pending | pending | pending |
| P5 | Switch camera (multi-camera devices) | Old stream stops (indicator off) before new starts | n/a | n/a | pending | pending | pending | pending | pending | pending |
| L1 | Scan completes | Camera indicator turns off within 1 s | pending | pending | pending | pending | pending | pending | pending | pending |
| L2 | Press Stop / close the disclosure / navigate away | Camera indicator off | pending | pending | pending | pending | pending | pending | pending | pending |
| L3 | Background the tab/app, return | Camera stopped while hidden; new click required | pending | pending | pending | pending | pending | pending | pending | pending |
| L4 | Lock the phone during scan, unlock | Same as L3 | pending | pending | pending | pending | pending | pending | pending | pending |
| S1 | Invoice link QR, screen to screen | Scanned-invoice preview; payment review only after "Open"; no wallet prompt from the scan | pending | pending | pending | pending | pending | pending | pending | pending |
| S2 | Small QR (≈2 cm on screen) | Decodes within 10 s or user can fall back | pending | pending | pending | pending | pending | pending | pending | pending |
| S3 | Dense QR (keystore backup ≈1 KB, version ~22) | Decodes; else multipart option works | pending | pending | pending | pending | pending | pending | pending | pending |
| S4 | Printed invoice (laser, 300 dpi, A4) | Decodes | pending | pending | pending | pending | pending | pending | pending | pending |
| S5 | Poor lighting (≈50 lux) | Decodes or fails gracefully | pending | pending | pending | pending | pending | pending | pending | pending |
| S6 | Glare (screen at angle under lamp) | Decodes or fails gracefully | pending | pending | pending | pending | pending | pending | pending | pending |
| S7 | Dark-mode QR frame | Decodes (light quiet zone kept) | pending | pending | pending | pending | pending | pending | pending | pending |
| M1 | Animated multipart QR (settings/backup) | Progress shows parts received and missing; completes | pending | pending | pending | pending | pending | pending | pending | pending |
| M2 | Multipart with missed frames (cover lens briefly) | Missing list shrinks as parts loop; completes | pending | pending | pending | pending | pending | pending | pending | pending |
| M3 | Multipart, switch to a different transfer mid-scan | "Different transfer" message with Start over; no mixing | pending | pending | pending | pending | pending | pending | pending | pending |
| M4 | Reduced motion enabled on display device | Parts do not auto-advance; manual next/previous works | pending | pending | pending | pending | pending | pending | pending | pending |
| D1 | Settings export on device A → import on device B | Before/after preview; trust-changing sections unchecked; apply changes only chosen sections | pending | pending | pending | pending | pending | pending | pending | pending |
| D2 | Encrypted keystore backup A → B | Requires passphrase on B; wrong passphrase fails with no partial import | pending | pending | pending | pending | pending | pending | pending | pending |
| D3 | Seller public pairing A → B | Untrusted preview; nothing loaded automatically | pending | pending | pending | pending | pending | pending | pending | pending |
| R1 | Seller receipt QR → payer Pay view | Signature-checked; labelled "not proof of payment" | pending | pending | pending | pending | pending | pending | pending | pending |
| I1 | Image-file import (photo of a QR) | Decodes locally; nothing uploaded (verify with devtools network panel where available) | pending | pending | pending | pending | pending | pending | pending | pending |
| A1 | VoiceOver / TalkBack through scan flow | Buttons, status and progress announced | pending | pending | pending | pending | pending | pending | pending | pending |
| A2 | 200 % text size | Scanner controls reflow, no horizontal scroll | pending | pending | pending | pending | pending | pending | pending | pending |

## Evidence log

| Date | Commit | Env | Cases | Result | Tester | Notes |
|---|---|---|---|---|---|---|
| — | — | — | — | No runs yet | — | — |
