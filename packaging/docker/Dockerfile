# ctxray's images, built from the release's Linux binaries: the context holds amd64/ctxray and arm64/ctxray
# (scripts/release.ts lays them out in dist/release/docker).
#   ghcr.io/mairwunnx/ctxray:<version>          the binary alone, for L1–L3 and `ctxray inspect`
#   ghcr.io/mairwunnx/ctxray:<version>-runtime  plus git and Node for the harnesses of L4 and up, without the
#                                               harnesses themselves: harnesses.Dockerfile adds the ones you pin

FROM gcr.io/distroless/cc-debian13 AS slim
ARG TARGETARCH
COPY --chmod=755 ${TARGETARCH}/ctxray /usr/local/bin/ctxray
WORKDIR /work
ENTRYPOINT ["ctxray"]

FROM node:24-trixie-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
ARG TARGETARCH
COPY --chmod=755 ${TARGETARCH}/ctxray /usr/local/bin/ctxray
WORKDIR /work
ENTRYPOINT ["ctxray"]
