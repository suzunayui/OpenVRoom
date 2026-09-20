#!/bin/sh
set -eu
config=/etc/nginx/sites-available/openvroom
cp "$config" "$config.before-short-invites"
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/openvroom')
s = p.read_text().replace('strict-origin-when-cross-origin', 'no-referrer')
if '# Short invite routes' not in s:
    marker = '    location /room/ {'
    if marker not in s:
        raise SystemExit('Room location not found; configuration was not changed')
    s = s.replace(marker, '''    # Short invite routes: never log invitation codes.
    location ~ "^/room/(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{32})/?$" {
        access_log off;
        expires -1;
        try_files /room/index.html =404;
    }
''' + marker)
p.write_text(s)
PY
if ! nginx -t; then
    cp "$config.before-short-invites" "$config"
    exit 1
fi
systemctl reload nginx
