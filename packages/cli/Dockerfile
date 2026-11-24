FROM alpine AS base

ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add --no-cache libgcc libstdc++ ripgrep

FROM base AS build-amd64
COPY dist/cli-linux-x64-baseline-musl/bin/aicraft /usr/local/bin/aicraft

FROM base AS build-arm64
COPY dist/cli-linux-arm64-musl/bin/aicraft /usr/local/bin/aicraft

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN ln -s aicraft /usr/local/bin/aicraft2 && aicraft --version && aicraft2 --version
ENTRYPOINT ["opencode"]
