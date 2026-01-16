#!/bin/sh
set -e

PUID=${PUID:-1001}
PGID=${PGID:-1001}

echo "Starting with UID: $PUID, GID: $PGID"

# Update group ID if different
if [ "$(id -g nextjs)" != "$PGID" ]; then
    delgroup nextjs 2>/dev/null || true
    addgroup -g "$PGID" nextjs
fi

# Update user ID if different
if [ "$(id -u nextjs)" != "$PUID" ]; then
    deluser nextjs 2>/dev/null || true
    adduser -u "$PUID" -G nextjs -s /bin/sh -D nextjs
fi

# Fix ownership of app directories
chown -R nextjs:nextjs /app/prisma/data /app/downloads /app/ffmpeg 2>/dev/null || true

# Run as nextjs user
exec su-exec nextjs "$@"
