############################
# Builder stage (generic CPU)
############################
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    clang \
    git \
    libomp-dev \
    libgomp1 \
    libcurl4-openssl-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY llama.cpp /build/llama.cpp

WORKDIR /build/llama.cpp

RUN mkdir -p /build/out \
 && rm -rf build \
 && cmake -B build \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF \
      -DGGML_CUDA=OFF \
      -DGGML_METAL=OFF \
      -DGGML_OPENCL=OFF \
      -DGGML_SYCL=OFF \
      -DGGML_VULKAN=OFF \
      -DGGML_OPENMP=ON \
      -DGGML_NATIVE=OFF \
      -DGGML_AVX=ON \
      -DGGML_AVX2=ON \
      -DGGML_FMA=ON \
      -DGGML_F16C=ON \
      -DGGML_CCACHE=OFF \
      -DLLAMA_BUILD_TESTS=OFF \
      -DLLAMA_BUILD_EXAMPLES=OFF \
      -DLLAMA_BUILD_TOOLS=ON \
      -DLLAMA_BUILD_SERVER=ON \
      -DLLAMA_BUILD_SERVER_ONLY=ON \
      -DLLAMA_BUILD_WEBUI=OFF \
      -DCMAKE_C_COMPILER=clang \
      -DCMAKE_CXX_COMPILER=clang++ \
      "-DCMAKE_C_FLAGS=-march=x86-64-v3" \
      "-DCMAKE_CXX_FLAGS=-march=x86-64-v3" \
 && cmake --build build --config Release --target llama-server -j"$(nproc)" \
 && cp build/bin/llama-server /build/out/llama-server

############################
# Runtime stage
############################
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 \
    libgomp1 \
    libomp5 \
    libjemalloc2 \
    curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/out/llama-server /app/llama-server
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
