#!/bin/sh
set -eu
if [ -f /etc/letsencrypt/live/openvroom.com/fullchain.pem ] && [ -f /etc/nginx/sites-available/openvroom ]; then
    echo 'Site already has TLS. Use update-site.sh; do not overwrite its HTTPS configuration.' >&2
    exit 1
fi
release="$(date -u +%Y%m%dT%H%M%SZ)"
root=/var/www/openvroom
destination="$root/releases/$release"
install -d -m 755 "$destination" /var/log/nginx/openvroom
tar -xzf /tmp/openvroom-public.tar.gz -C "$destination" --no-same-owner
find "$destination" -type d -exec chmod 755 {} +
find "$destination" -type f -exec chmod 644 {} +
test -f "$destination/index.html"
test -f "$destination/room/index.html"
if find "$destination" -iname '*.vrm' | grep -q .; then
    echo 'Refusing to publish private avatar files' >&2
    exit 1
fi
ln -s "$destination" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
if [ -f /etc/nginx/sites-available/openvroom ]; then
    cp /etc/nginx/sites-available/openvroom "/etc/nginx/sites-available/openvroom.backup.$release"
fi
install -m 644 /tmp/openvroom.nginx.conf /etc/nginx/sites-available/openvroom
install -m 644 /tmp/openvroom.logrotate /etc/logrotate.d/openvroom
ln -sfn /etc/nginx/sites-available/openvroom /etc/nginx/sites-enabled/openvroom
if [ -L /etc/nginx/sites-enabled/default ]; then unlink /etc/nginx/sites-enabled/default; fi
nginx -t
systemctl enable nginx
systemctl reload nginx
printf 'Activated release: %s\n' "$release"
