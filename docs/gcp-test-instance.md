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
| Ephemeral external IPv4 at creation | `136.71.64.19` (may change after stopping/starting) |
| Security | Secure Boot, vTPM, integrity monitoring, OS Login; project SSH keys blocked; interactive serial access disabled |
| Attached service account | None |
| Public ingress firewall rules | None in the isolated VPC |
| Application containers | Not deployed yet |

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

The VM exists and is running. Its disk type/size and Shielded VM settings were verified through the scoped repository CLI. It is listed in `deploy/environments.json` under `gcp-test`; the inventory reader still needs an identity with permission to read the instance.

The game and admin containers have passed build/startup checks in GitHub Actions but are **not installed on this VM**. No game, web or SSH ports were opened publicly, and there is no public application URL. Container rollout, a scoped runtime identity where needed, access rules and TLS are the remaining application deployment steps. The separate Cloud Run release workflow remains disabled.

All provisioning used `scripts/gcloud.cmd`, preserving the required GCP account/project and global CLI configuration.
