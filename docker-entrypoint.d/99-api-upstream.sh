#!/bin/sh
set -e
# 1) API_UPSTREAM explÃ­cito (ej. api-backend:3001 desde compose raÃ­z)
# 2) Si no: host.docker.internal + HOST_API_PORT (mismo nÃºmero que PORT del API en npm run dev)
# 3) Si no: api-backend:3001
if [ -n "$API_UPSTREAM" ]; then
  UP="$API_UPSTREAM"
elif [ -n "$HOST_API_PORT" ]; then
  UP="host.docker.internal:${HOST_API_PORT}"
else
  UP="api-backend:3001"
fi
sed "s|__API_UPSTREAM__|${UP}|g" /etc/nginx/templates/default.conf.in > /etc/nginx/conf.d/default.conf
