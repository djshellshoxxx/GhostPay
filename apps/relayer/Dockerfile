# Build from the REPOSITORY ROOT:  docker build -f apps/relayer/Dockerfile -t ghostpay-relayer .
# Contains no secrets. Mount config + secret files read-only and pass their paths via env at run time.
#
# Reproducibility: both base images are pinned by digest (bump deliberately; `docker pull <tag>` prints the new digest),
# dependencies come from `npm ci --ignore-scripts` (exact lockfile, no install scripts).
#
# Run hardened (the state directory is the ONLY writable path; no tmpfs needed, the state journal writes its
# temporary files next to state.json):
#   docker run --read-only --cap-drop ALL --security-opt no-new-privileges \
#     -v ghostpay-relayer-state:/var/lib/ghostpay-relayer \
#     -v /etc/ghostpay-relayer:/etc/ghostpay-relayer:ro ... ghostpay-relayer
# The config's state.file must be /var/lib/ghostpay-relayer/state.json. Run exactly ONE container per state volume.

FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/relayer ./apps/relayer
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --ignore-scripts --workspace @ghostpay/relayer --include-workspace-root
RUN npm run build -w @ghostpay/relayer
RUN npm prune --omit=dev --workspace @ghostpay/relayer --include-workspace-root
# Distroless has no shell: prepare the state directory here and copy it with the runtime uid as owner.
RUN mkdir -p /out/var/lib/ghostpay-relayer && chmod 0700 /out/var/lib/ghostpay-relayer

FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e
WORKDIR /repo/apps/relayer
ENV NODE_ENV=production
COPY --from=build --chown=nonroot:nonroot /repo/node_modules /repo/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/chain-adapters/package.json /repo/packages/chain-adapters/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/chain-adapters/dist /repo/packages/chain-adapters/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/relayer-guard/package.json /repo/packages/relayer-guard/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/relayer-guard/dist /repo/packages/relayer-guard/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/core-crypto/package.json /repo/packages/core-crypto/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/core-crypto/dist /repo/packages/core-crypto/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/invoice-schema/package.json /repo/packages/invoice-schema/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/invoice-schema/dist /repo/packages/invoice-schema/dist
COPY --from=build --chown=nonroot:nonroot /repo/apps/relayer/package.json /repo/apps/relayer/package.json
COPY --from=build --chown=nonroot:nonroot /repo/apps/relayer/dist /repo/apps/relayer/dist
# Writable by the runtime uid (65532); a named volume mounted here inherits this ownership.
COPY --from=build --chown=nonroot:nonroot /out/var/lib/ghostpay-relayer /var/lib/ghostpay-relayer
VOLUME /var/lib/ghostpay-relayer
USER nonroot
EXPOSE 8787
# No curl in distroless: the ops CLI does the probe (GET http://127.0.0.1:8787/healthz, 3 s timeout; exit 0 only for
# HTTP 200 + status ok). Set RELAYER_HEALTH_URL when listen.port is not 8787. `degraded` (breaker open) marks the
# container unhealthy on purpose: alert on it, but do not auto-restart on it (a restart resets nothing useful).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["/nodejs/bin/node", "dist/ops.js", "health"]
# RELAYER_CONFIG, DEPLOYMENTS_DIR, RELAYER_KEY_FILE, QUOTE_SECRET_FILE are supplied at run time.
# Secret files must be mode 600 and owned by uid 65532 (nonroot) or root, otherwise startup is refused.
CMD ["dist/main.js"]
