# GCP test instance

Created and verified on 2026-10-06 (America/Chicago), after approval to provision an instance estimated at $13/month or less.

[Open the VM in Google Cloud Console](https://console.cloud.google.com/compute/instancesDetail/zones/us-central1-a/instances/shootball-game-test?project=project-7915787f-37b2-4286-aa7)

| Setting | Actual value |
| --- | --- |
| Project | `project-7915787f-37b2-4286-aa7` |
| Name | `shootball-game-test` |
| Instance ID | `4904199764195159422` |
| Zone | `us-central1-a` |
| Verified state | `RUNNING` |
| Machine | `e2-micro`, shared CPU, 1 GiB RAM, standard/on-demand |
| Boot disk | 20 GiB `pd-standard`, verified `READY`, auto-delete with VM |
| OS | Container-Optimized OS, `cos-stable-121-18867-624-2` |
| Network / subnet | `shootball-test` / `shootball-test-us-central1` |
| Internal IPv4 | `10.42.0.2` |
| Reserved external IPv4 | `136.71.64.19`, hostname `136.71.64.19.sslip.io` |
| Security | Secure Boot, vTPM, integrity monitoring, OS Login; project SSH keys blocked; interactive serial access disabled |
| Attached service account | `shootball-game`, repository reader, storage-read-only OAuth scope |
| Public ingress firewall rules | TCP 80/443 to game identity only; no SSH or raw game port |
| Application containers | Non-root game server and Caddy HTTPS proxy deployed |

## Monthly estimate

**Approximately $11/month before tax**, using a full 31-day month (744 hours), no Free Tier discounts, no commitments, and 1 GiB of outbound internet traffic. This is an estimate, not a spending cap.

| Component | Calculation | Estimated USD |
| --- | --- | ---: |
| VM | 744 hours x $0.008376428 | 6.23 |
| Standard disk | 20 GiB x 744 hours x $0.000054795 | 0.82 |
| External IPv4 | 744 hours x $0.005 | 3.72 |
| Light outbound traffic allowance | 1 GiB x up to $0.23/GiB | 0.23 |
| **Total** | Rounded | **11.00** |

Sources checked at provisioning: [Google E2 pricing](https://cloud.google.com/products/compute/pricing/general-purpose), [standard disk pricing](https://cloud.google.com/compute/disks-image-pricing), and [IPv4/data transfer pricing](https://cloud.google.com/vpc/network-pricing). Free Tier eligibility can reduce compute and disk charges; no free allowance is needed for this estimate to stay below $13.

The existing $12 monthly project budget alerts remain enabled. Taxes, traffic beyond the allowance, and other project/account services are not included. No load balancer, Cloud NAT, additional VM, snapshots, paid OS license, or managed database was added. The small shared-core VM is intended for development/test; multiplayer capacity has not been load-tested.

## Current readiness

The VM is running the containerized game behind Caddy with a trusted HTTPS certificate. Its public health endpoint and a real browser guest multiplayer connection have been verified. The independent Cloud Run service hosts the frontend and protected admin API. The admin runtime identity can read this registered VM.

Both `dev` and `main` exist on GitHub. Pushing main automatically builds and releases the game and web/admin images. See [release flow, cost assumptions and verification](gcp-releases.md) and [complete setup rundown](gcp-admin-setup.md). The combined light-traffic estimate, including Cloud Run and registry storage, is approximately $11.75/month before tax.

All provisioning used `scripts/gcloud.cmd`, preserving the required GCP account/project and global CLI configuration.