# GhostPay compatibility lab

Start with P0 in the dated target matrix. The queue expands by browser product, OS, hardware and version. A queue entry represents a test to attempt. A pass belongs to one build, environment, browser version and set of cases.

## Start a desktop or device check

The downloadable ZIP includes a lean GhostPay snapshot. Extract the entire ZIP. In a terminal inside its folder run the following command using Python 3.9 or later (on Windows, `py -3 serve.py` also works).

```sh
python3 serve.py
```

Open **http://127.0.0.1:4173/qa/** in the browser under test. In a fresh English profile, expand **Record a hardware or VM run** and enter the matrix target ID, hardware, OS build/architecture/patch, browser product and exact About version. Run the checks and download the JSON. The page keeps results on the device. A blocked app can still be recorded manually in the run log. Use the **Open GhostPay full screen** link for operational cases. Record the device model from Settings, never its serial number or personal identifiers.

For several devices, run the server on a lab computer. Supply a certificate and key for its lab hostname or IP, trusted by each test device. Open the same HTTPS hostname on the device. An untrusted certificate or a plain HTTP LAN address changes secure-context behavior. Do not place the key in the test bundle. On Android with USB debugging already authorized, `adb reverse tcp:4173 tcp:4173` is an alternative for the connected device; open the loopback URL above on Android.

```sh
python3 serve.py --bind 0.0.0.0 --port 8443 --cert lab-cert.pem --key lab-key.pem
```

## Build a different GhostPay revision

From a clean GhostPay checkout with Node 22+, use the locked dependencies. Example for Bash:

```sh
npm ci --ignore-scripts
npm run build:libs
GP_COMMIT="$(git rev-parse HEAD)" GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web
python3 tools/device-compatibility/serve.py --build apps/web/dist --revision "$(git rev-parse HEAD)"
```

In the ZIP use the local path to serve.py. The app is served at the origin root. Each result identifies both the source commit and the digest of the served files. The lab limits connections to the local fixture origin. Camera, top-level browser integrations, network-dependent flows, offline/PWA caching, production deployment and payments require their own evidence.

## Native desktop automation

Start on Windows 11 x64 and Windows 10 22H2 x64, then repeat on an actual 32-bit Windows 10 guest. Use a separate snapshot for each installed browser version; the browser can auto-update. Record the OS architecture separately from the browser process architecture. Match the first three version components of the Edge driver and Edge binary. Use exact vendor builds from an approved archive. Windows Server 2012 and 2012 R2 have their own Edge 109 lanes. The Python controller can run on a modern machine for manual legacy testing.

```powershell
py -3 native.py --browser edge --driver C:\Lab\Edge158\msedgedriver.exe --binary "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --expect-major 158 --output results\win10-x64-edge158.json
```

Repeat inside the separate 157 and 156 images with the corresponding driver path, expected major and a fresh result filename. Modern 64-bit installers can reside under Program Files (x86); read About and OS information for confirmation. Version mismatches return a nonzero exit. For Chrome and Firefox use chromedriver/geckodriver. For macOS Safari, enable **Allow Remote Automation** in Safari developer settings and use the installed safaridriver. Brave and Opera use the actual installed browser and the on-device QA page; record their vendor product version independently from Chromium.

```sh
python3 native.py --browser safari --output results/mac-safari.json
python3 native.py --browser chrome --output results/desktop-chrome.json
python3 native.py --browser firefox --output results/desktop-firefox.json
```

## Desktop-engine and viewport automation

Install Python Playwright in a disposable virtual environment. The included local evidence records the observed browser versions. Use its documented engine binaries or supply a compatible executable. The automated controller starts its own loopback server, creates fresh profiles and writes one file per attempt.

```sh
python3 -m pip install playwright==1.62.0
python3 -m playwright install chromium firefox webkit
python3 run.py --engine chromium --sizes all --output results/chromium.json
python3 run.py --engine firefox --sizes all --output results/firefox.json
python3 run.py --engine webkit --sizes all --output results/webkit.json
```

A phone, tablet, foldable or TV size in this runner changes the viewport. It does not supply a device OS, touch, TV remote, camera, biometric prompt, retail browser shell or native wallet. The remote-control checks and permission prompts belong on real devices. The native workflow uses hosted Windows Server and macOS VMs, and records the actual browser and platform negotiated by WebDriver.

## Matrix and results

Run `python3 matrix/generate.py` to recreate `matrix/targets.csv`. The supplied matrix is a November 28, 2026 snapshot. P0 covers popular platforms and default browsers first. P1 extends to common alternates, earlier releases, and the requested Windows x86. P2 adds long-tail hardware, OEM builds, emulators, extra browser builds and TVs. P3 is archival or unavailable. Priorities are a lab scheduling judgment based on worldwide usage, independent of GhostPay telemetry.

Start with the latest eligible build in a row. Resolve store-relative versions per OS, product, country and channel. Record the full version, store country and whether a signed retained image exists. Use “Blocked — build unavailable” when a device cannot install the historical version. For a product receiving updates on several branches, add the exact branch and patch to the catalog; the generator assigns stable IDs. Never infer security maintenance from a major number or a successful launch. Record OEM patch date on Android, servicing/ESU state on Windows and the Apple security release date per OS branch. Avoid downgrading a personal device.

Use `cases.csv` for functional acceptance and `runs.csv` as an append-only case log. Track pass/fail per case, blocked for missing hardware/build/permissions, N/A for unavailable combinations, and not run for pending work. A full-device pass requires applicable cases on the same model, build and product. Smoke passing alone qualifies only the checks listed in its JSON. Use disposable fixtures and the existing mocked-wallet tests. Preserve only outcome codes or sanitized references, never backup contents, invoice payloads, keys or wallet addresses.

Existing GhostPay tests include mobile issuance and payment review, browser capabilities, restored identity, QR and download behavior. After installing the matching repo browsers and building the workspace libraries, execute these separately for the payment/recovery suite:

```sh
./node_modules/.bin/playwright install --with-deps chromium webkit
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web -- --config=playwright.mobile.config.ts
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run test:e2e -w @ghostpay/web -- --config=playwright.mobile.config.ts
```

See docs/handoffs/MOBILE_BROWSER_QUALIFICATION.md and docs/qr/PHYSICAL_DEVICE_ACCEPTANCE.md in the matching GhostPay checkout. The app's own validators and payment gates remain in force.
