#!/bin/sh
set -eu
release="$(date -u +%Y%m%dT%H%M%SZ)"
root=/var/www/openvroom
destination="$root/releases/$release"
test -L "$root/current"
test ! -e "$destination"
nginx -t
install -d -m 755 "$destination"
tar -xzf /tmp/openvroom-public.tar.gz -C "$destination" --no-same-owner
test -f "$destination/index.html"
test -f "$destination/room/index.html"
if find "$destination" -iname '*.vrm' | grep -q .; then
    echo 'Refusing to publish private avatar files' >&2
    exit 1
fi
find "$destination" -type d -exec chmod 755 {} +
find "$destination" -type f -exec chmod 644 {} +
previous="$(readlink "$root/current")"
ln -s "$destination" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
printf 'Activated: %s\nPrevious: %s\n' "$destination" "$previous"
