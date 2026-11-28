#!/usr/bin/env bash
set -euo pipefail
adb reverse tcp:4178 tcp:4178
adb shell getprop ro.build.version.release
adb shell wm size
runner=apps/web/e2e/native-mobile/runner.mjs
if [[ "$BROWSER" == chrome ]]; then
  package=com.android.chrome
  adb shell am set-debug-app --persistent "$package"
  adb shell 'echo "chrome --no-first-run --disable-fre --no-default-browser-check" > /data/local/tmp/chrome-command-line'
else
  package=org.mozilla.firefox
  url="https://archive.mozilla.org/pub/fenix/releases/$FIREFOX_VERSION/android/fenix-$FIREFOX_VERSION-android-x86_64/fenix-$FIREFOX_VERSION.multi.android-x86_64.apk"
  curl --fail --location --retry 2 "$url" -o "$RUNNER_TEMP/fenix.apk"
  echo "$FIREFOX_SHA256  $RUNNER_TEMP/fenix.apk" | sha256sum -c -
  adb install -r "$RUNNER_TEMP/fenix.apk"
fi
adb shell pm path "$package" | grep '^package:'
adb shell dumpsys package "$package" | grep -m1 versionName || true
node "$runner" apps/web/dist "$BROWSER" adb shell am start -W -a android.intent.action.VIEW -d '{url}' -p "$package"
