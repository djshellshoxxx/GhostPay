#!/usr/bin/env bash
set -euo pipefail
runner=apps/web/e2e/native-mobile/runner.mjs
device=$(xcrun simctl list devices available -j | python3 -c '
import json,os,sys
rows=[(tuple(map(int,r.split(".iOS-")[1].split("-"))),d["name"],d["udid"]) for r,devices in json.load(sys.stdin)["devices"].items() if ".iOS-" in r for d in devices if d["name"].startswith(os.environ["DEVICE"])]
if not rows: sys.exit("No installed simulator matches "+os.environ["DEVICE"])
print((min if os.environ["RUNTIME"]=="oldest" else max)(rows)[2])')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl list devices booted
url='{url}'
if [[ "$BROWSER" == fennec ]]; then
  (
    cd _firefox-simulator
    bash ./bootstrap.sh firefox
    xcodebuild -project firefox-ios/Client.xcodeproj -scheme Fennec -destination "id=$device" -derivedDataPath "$RUNNER_TEMP/fennec" -skipMacroValidation -skipPackagePluginValidation CODE_SIGNING_ALLOWED=NO build > "$RUNNER_TEMP/fennec-build.log" || { tail -80 "$RUNNER_TEMP/fennec-build.log"; exit 1; }
  )
  app=$(find "$RUNNER_TEMP/fennec/Build/Products" -name Client.app -print -quit)
  xcrun simctl install "$device" "$app"
  scheme=$(/usr/libexec/PlistBuddy -c 'Print :MozPublicURLScheme' "$app/Info.plist")
  url="$scheme://open-url?url={url}"
fi
node "$runner" apps/web/dist "$BROWSER" xcrun simctl openurl "$device" "$url"
