FROM node:22-slim AS whisper_builder

RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential cmake git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v1.7.2 https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp \
  && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
    -DCMAKE_BUILD_TYPE=Release \
    -DGGML_NATIVE=OFF \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON \
    -DWHISPER_BUILD_TESTS=OFF \
  && cmake --build /tmp/whisper.cpp/build --target main -j1 \
  && cp /tmp/whisper.cpp/build/bin/main /usr/local/bin/whisper-cli \
  && chmod +x /usr/local/bin/whisper-cli \
  && rm -rf /tmp/whisper.cpp

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=whisper_builder /usr/local/bin/whisper-cli /usr/local/bin/whisper-cli
RUN mkdir -p /app/tools/whisper && cp /usr/local/bin/whisper-cli /app/tools/whisper/whisper-cli && chmod +x /usr/local/bin/whisper-cli

COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN mkdir -p /app/tools/whisper && cp /usr/local/bin/whisper-cli /app/tools/whisper/whisper-cli && chmod +x /app/tools/whisper/whisper-cli
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
