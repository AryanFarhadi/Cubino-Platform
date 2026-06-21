#!/bin/bash
set -e
ENV=/home/aryan/cubino/.env
grep -v '^NEXT_PUBLIC_' "$ENV" > /tmp/cubino-env || true
cat >> /tmp/cubino-env << 'EOF'
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_WS_URL=
NEXT_PUBLIC_APP_URL=https://cubino.ir
EOF
mv /tmp/cubino-env "$ENV"
cd /home/aryan/cubino
export NEXT_PUBLIC_API_URL=
export NEXT_PUBLIC_WS_URL=
pnpm --filter @cubino/web build
pm2 restart cubino-web cubino-server
pm2 save
echo "Fixed. Testing register..."
curl -s -X POST http://127.0.0.1/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -H 'Host: cubino.ir' \
  -d '{"email":"verify@cubino.ir","username":"verifyuser","password":"password123","displayName":"Verify"}'
