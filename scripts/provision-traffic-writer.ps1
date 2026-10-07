$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$path = Join-Path $root '.env.traffic'
if (Test-Path -LiteralPath $path) {
  $line = Get-Content -LiteralPath $path | Where-Object { $_ -match '^TRAFFIC_HISTORY_TOKEN=' }
  $token = ($line -split '=',2)[1]
} else {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
if ($token -notmatch '^[a-f0-9]{64}$') { throw 'Invalid local collector credential' }
$sha = [Security.Cryptography.SHA256]::Create()
$hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)) | ForEach-Object { $_.ToString('x2') })
$sha.Dispose()
# Save before registering, so an interrupted call can reuse the same credential.
[IO.File]::WriteAllText($path, "TRAFFIC_HISTORY_TOKEN=$token`n", [Text.UTF8Encoding]::new($false))
$sql = @"
do `$`$ begin
  if exists(select 1 from admin_private.traffic_writers where id='game-primary' and token_hash<>'$hash') then
    raise exception 'Another collector credential is already registered; explicit rotation is required';
  end if;
  insert into admin_private.traffic_writers(id,token_hash) values('game-primary','$hash') on conflict do nothing;
end; `$`$;
"@
& supabase db query --linked --project-ref lkgxpgcmspxekggndzih $sql
if ($LASTEXITCODE -ne 0) { throw 'Collector registration failed; local credential retained for retry' }
Write-Output 'Collector credential registered. The secret is in .env.traffic (gitignored); do not commit or paste it.'
Write-Output 'Install this file as /var/lib/shootball/traffic/collector.env on the game VM before the next game release.'
