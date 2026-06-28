#!/bin/sh
set -e

API="${API_PROXY_TARGET:-https://backend.internal.livelywave-96d95de9.eastus.azurecontainerapps.io}"
PRESENTON="${PRESENTON_PROXY_TARGET:-https://presenton.internal.livelywave-96d95de9.eastus.azurecontainerapps.io}"

# Extract hostname for Host header (strips scheme and path)
API_HOST=$(echo "$API" | sed 's|^http[s]*://||' | cut -d'/' -f1 | cut -d':' -f1)
PRESENTON_HOST=$(echo "$PRESENTON" | sed 's|^http[s]*://||' | cut -d'/' -f1 | cut -d':' -f1)

sed \
  -e "s|__API_PROXY_TARGET__|${API}|g" \
  -e "s|__API_HOST__|${API_HOST}|g" \
  -e "s|__PRESENTON_PROXY_TARGET__|${PRESENTON}|g" \
  -e "s|__PRESENTON_HOST__|${PRESENTON_HOST}|g" \
  /etc/nginx/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
