# Dockerfile para CRM Frontend (panel de agentes)
# Multi-stage: build con Node, servir con Nginx

# Etapa 1: Construcción
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
# En Docker, nginx hace proxy de /api y /socket.io al backend (mismo origen)
ENV VITE_API_URL=/api
RUN npm run build

# Etapa 2: Producción con Nginx
FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf /etc/nginx/templates/*.template 2>/dev/null || true

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf.in /etc/nginx/templates/default.conf.in
COPY docker-entrypoint.d/99-api-upstream.sh /docker-entrypoint.d/99-api-upstream.sh
RUN chmod +x /docker-entrypoint.d/99-api-upstream.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
