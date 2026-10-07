#!/bin/bash
set -euo pipefail
trap 'echo "Release agent failed at line $LINENO" >&2' ERR
state=/var/lib/shootball
export HOME="$state" DOCKER_CONFIG="$state/docker"
mkdir -p "$DOCKER_CONFIG" "$state/caddy-data" "$state/caddy-config"
release=$(curl --fail --silent --show-error --max-time 10 -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/shootball-release) || exit 0
IFS='|' read -r revision digest hostname public_key extra <<< "$release"
[[ "$revision" =~ ^[a-f0-9]{40}$ && "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$hostname" == '136.71.64.19.sslip.io' && "$public_key" =~ ^sb_publishable_[A-Za-z0-9_-]+$ && -z "$extra" ]]
if [[ -f "$state/current-release" && "$(cat "$state/current-release")" == "$release" ]] && \
   [[ "$(docker inspect -f '{{.State.Running}}' shootball-game 2>/dev/null)" == true ]] && \
   [[ "$(docker inspect -f '{{.State.Running}}:{{.State.Restarting}}' shootball-proxy 2>/dev/null)" == true:false ]] && \
   curl --fail --silent --max-time 5 -H "Host: $hostname" http://127.0.0.1/ >/dev/null; then exit 0; fi
image="us-central1-docker.pkg.dev/project-7915787f-37b2-4286-aa7/shootball-test/game-server@$digest"
proxy='caddy@sha256:834468128c7696cec0ceea6172f7d692daf645ae51983ca76e39da54a97c570d'
docker-credential-gcr configure-docker --registries=us-central1-docker.pkg.dev
docker pull "$image"
docker pull "$proxy"
docker network inspect shootball >/dev/null 2>&1 || docker network create shootball
docker rm -f shootball-candidate >/dev/null 2>&1 || true
docker run -d --name shootball-candidate --network shootball --restart unless-stopped \
  --memory=384m --cpus=0.75 --pids-limit=128 --cap-drop=ALL --security-opt=no-new-privileges \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --log-opt max-size=5m --log-opt max-file=2 \
  -e NODE_OPTIONS=--max-old-space-size=256 -e RELEASE_SHA="$revision" \
  -e SUPABASE_URL=https://lkgxpgcmspxekggndzih.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEY="$public_key" "$image"
healthy=false
for attempt in $(seq 1 40); do
  if docker exec shootball-candidate node -e "fetch('http://127.0.0.1:2567/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then healthy=true; break; fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  docker logs --tail 30 shootball-candidate
  docker rm -f shootball-candidate
  echo 'Candidate failed; existing release preserved' >&2
  exit 1
fi
# In-memory matches end during promotion; the prior image is retained for rollback.
docker rm -f shootball-game-previous >/dev/null 2>&1 || true
if docker inspect shootball-game >/dev/null 2>&1; then
  docker stop --time 30 shootball-game
  docker rename shootball-game shootball-game-previous
fi
docker rename shootball-candidate shootball-game
cat >"$state/Caddyfile" <<'CADDY'
{
  admin off
}
136.71.64.19.sslip.io {
  reverse_proxy shootball-game:2567
}
CADDY
chmod 644 "$state/Caddyfile"
chown -R 1000:1000 "$state/caddy-data" "$state/caddy-config"
docker rm -f shootball-proxy >/dev/null 2>&1 || true
if ! docker run -d --name shootball-proxy --network shootball --restart unless-stopped \
  --user 1000:1000 --memory=96m --cpus=0.25 --pids-limit=64 --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges --log-opt max-size=5m --log-opt max-file=2 \
  -p 80:80 -p 443:443 -v "$state/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$state/caddy-data:/data" -v "$state/caddy-config:/config" "$proxy"; then
  echo 'Proxy failed; release not acknowledged' >&2
  exit 1
fi
sleep 5
if [[ "$(docker inspect -f '{{.State.Running}}:{{.State.Restarting}}' shootball-proxy)" != true:false ]]; then
  docker logs --tail 20 shootball-proxy
  echo 'Proxy exited; release not acknowledged' >&2
  exit 1
fi
printf '%s' "$release" >"$state/current-release"
echo "ShootBall release applied: $revision"
# Remove only unused images on this dedicated game host, after retaining rollback container.
docker image prune -af --filter until=168h
