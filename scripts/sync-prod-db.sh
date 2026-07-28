#!/usr/bin/env bash
# Refresh the local MongoDB from production, read-only on the VPS side.
#
#   bash scripts/sync-prod-db.sh            core data + 200 most recent games (~50 MB)
#   bash scripts/sync-prod-db.sh --core      core data only, no games (~9 MB)
#   bash scripts/sync-prod-db.sh --games 500 core data + N most recent games
#
# The Game collection holds gzipped replay blobs and is ~1.5 GB in production, which is why
# it is sampled instead of copied whole. Everything else together is under 10 MB.

set -euo pipefail

VPS_HOST="root@82.165.93.135"
VPS_KEY="$HOME/.ssh/naruto_vps"
VPS_PORT=27018
DB="naruto-mythos-tcg"
CONTAINER="naruto-mythos-mongo"
GAMES=200
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export MSYS_NO_PATHCONV=1

while [ $# -gt 0 ]; do
  case "$1" in
    --core) GAMES=0; shift ;;
    --games) GAMES="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

ssh_vps() { ssh -i "$VPS_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$VPS_HOST" "$@"; }

echo "==> checking the local container"
docker start "$CONTAINER" >/dev/null 2>&1 || true
docker exec "$CONTAINER" mongosh --quiet --eval 'rs.status().ok' >/dev/null

echo "==> local safety backup"
docker exec "$CONTAINER" mongodump --quiet --db "$DB" --gzip --archive=/tmp/local-before.gz
docker cp "$CONTAINER:/tmp/local-before.gz" "$WORK/local-before.gz"
echo "    saved to $WORK/local-before.gz (kept until this script exits)"

echo "==> dumping production (excluding Game)"
ssh_vps "nice -n 19 ionice -c3 mongodump --quiet --port $VPS_PORT --db $DB --excludeCollection=Game --gzip --archive=/root/prod-core.gz"
scp -q -i "$VPS_KEY" "$VPS_HOST:/root/prod-core.gz" "$WORK/prod-core.gz"

if [ "$GAMES" -gt 0 ]; then
  echo "==> sampling the $GAMES most recent games"
  ssh_vps "mongosh --quiet --port $VPS_PORT $DB --eval 'db.GameSample.drop(); db.Game.aggregate([{\$sort:{completedAt:-1}},{\$limit:$GAMES},{\$out:\"GameSample\"}],{allowDiskUse:true})'"
  ssh_vps "nice -n 19 ionice -c3 mongodump --quiet --port $VPS_PORT --db $DB --collection GameSample --gzip --archive=/root/prod-games.gz"
  scp -q -i "$VPS_KEY" "$VPS_HOST:/root/prod-games.gz" "$WORK/prod-games.gz"
  ssh_vps "mongosh --quiet --port $VPS_PORT $DB --eval 'db.GameSample.drop()' >/dev/null; rm -f /root/prod-games.gz"
fi
ssh_vps "rm -f /root/prod-core.gz"

echo "==> restoring locally"
docker cp "$WORK/prod-core.gz" "$CONTAINER:/tmp/prod-core.gz"
docker exec "$CONTAINER" mongorestore --quiet --drop --gzip --archive=/tmp/prod-core.gz
if [ "$GAMES" -gt 0 ]; then
  docker cp "$WORK/prod-games.gz" "$CONTAINER:/tmp/prod-games.gz"
  docker exec "$CONTAINER" mongorestore --quiet --drop --gzip --archive=/tmp/prod-games.gz \
    --nsFrom="$DB.GameSample" --nsTo="$DB.Game"
fi
docker exec "$CONTAINER" bash -lc 'rm -f /tmp/prod-core.gz /tmp/prod-games.gz /tmp/local-before.gz'

echo "==> dropping collections production no longer has"
docker exec "$CONTAINER" mongosh --quiet "$DB" --eval '
const stale = db.getCollectionNames().filter((n) => n.startsWith("Topdeck") || n === "GameSample");
stale.forEach((n) => { db[n].drop(); print("    dropped " + n); });
print("    collections: " + db.getCollectionNames().length);
print("    users: " + db.User.countDocuments({}) + " | decks: " + db.Deck.countDocuments({}) + " | games: " + db.Game.countDocuments({}));
'

echo "==> done. Restart the dev server to pick it up."
