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
EXPOSE 8787
# RELAYER_CONFIG, DEPLOYMENTS_DIR, RELAYER_KEY_FILE, QUOTE_SECRET_FILE are supplied at run time.
# Secret files must be mode 600 and owned by uid 65532 (nonroot), otherwise startup is refused.
CMD ["dist/main.js"]
