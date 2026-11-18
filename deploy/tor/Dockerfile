# Minimal Tor image built from Debian packages. BASE_IMAGE is pinned by digest (tag bookworm-20261104-slim, resolved
# 2026-11-18; deploy/README.md "Pin images"); docker-compose.yml and .env.example pass the same value.
ARG BASE_IMAGE=debian:bookworm-20261104-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
FROM ${BASE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends tor ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/lib/tor && chown -R debian-tor:debian-tor /var/lib/tor && chmod 700 /var/lib/tor
USER debian-tor
ENTRYPOINT ["/usr/bin/tor", "-f", "/etc/tor/torrc"]
