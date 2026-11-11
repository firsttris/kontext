#!/bin/sh
# Compares the readpst built in the image (docker/Dockerfile, from libpst's sources on Wolfi) with
# Debian's pst-utils on the CI runner, on the Outlook files of the e2e tests (e2e/fixtures.ts):
# the same files with the same content, after taking out what readpst makes new on every run
# (MIME boundaries, DTSTAMP). The flags are those of server/migration/pst.ts.
#
#   docker/check-readpst.sh <container> <pst file>...
set -eu
container=$1
shift
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# readpst writes a random number into each MIME boundary and the export time into each DTSTAMP.
# Attachment names (filename*=utf-8''…, RFC 2231) are compared decoded: since libpst's 2f4b9fd
# ("Encode all the characters that are required by RFC 2231 and RFC 5987", after 0.6.76) the
# image's readpst also encodes ( ) ' as RFC 2231 asks, Debian's 0.6.76 does not; the names are
# the same.
normalize() {
  find "$1" -type f -exec sed -i -E \
    -e 's/boundary-LibPST-iamunique-[0-9]+_-_-/boundary-LibPST/g' \
    -e 's/^DTSTAMP:.*$/DTSTAMP:/' {} +
  find "$1" -type f -exec perl -i -pe "s/%([0-9A-Fa-f]{2})/chr(hex(\$1))/ge if /filename\*=utf-8''/" {} +
}

failed=0
for pst in "$@"; do
  name=$(basename "$pst")
  mkdir -p "$work/debian/$name" "$work/image/$name"
  readpst -q -j 0 -e -8 -cv -o "$work/debian/$name" "$pst"
  # The container is read-only except /tmp: the file goes in and the result comes out through tar
  docker exec -i "$container" sh -c 'rm -rf /tmp/pst && mkdir -p /tmp/pst/out && cat > /tmp/pst/in.pst' < "$pst"
  docker exec "$container" readpst -q -j 0 -e -8 -cv -o /tmp/pst/out /tmp/pst/in.pst
  docker exec "$container" tar -C /tmp/pst/out -cf - . | tar -C "$work/image/$name" -xf -
  docker exec "$container" rm -rf /tmp/pst
  normalize "$work/debian/$name"
  normalize "$work/image/$name"
  count=$(find "$work/image/$name" -type f | wc -l)
  if diff -r "$work/debian/$name" "$work/image/$name" > "$work/diff"; then
    echo "ok     $name: $count files, the same as Debian's readpst"
  else
    failed=1
    echo "DIFFER $name:"
    head -n 60 "$work/diff"
  fi
done
exit $failed
