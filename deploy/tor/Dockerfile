# Minimal Tor image built from Debian packages. This base digest was rechecked on 2026-11-19;
# docker-compose.yml and .env.example carry the same default. Package installation below still uses apt repositories.
ARG BASE_IMAGE=debian:bookworm-20261104-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
FROM ${BASE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends tor ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/lib/tor && chown -R debian-tor:debian-tor /var/lib/tor && chmod 700 /var/lib/tor
USER debian-tor
ENTRYPOINT ["/usr/bin/tor", "-f", "/etc/tor/torrc"]
