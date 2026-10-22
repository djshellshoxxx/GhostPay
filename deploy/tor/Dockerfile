# Minimal Tor image built from Debian packages. Pin BASE_IMAGE by digest for reproducibility (see .env.example).
ARG BASE_IMAGE=debian:bookworm-slim
FROM ${BASE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends tor ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/lib/tor && chown -R debian-tor:debian-tor /var/lib/tor && chmod 700 /var/lib/tor
USER debian-tor
ENTRYPOINT ["/usr/bin/tor", "-f", "/etc/tor/torrc"]
