# CI/CD execution path

Updated October 7, 2026.

## Triggers

- Pull requests run **Validate and build containers** once. Feature/dev pushes without a PR do not start another copy; validation can also be dispatched manually.
- A main push runs **Deploy main to GCP**, which calls that same validation/container workflow.
- When GCP_DEPLOY_ENABLED is true, the main caller publishes tested images and deploys automatically. When disabled, main still validates but does not publish or deploy.
- Main releases serialize and never cancel an in-progress rollout. New PR runs cancel superseded validation runs.

## Tests, images and deployment

1. Install dependencies and run all unit/API/game tests once.
2. Run release-script regression tests and admin Chromium acceptance tests once.
3. Build game-server and control-plane images in parallel. Their existing build commands type-check and build all four applications, so a separate host build/typecheck pass is unnecessary.
4. Start each exact image as its non-root runtime user. Verify health, release identity, static pages and authentication boundaries. Container failures block publication.
5. For an enabled main release, obtain short-lived GCP credentials and push those same local images. There is no second image build. CI uses the real public frontend configuration for this build; PR builds use fixtures.
6. Record published image digests and the commit in separate artifacts. Validate both manifests against the expected commit, repository and image identities before returning the digests to the caller.
7. The existing scoped PowerShell scripts deploy the game digest, verify its public release, then deploy the web/admin digest.
8. Verify Vercel (primary), the direct Cloud Run origin and the game revision. Both web URLs must stabilize on the intended commit, serve the site/admin pages and reject anonymous protected reads. A real guest multiplayer connection must receive authoritative state.

BuildKit layer caches now apply to release builds as well as PR builds. Both Dockerfiles install workspace dependencies from package manifests before copying source, preserving npm-ci layers across source-only changes. Artifact overwrites support rerunning the same workflow.

## Redundancy removed per main push

| Work | Before | After |
| --- | --- | --- |
| Independent validation pipelines | 2 | 1 |
| Unit suite executions | 2 | 1 |
| Admin API suite executions | 4 | 1 |
| Admin browser suite executions | 2 | 1 |
| Builds of each container image | 2 | 1 |
| Container smoke checks gating deployment | No | Yes, on the image that is published |

Separate PR and main validation is deliberate: PRs test the proposed merge, and main tests the actual release commit with production build inputs.

## Trust and URL scope

The release entry point remains .github/workflows/deploy-test.yml. Existing GCP trust pins workflow_ref to that caller, so no IAM/WIF changes are required by this refactor. GitHub's [reusable-workflow OIDC documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows) distinguishes caller claims from job_workflow_ref for the called workflow.

- Primary: https://shootball-arena.vercel.app
- Direct origin: https://shootball-control-test-730016272076.us-central1.run.app
- Gameplay: wss://136.71.64.19.sslip.io

Normal application releases update the GCP origin and automatically appear through Vercel. Vercel proxy configuration changes still use the dedicated proxy deployment script; no redundant Vercel application build was added.

## Verification and remaining boundaries

Locally checked with actionlint 1.7.7, Bash syntax validation and five release-script tests covering release gates, digest identity, revision convergence, both URLs and authentication failures. Docker is not installed in this workstation, so image execution and the complete release must be confirmed by the next GitHub run. GitHub CLI is not authenticated here; live repository variables, protection rules and recent run results were not independently inspected.

This change does not add automatic database migrations, positive hosted admin sign-in tests or automatic rollback of the combined game/web release. Those remain separate work. Existing game candidate checks and manual rollback behavior are preserved. No application deployment was triggered by this local edit.
