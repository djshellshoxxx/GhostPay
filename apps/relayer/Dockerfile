# Build from the REPOSITORY ROOT:  docker build -f apps/relayer/Dockerfile -t ghostpay-relayer .
# Contains no secrets. Mount config + secret files read-only and pass their paths via env at run time.
# (Not built in the authoring sandbox: see README "Unverified".)

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/relayer ./apps/relayer
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --ignore-scripts --workspace @ghostpay/relayer --include-workspace-root
RUN npm run build -w @ghostpay/relayer
RUN npm prune --omit=dev --workspace @ghostpay/relayer --include-workspace-root

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /repo/apps/relayer
ENV NODE_ENV=production
COPY --from=build --chown=nonroot:nonroot /repo/node_modules /repo/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/chain-adapters/package.json /repo/packages/chain-adapters/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/chain-adapters/dist /repo/packages/chain-adapters/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/core-crypto/package.json /repo/packages/core-crypto/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/core-crypto/dist /repo/packages/core-crypto/dist
COPY --from=build --chown=nonroot:nonroot /repo/packages/invoice-schema/package.json /repo/packages/invoice-schema/package.json
COPY --from=build --chown=nonroot:nonroot /repo/packages/invoice-schema/dist /repo/packages/invoice-schema/dist
COPY --from=build --chown=nonroot:nonroot /repo/apps/relayer/package.json /repo/apps/relayer/package.json
COPY --from=build --chown=nonroot:nonroot /repo/apps/relayer/dist /repo/apps/relayer/dist
USER nonroot
# NETWORK EXPOSURE: the relayer must sit behind a TLS-terminating reverse proxy and must never be published on a
# public interface. Inside a container the config must use "listen": {"host": "0.0.0.0"} (loopback is unreachable
# from the host), so publish the port on loopback ONLY:
#   docker run -p 127.0.0.1:8787:8787 ...
# and list the proxy network in "trustProxy" (CIDRs). Without it X-Forwarded-For is ignored (rate limits then see
# the proxy address), which is the safe default. The proxy should add per-IP connection and request limits.
EXPOSE 8787
STOPSIGNAL SIGTERM
# distroless has no shell or curl: probe with node itself. Fails on 503 (breaker open/half-open on every chain, or draining).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# RELAYER_CONFIG, DEPLOYMENTS_DIR, RELAYER_KEY_FILE, QUOTE_SECRET_FILE (and optionally QUOTE_SECRET_PREVIOUS_FILE) are
# supplied at run time via read-only mounted files. Secret files must be regular files (no symlinks), mode 600 and
# owned by uid 65532 (nonroot) or root, otherwise startup is refused. Secrets in environment variables are refused
# under NODE_ENV=production (they leak via `docker inspect`) unless ALLOW_SECRET_ENV=1.
# Pin the base images by digest in your build pipeline (the digests are not recorded here because they were not
# resolved in the authoring sandbox).
CMD ["dist/main.js"]
