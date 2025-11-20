# syntax=docker/dockerfile:1
# Angular CLI 20 requires Node >=20.19 or >=22.12, so default to the current Active LTS.
ARG NODE_VERSION=22.12.0
ARG NGINX_VERSION=1.27.2

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
ENV NG_CLI_ANALYTICS=false
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:${NGINX_VERSION}-alpine AS production
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/www /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
