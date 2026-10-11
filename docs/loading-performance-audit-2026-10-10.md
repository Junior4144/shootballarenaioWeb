# Intermittent website loading investigation

Investigated October 10, 2026 (America/Chicago). Read-only production inspection; no infrastructure, application behavior, or billing settings changed.

## Confirmed cause

The public homepage waits for a cold Cloud Run container. The live request path is browser -> Cloudflare -> Vercel reverse proxy -> Cloud Run `shootball-control-test` in `us-central1`. Cloud Run serves both static frontend files and the admin API.

The deployed revision `shootball-control-test-00015-2qg` has minimum instances 0, maximum instances 1, 0.08 vCPU, 256 MiB memory, concurrency 1, first-generation execution, request-based CPU allocation, and startup CPU boost disabled. The release script explicitly reapplies these settings.

Direct correlation on October 10 at 10:17 p.m. CDT (October 11 UTC):

| Event | UTC timestamp |
| --- | --- |
| Homepage request arrives | 03:17:14.762082 |
| Cloud Run starts an instance, reason AUTOSCALING | 03:17:14.774749 |
| Startup probe succeeds | 03:17:24.009280 |
| Node reports listening | 03:17:24.010519 |

That request took **9.343 seconds**. Subsequent homepage requests on the same instance took **40.8, 36.3, and 29.0 milliseconds** at the origin. Another startup at 02:40:59 UTC correlates with a 9.139-second homepage request and readiness at 02:41:08 UTC. This explains the slow-first-visit/fast-repeat behavior.

## Request sample

Cloud Logging query: preceding 24 hours, service `shootball-control-test`, HTTP request entries, limit 5,000. Returned 339 entries, below the cap. These are origin request statistics, including bots and diagnostic requests, not unique visitors or browser paint measurements. CDN hits do not appear here.

| Request group | Count | Median | 95th percentile | Maximum | At least 2 seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Homepage | 121 | 0.086 s | 9.760 s | 11.735 s | 27 |
| JS/CSS assets | 44 | 0.127 s | 0.371 s | 0.449 s | 0 |
| Admin API | 18 | 0.473 s | 3.083 s | 3.083 s | 2 |
| Other paths | 156 | 0.038 s | 9.283 s | 11.937 s | 9 |

No HTTP 5xx responses in this sample. Percentiles use the sorted sample at floor(count * percentile).

## Cache and network checks

- Public HTML: `Cache-Control: no-store`, `x-vercel-cache: MISS`, `cf-cache-status: DYNAMIC`. Every homepage visit can reach the sleeping origin.
- Warm public homepage probe: 0.328 seconds total, including 0.018-second DNS lookup and TLS established by 0.119 seconds. Direct warm Cloud Run probe: 0.175 seconds total. Separate probes, not a controlled measurement of proxy overhead.
- Live JavaScript `/assets/index-83ppuNz8.js`: 1,940,232 bytes decoded, 538,146 bytes transferred with gzip; 0.405 seconds in the probe. Vercel reported HIT. Cloudflare reported EXPIRED on that request and public max-age 14,400 seconds. The source server sets one-hour caching for non-HTML files; edge response policy differs.
- Apex domain redirects once (308) to `https://www.orb-skirmish.com/`. The supplied www URL avoids that redirect.
- Cloudflare is another live proxy layer in front of the repository's documented Vercel -> GCP path. Account-level Cloudflare rules were not inspected.

## Other contributors and boundaries

1. One instance with concurrency 1 serializes origin work. A slow admin request can occupy the same capacity needed by public HTML or a cache-miss asset. The observed admin API maximum was 3.083 seconds. This is a configuration risk; the confirmed 9-second example above is startup delay, not proven admin contention.
2. `apps/web/src/main.ts` eagerly imports Phaser and the arena scene. Visitors must download and evaluate the full approximately 1.94 MB JS bundle before account controls initialize. Lazy-loading gameplay on Play would reduce initial download/evaluation, especially on mobile. It does not explain the proven wait before HTML arrives.
3. Background video is approximately 238 KB and its poster 34 KB locally. The video starts after frontend execution and is not awaited before menu initialization.
4. Signed-in users can wait separately on Supabase session/profile restoration. The frontend uses a 15-second fetch timeout and awaits profile loading. No authenticated user session was tested, so that latency remains unmeasured. Static HTML serving does not query Supabase.
5. Game VM `shootball-game-test` is RUNNING, type e2-micro, last started October 6. Its public health endpoint returned HTTP 200 in 0.529 seconds. The game VM is separate from homepage delivery; this health probe does not measure gameplay performance or VM CPU/memory pressure.

## Recommended remediation

Preferred structural fix: publish the built public frontend as static files on the existing Vercel project, keeping Cloud Run for admin APIs. Update the GitHub Actions release flow to build/deploy matching frontend artifacts and verify release consistency. This removes Cloud Run cold starts and admin request serialization from initial page delivery. Preserve API authorization and private-response no-store behavior.

A smaller interim change is short shared caching for the public HTML only, with stale-while-revalidate and explicit release invalidation/versioning. A first cache miss can still cold-start, and stale HTML must not point to deleted hashed assets. Do not apply this policy to authenticated admin responses.

Cloud Run alternatives: enable startup CPU boost to reduce startup latency, or keep a minimum instance warm to reduce scale-from-zero delays. These have billing implications and require testing; neither should be presented as a guarantee of zero cold starts. If increasing concurrency, raise CPU to at least 1 vCPU: Google requires concurrency 1 below 1 vCPU. Review the committed approximately $12/month project target before changing paid runtime capacity.

Also lazy-load Phaser/gameplay and use long immutable caching for content-hashed assets. Retain shorter or revalidated caching for unversioned files.

Make any Cloud Run change in `scripts/deploy-control-test.ps1` and reconcile `deploy/gcp/test-policy.json`; changing only the live service would be overwritten on the next main release.

## Validation for a fix

- Compare public HTML and time-to-interactive with empty browser cache, warm cache, and after origin idle periods.
- Verify the public frontend still loads while Cloud Run has no running instance if static hosting is implemented.
- Verify signed-out/guest controls, signed-in restoration, admin authorization, and multiplayer entry.
- Confirm new releases never mix cached HTML with unavailable assets.
- Recheck origin latency distribution and actual cost impact after release.

References: [Cloud Run CPU and startup boost](https://docs.cloud.google.com/run/docs/configuring/services/cpu), [minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances), [Vercel cache control](https://vercel.com/docs/caching/cache-control-headers).
