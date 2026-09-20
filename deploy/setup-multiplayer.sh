#!/bin/sh
set -eu
# Run on the VPS after extracting the server-only deployment archive.
cd /opt/openvroom
if [ ! -f .env ]; then
  umask 077
  secret="$(openssl rand -hex 32)"
  printf 'TURN_SECRET=%s\nTURN_HOST=openvroom.com\nALLOWED_ORIGINS=https://openvroom.com,null,file://\nRELAY_ONLY=0\n' "$secret" > .env
fi
if grep -q '^ALLOWED_ORIGINS=https://openvroom.com,null$' .env; then
  sed -i 's|^ALLOWED_ORIGINS=https://openvroom.com,null$|ALLOWED_ORIGINS=https://openvroom.com,null,file://|' .env
fi
# Keep the existing secret across updates. Never echo it or copy it to a client.
secret="$(sed -n 's/^TURN_SECRET=//p' .env)"
test -n "$secret"
umask 077
public_address="$(ip -4 route get 1.1.1.1 | awk '{ for (i=1;i<=NF;i++) if ($i=="src") print $(i+1) }' | head -1)"
test -n "$public_address"
cat > turnserver.local.conf <<EOF
listening-ip=$public_address
relay-ip=$public_address
listening-port=3478
min-port=49160
max-port=50159
fingerprint
use-auth-secret
static-auth-secret=$secret
realm=openvroom.com
server-name=openvroom.com
no-cli
no-tls
no-dtls
no-multicast-peers
no-loopback-peers
no-tcp-relay
stale-nonce=600
user-quota=64
total-quota=480
max-bps=1000000
bps-capacity=20000000
no-software-attribute
no-stun-backward-compatibility
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=ff00::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
log-file=/dev/null
simple-log
pidfile=/tmp/turnserver.pid
no-stdout-log
EOF
# The container's non-root coturn user needs read access through the bind mount.
# The parent directory stays root-only, so host users cannot read this secret.
chmod 700 /opt/openvroom
chmod 644 turnserver.local.conf
docker compose up -d --build
docker compose restart turn
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/openvroom')
s = p.read_text()
if 'location = /room/signal' not in s:
    p.with_name('openvroom.before-multiplayer').write_text(s)
    s = s.replace('    location = /room {', '''    location = /room/signal {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
        proxy_buffering off;
        access_log off;
    }

    location = /room {''')
    s = s.replace("connect-src 'self' blob:;", "connect-src 'self' blob: wss://openvroom.com;")
s = s.replace('microphone=()', 'microphone=(self)')
if "media-src 'self' blob:;" not in s:
    s = s.replace("worker-src 'self' blob:;", "media-src 'self' blob:; worker-src 'self' blob:;")
p.write_text(s)
PY
nginx -t
systemctl reload nginx
curl --retry 10 --retry-connrefused --retry-delay 1 --fail --silent http://127.0.0.1:8080/health
printf '\nMultiplayer services deployed.\n'
