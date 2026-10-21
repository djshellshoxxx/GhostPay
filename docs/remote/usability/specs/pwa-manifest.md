# Spec: pwa-manifest (generator + validator)

## Requirements
- Generate a manifest from options; refuse (return issues) if invalid. Defaults: standalone, `/` start/scope/id, lang `en`, dir `auto`.
- Validator takes `unknown`, never throws, returns `{severity,path,code}`.
- start_url/scope/id/icon src/shortcut url: path-absolute same-origin only; reject schemes, `//`, backslash, fragments, control/space chars, `.`/`..`/encoded traversal, secret-looking queries. start_url and shortcuts inside scope on a segment boundary.
- Colors `#rgb|#rrggbb`; name <=45; short_name <=12; display enum; lang BCP47-lite; dir enum.
- Icons: png/webp/svg with matching MIME, square sizes, purposes any|maskable|monochrome; required PNG >=192 and >=512 `any`; warn without maskable.
- Privacy: error on `share_target`, `related_applications`, `protocol_handlers`, `file_handlers`, `url_handlers`, `launch_handler`, `edge_side_panel`; warn on unknown members.
- `discreetIdentity` option: neutral home-screen name, description dropped.

## Acceptance tests (manifest.test.ts): 22 cases incl. 12 start_url parametrised, scope boundary (`/apple` vs `/app`), icon and shortcut matrices.
