#!/bin/bash
set -euo pipefail
umask 077
cd /srv/timeclock
exec 9>/run/timeclock-backup.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
output="/srv/timeclock/backups/timeclock-${stamp}.dump.age"
recipient=$(</srv/timeclock/secrets/backup-recipient.txt)
docker compose exec -T database pg_dump -U timeclock -d timeclock --format=custom | age -r "$recipient" -o "${output}.partial"
mv "${output}.partial" "$output"
chmod 640 "$output"
chgrp timeclock-backup "$output"
ln -sfn "$(basename "$output")" /srv/timeclock/backups/latest.dump.age
echo "Encrypted TimeClock backup ready: timeclock-${stamp}.dump.age"
