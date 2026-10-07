#!/bin/bash
set -euo pipefail
install -d -m 700 /var/lib/shootball
curl --fail --silent --show-error --retry 5 -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/shootball-agent \
  -o /var/lib/shootball/reconcile.sh
chmod 600 /var/lib/shootball/reconcile.sh
cat >/etc/systemd/system/shootball-release.service <<'UNIT'
[Unit]
Description=Apply the requested ShootBall container release
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash /var/lib/shootball/reconcile.sh
TimeoutStartSec=900
StandardOutput=journal+console
StandardError=journal+console
UNIT
cat >/etc/systemd/system/shootball-release.timer <<'UNIT'
[Unit]
Description=Check ShootBall release metadata
[Timer]
OnBootSec=10
OnUnitInactiveSec=30
Unit=shootball-release.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now shootball-release.timer
