# ================================================================
#  ĐỐI CHIẾU KÍCH THƯỚC:
#  Dockerfile cũ  →  ~3.38 GB  (playwright full image + devDeps + .ts)
#  Dockerfile này →  ~700 MB   (node slim + Chromium only + prod deps + .js)
#
#  3 tối ưu chính:
#  1. Biên dịch TypeScript → chạy bằng node thuần (bỏ ts-node, typescript)
#  2. Chỉ cài Chromium (không Firefox, không WebKit)
#  3. Chỉ copy production node_modules (bỏ @types/*, devDependencies)
# ================================================================

# ── Stage 1: BUILD ─────────────────────────────────────────────
#    Biên dịch .ts → .js, patch script trong package.json
# ───────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./

# Cài đủ cả devDeps để biên dịch được (ts-node, typescript, @types/*)
RUN npm ci

COPY src ./src

# Biên dịch TypeScript
RUN npm run build

# Patch package.json: thay "ts-node src/X.ts" → "node dist/X.js"
# để image cuối không cần ts-node
COPY patch-scripts.js ./
RUN node patch-scripts.js

# ── Stage 2: PROD DEPS ─────────────────────────────────────────
#    Chỉ cài production dependencies (không @types, không ts-node)
# ───────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS prod-deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
    && npm cache clean --force

# ── Stage 3: RUNNER ────────────────────────────────────────────
#    Image cuối cùng: node slim + Chromium only + dist/ + prod deps
# ───────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Ho_Chi_Minh \
    # Playwright chỉ dùng Chromium
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

# Cài system libs cần thiết cho Chromium (không cần cài browser khác)
RUN apt-get update && apt-get install -y --no-install-recommends \
        tzdata ca-certificates \
        # Chromium system dependencies
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
        libcairo2 libatspi2.0-0 libwayland-client0 \
    && ln -fs /usr/share/zoneinfo/Asia/Ho_Chi_Minh /etc/localtime \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Lấy production node_modules từ stage prod-deps
COPY --from=prod-deps /app/node_modules ./node_modules

# Chỉ cài CHROMIUM (bỏ Firefox + WebKit → tiết kiệm ~1.5 GB)
RUN node node_modules/.bin/playwright install chromium \
    && rm -rf /tmp/* /root/.npm

# Lấy code đã biên dịch và package.json đã patch từ stage builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Tạo thư mục data/logs (được mount volume ra ngoài)
RUN mkdir -p data/vehicles logs

# Biến môi trường mặc định
ENV WORKERS=3 \
    MAX_RETRIES=3 \
    REQUEST_DELAY=1500 \
    PAGE_TIMEOUT=30000 \
    HEADLESS=true

LABEL org.opencontainers.image.title="oto-crawler" \
      org.opencontainers.image.description="Web Crawler oto.com.vn - Ô TÔ CŨ (Multi-Worker + Crash Recovery)" \
      org.opencontainers.image.source="https://github.com/dvnam1401/crawl_dataset_usedCar"

ENTRYPOINT ["npm", "run"]
CMD ["--help"]
