# GhostPay web bundle image. Build context = REPOSITORY ROOT:
#   docker build -f infra/web/Dockerfile -t ghostpay-web --build-arg SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) .
# Serves apps/web/dist on :8080 (plain HTTP, no TLS) with the security headers; put infra/proxy (TLS, HSTS) in front.
# UNVERIFIED: not built in the authoring sandbox. OWNER: pin both base images by digest (FROM image@sha256:...)
# after resolving them yourself; tags are mutable and are NOT a supply-chain control.
# Reproducibility: dist is a pure function of the lockfile + sources; compare `find dist -type f | sort | xargs sha256sum`
# against scripts/release-build.sh output. The authoritative release artefact is the tarball from release.yml, not this image.

FROM node:22-bookworm-slim AS build
ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH} TZ=UTC LC_ALL=C CI=1
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
# --ignore-scripts: no dependency lifecycle code runs in the build.
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npm run build:libs \
 && npm run build -w apps/web
# Fail the image build if any source map or manifest slipped into dist (the postbuild scan also checks this).
RUN ! find apps/web/dist -name '*.map' | grep -q .

FROM caddy:2-alpine AS serve
COPY infra/web/Caddyfile.static /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv/ghostpay
USER 65532:65532
EXPOSE 8080
# caddy needs a writable data dir even with auto_https off.
ENV XDG_DATA_HOME=/tmp/caddy-data XDG_CONFIG_HOME=/tmp/caddy-config
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
