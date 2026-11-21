# Native contextual-help repair

Product source `59fb5f0d2a8f28b8572fe19a9e7f7ca5039705db`, tree `d0b20f3af2f19e4229c94f82c0ef86535822deee`, based on public #373 `22569e2a83e3f8bc3c86982f69bbb1d90ca8356c`.

The hosted WebKit hover-only case lost a button click when immediate hover dismissal moved the in-flow control. The fix still hides the original tooltip immediately; an aria-hidden, invisible copy of public help text temporarily reserves the same responsive flow geometry. Outside activation, cancellation, keyboard input or idle resize releases the space; effect cleanup removes listeners/timers. No inline style or CSP relaxation is added. Firefox geometry now compares document positions across focus/hover scrolling; the greater-than and exact activation assertions remain.

Existing unit tests: 8 passed, no failures/skips; scoped ESLint and serialized full web TypeScript passed. Initial wrong-bin-path attempts exited127; two earlier typechecks ended137 during concurrent heavy work. Those logs remain failed attempts. No local native-browser pass or final aggregate build/coverage is claimed. Shared modules were read only.

Independent source review and real hosted native rerun are required before qualification. Root and the native harness worker have nonoverlapping paths; the coordinator may combine the frozen sources in an isolated candidate. Main, parent refs and the held integration lease remain untouched. No deployment, release or funds action occurred.
