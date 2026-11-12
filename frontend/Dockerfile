# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Variáveis VITE_* são embutidas no bundle em tempo de build
ARG VITE_API_URL
ARG VITE_TURNSTILE_SITE_KEY
ARG VITE_CADASTRO_PUBLICO=true
ENV VITE_API_URL=$VITE_API_URL \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY \
    VITE_CADASTRO_PUBLICO=$VITE_CADASTRO_PUBLICO
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
# Defaults do template de cabeçalhos (sobrescreva no docker-compose)
ENV API_ORIGIN="" \
    CSP_HEADER_NAME=Content-Security-Policy-Report-Only
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
