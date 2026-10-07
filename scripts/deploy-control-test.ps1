param([Parameter(Mandatory=$true)][string]$ImageDigest)
$ErrorActionPreference = 'Stop'
$policy = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../deploy/gcp/test-policy.json') -Raw | ConvertFrom-Json
if ($policy.project -ne 'project-7915787f-37b2-4286-aa7' -or $policy.region -ne 'us-central1') { throw 'Deployment scope mismatch' }
if (-not $policy.deploymentEnabled -or $env:GCP_DEPLOY_ENABLED -ne 'true') { throw 'Paid deployment is held by the monthly cost policy. See docs/gcp-admin-setup.md.' }
if ($ImageDigest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'An immutable CI-produced image digest is required' }
if ($env:SUPABASE_PUBLISHABLE_KEY -notmatch '^sb_publishable_') { throw 'Public Supabase key is required' }
$image = "us-central1-docker.pkg.dev/$($policy.project)/shootball-test/control-plane@$ImageDigest"
$runtime = "shootball-admin@$($policy.project).iam.gserviceaccount.com"
$gcloud = Join-Path $PSScriptRoot 'gcloud.cmd'
$posthogArgs = @()
if ($env:POSTHOG_API_KEY_SECRET_VERSION) {
  if ($env:POSTHOG_API_KEY_SECRET_VERSION -notmatch '^[a-zA-Z0-9_-]+:(latest|[0-9]+)$') { throw 'PostHog secret must be an existing secret-name:version in the scoped project' }
  $posthogArgs += "--update-secrets=POSTHOG_CLI_API_KEY=$env:POSTHOG_API_KEY_SECRET_VERSION"
}
& $gcloud help run deploy
if ($LASTEXITCODE -ne 0) { throw 'CLI validation failed' }
# The existing service exposes the sign-in shell; the app authorizes protected admin data.
& $gcloud run deploy shootball-control-test --image=$image --region=us-central1 --service-account=$runtime --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu=0.08 --memory=256Mi --concurrency=1 --execution-environment=gen1 --no-cpu-boost --cpu-throttling --timeout=30 --port=8080 "--update-env-vars=SUPABASE_URL=https://lkgxpgcmspxekggndzih.supabase.co,SUPABASE_PUBLISHABLE_KEY=$env:SUPABASE_PUBLISHABLE_KEY,ADMIN_ENVIRONMENT=production,RELEASE_SHA=$env:GITHUB_SHA,POSTHOG_CLI_PROJECT_ID=651980" @posthogArgs --quiet
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed' }
& $gcloud help run services update-traffic
if ($LASTEXITCODE -ne 0) { throw 'CLI traffic validation failed' }
& $gcloud run services update-traffic shootball-control-test --region=us-central1 --to-latest --quiet
if ($LASTEXITCODE -ne 0) { throw 'Traffic promotion failed' }
