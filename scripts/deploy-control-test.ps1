param([Parameter(Mandatory=$true)][string]$ImageDigest)
$ErrorActionPreference = 'Stop'
$policy = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../deploy/gcp/test-policy.json') -Raw | ConvertFrom-Json
if ($policy.project -ne 'project-7915787f-37b2-4286-aa7' -or $policy.region -ne 'us-central1') { throw 'Deployment scope mismatch' }
if (-not $policy.deploymentEnabled -or $env:GCP_DEPLOY_ENABLED -ne 'true') { throw 'Paid deployment is held by the monthly cost policy. See docs/deployment-setup.md.' }
if ($ImageDigest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'An immutable CI-produced image digest is required' }
if ($env:SUPABASE_PUBLISHABLE_KEY -notmatch '^sb_publishable_') { throw 'Public Supabase key is required' }
$image = "us-central1-docker.pkg.dev/$($policy.project)/shootball-test/control-plane@$ImageDigest"
$runtime = "shootball-admin@$($policy.project).iam.gserviceaccount.com"
$gcloud = Join-Path $PSScriptRoot 'gcloud.cmd'
& $gcloud help run deploy
if ($LASTEXITCODE -ne 0) { throw 'CLI validation failed' }
# Defaults remain private. Public invocation is a separate scoped release step.
& $gcloud run deploy shootball-control-test --image=$image --region=us-central1 --service-account=$runtime --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu=0.08 --memory=256Mi --concurrency=1 --execution-environment=gen1 --no-cpu-boost --cpu-throttling --timeout=30 --no-allow-unauthenticated --port=8080 "--set-env-vars=SUPABASE_URL=https://lkgxpgcmspxekggndzih.supabase.co,SUPABASE_PUBLISHABLE_KEY=$env:SUPABASE_PUBLISHABLE_KEY,ADMIN_ENVIRONMENT=gcp-test" --quiet
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed' }
