# --- Build: cần devDependencies (vite, typescript, …) ---
FROM node:22-alpine AS builder

WORKDIR /app

# Convex URL của deployment production — bắt buộc tại bước build vì app dùng import.meta.env.VITE_CONVEX_URL
# (Vite embed giá trị vào bundle; không set sẽ thiếu URL khi chạy trong container)
ARG VITE_CONVEX_URL
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}

ARG VITE_CDRAGON_PATCH
ENV VITE_CDRAGON_PATCH=${VITE_CDRAGON_PATCH}
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime: chỉ cần Node + thư mục .output (Nitro node-server đã bundle) ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
