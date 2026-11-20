# Tor source pin provenance and qualification limits: deploy/tor-static/README.md.
# The base digest is supplied by the hosting kit's generated compose.tor.yml.
ARG BASE_IMAGE=debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad
FROM ${BASE_IMAGE} AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential ca-certificates curl libevent-dev libssl-dev zlib1g-dev pkg-config \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/tor-build
# Verify the complete release archive before extracting or executing its build.
RUN curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --max-time 180 \
      --output tor-source.tar.gz https://dist.torproject.org/tor-0.4.9.17.tar.gz \
 && printf '%s  %s\n' 'ff372c41ee7013557fe5b7acd96c909950b27a7959c59fcb87c02591682fabe2' 'tor-source.tar.gz' | sha256sum --check --status \
 && tar --extract --gzip --file tor-source.tar.gz --strip-components=1 \
 && ./configure --prefix=/usr/local --sysconfdir=/etc --enable-gpl --disable-asciidoc \
 && make -j2 \
 && make install

FROM ${BASE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends libevent-2.1-7t64 libssl3t64 zlib1g passwd \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 tor \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /var/lib/tor --shell /usr/sbin/nologin tor \
 && install -d -o tor -g tor -m 0700 /var/lib/tor
COPY --from=build /usr/local/bin/tor /usr/local/bin/tor
COPY --from=build /usr/local/share/tor /usr/local/share/tor
COPY runtime-check.sh tor-start.sh /usr/local/lib/ghostpay/
# A missing shared library, old version, absent PoW module or non-GPL build fails
# during image construction as well as on every start. No Tor network connection.
RUN /bin/sh /usr/local/lib/ghostpay/tor-start.sh --check-runtime
USER 10001:10001
ENTRYPOINT ["/bin/sh", "/usr/local/lib/ghostpay/tor-start.sh"]
