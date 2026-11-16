# A CI image with the harnesses your ctxray.lock pins, installed once while the image builds. Put this file in your
# project and build it there:
#   docker build -f harnesses.Dockerfile -t registry.example.com/ci/ctxray .
# The harnesses come from your registry under your licences, ctxray's own images never carry them.
FROM ghcr.io/mairwunnx/ctxray:__VERSION__-runtime

# The config says which harnesses, the lockfile which versions. Copy whatever else the config imports, too.
COPY ctxray.config.ts ctxray.lock /opt/ctxray/project/
ENV CTXRAY_CACHE_DIRS=/opt/ctxray/harnesses
RUN cd /opt/ctxray/project && ctxray harness install --frozen
