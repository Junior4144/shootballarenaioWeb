param([Parameter(Mandatory=$true)][string]$ImageDigest)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_REF -ne 'refs/heads/main') { throw 'Only main can deploy' }
if ($ImageDigest -notmatch '^sha256:[a-f0-9]{64}$' -or $env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$') { throw 'Invalid immutable release identity' }
if ($env:SUPABASE_PUBLISHABLE_KEY -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') { throw 'Scoped publishable key required' }
$policy = Get-Content (Join-Path $PSScriptRoot '../deploy/gcp/test-policy.json') -Raw | ConvertFrom-Json
if (-not $policy.deploymentEnabled -or $env:GCP_DEPLOY_ENABLED -ne 'true' -or $policy.monthlyTargetUsd -gt 13) { throw 'Deployment policy disabled' }
$releasePath = Join-Path $env:RUNNER_TEMP 'shootball-release.txt'
$release = "$env:GITHUB_SHA|$ImageDigest|136.71.64.19.sslip.io|$env:SUPABASE_PUBLISHABLE_KEY"
[IO.File]::WriteAllText($releasePath, $release, [Text.UTF8Encoding]::new($false))
$gcloud = Join-Path $PSScriptRoot 'gcloud.cmd'
& $gcloud help compute instances add-metadata
if ($LASTEXITCODE -ne 0) { throw 'CLI validation failed' }
& $gcloud compute instances add-metadata shootball-game-test --zone=us-central1-a "--metadata-from-file=shootball-release=$releasePath" --quiet
if ($LASTEXITCODE -ne 0) { throw 'Release metadata update failed' }
for ($attempt=0; $attempt -lt 60; $attempt++) {
  try {
    $health = Invoke-RestMethod 'https://136.71.64.19.sslip.io/healthz' -TimeoutSec 10
    if ($health.status -eq 'live' -and $health.revision -eq $env:GITHUB_SHA) { Write-Output "Game release verified: $env:GITHUB_SHA"; exit 0 }
  } catch { Write-Output 'Waiting for game release and valid HTTPS...' }
  Start-Sleep -Seconds 10
}
throw 'Game release did not become healthy; inspect VM release service logs. Web deployment was not promoted.'
