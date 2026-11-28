# Narrow historical adapter recovery

Extend worker `chatgpt-f80482f352bc`'s isolated branch claim to
`packages/chain-adapters/src/deployments{,.test}.ts` and
`packages/chain-adapters/src/rpc{,.test}.ts` before edits.

Independent historical source review found these existing changes absent from
main `706188000c38b3dde5a3a362370a530870aa7587` and C1 #504. Preserve the combined
newer implementations already carried in the larger #372 recovery/privacy stack:

- `2e61af277030d76f765b320b9f3e0e81e1a6cddd`: deployment calendar-date validation
  and existing regressions, from the #250/#271 lineage.
- `1bf1ac709a1147395d2f47dcdc5eab6a5ffc517b`: bounded RPC retries and explicit
  credential/referrer/cache policy, with existing transport regressions. The
  original privacy contribution is `fbda6b132aa3b1bc6bfc3b22b2835f5f8b297cbc` from
  #220; the finite retry contribution is from #250/#271.

Use selective cherry-picks with source attribution to avoid importing unrelated
feature and contract changes. Preserve valid manifests, RPC response parsing,
cancellation, endpoints and normal retries. Include the chain-adapters workspace
in combined tests, typecheck, lint and build. Hosted integration qualification
still applies to the final combined tree.

The original #289 regression has one unused callback argument. Apply the exact
one-line correction already present in recovered commit
`31c34319aeaa9dbc211b8ccc6bdf65fc3e755ea2`; no assertion changes are needed.
