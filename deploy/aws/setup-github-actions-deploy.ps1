param(
  [string]$Region = 'us-east-1',
  [string]$Repo = 'FlomadLabsRD/FloLabs_Chronos',
  [string]$RoleName = 'flolabs-chronos-github-actions-deploy',
  [string]$AppName = 'flolabs-chronos'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$ScriptRoot = $PSScriptRoot
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptRoot)
$ProvisionPath = Join-Path $ScriptRoot 'provision-output.json'
if (-not (Test-Path $ProvisionPath)) { throw 'Missing deploy/aws/provision-output.json. Run provision.ps1 first.' }
$Provision = Get-Content $ProvisionPath -Raw | ConvertFrom-Json
$AccountId = (aws sts get-caller-identity --query Account --output text --region $Region).Trim()
$OidcProviderArn = "arn:aws:iam::${AccountId}:oidc-provider/token.actions.githubusercontent.com"
$RoleArn = "arn:aws:iam::${AccountId}:role/${RoleName}"
$TrustPolicyPath = Join-Path $ScriptRoot 'github-actions-oidc-trust-policy.json'
$InlinePolicyPath = Join-Path $ScriptRoot 'github-actions-inline-policy.json'
$EnvPath = Join-Path $ProjectRoot '.env.production.local'
if (-not (Test-Path $EnvPath)) { $EnvPath = Join-Path $ProjectRoot '.env.local' }
if (-not (Test-Path $EnvPath)) { throw 'Missing .env.production.local or .env.local for secret bootstrap.' }

function Get-EnvMap {
  param([string]$Path)
  $map = [ordered]@{}
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed -match '^([A-Z0-9_]+)=(.*)$') {
      $key = $Matches[1]
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $map[$key] = $value
    }
  }
  return $map
}

$envMap = Get-EnvMap -Path $EnvPath

$requiredSecrets = [ordered]@{
  AWS_GITHUB_ACTIONS_ROLE_ARN = $RoleArn
  AUTH_SECRET = [string]$envMap['AUTH_SECRET']
  CRON_SECRET = [string]$Provision.cronSecret
  DATABASE_URL = [string]$Provision.databaseUrl
  FL_KV_REDIS_URL = [string]$Provision.redisUrl
  NOTION_API_KEY = [string]$envMap['NOTION_API_KEY']
  NOTION_DATABASE_ID = [string]$envMap['NOTION_DATABASE_ID']
  NOTION_ONBOARDINGS_DB_ID = [string]$envMap['NOTION_ONBOARDINGS_DB_ID']
  NOTION_TASKS_DB_ID = [string]$envMap['NOTION_TASKS_DB_ID']
  NOTION_TEAMS_DB_ID = [string]$envMap['NOTION_TEAMS_DB_ID']
  NOTION_TEAM_MEMBERS_DB_ID = [string]$envMap['NOTION_TEAM_MEMBERS_DB_ID']
  RESEND_API_KEY = [string]$envMap['RESEND_API_KEY']
  EMAIL_FROM = [string]$envMap['EMAIL_FROM']
}

$missing = @($requiredSecrets.GetEnumerator() | Where-Object { [string]::IsNullOrWhiteSpace($_.Value) } | ForEach-Object { $_.Key })
if ($missing.Count -gt 0) {
  throw "Missing values for required GitHub secrets: $($missing -join ', ')"
}

$oidcProvider = aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?Arn=='$OidcProviderArn'].Arn | [0]" --output text --region $Region
if (-not $oidcProvider -or $oidcProvider -eq 'None') {
  aws iam create-open-id-connect-provider `
    --url https://token.actions.githubusercontent.com `
    --client-id-list sts.amazonaws.com `
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 `
    --region $Region | Out-Null
}

$trustDoc = (Get-Content $TrustPolicyPath -Raw).Replace('975049954782', $AccountId)
Set-Content -Path $TrustPolicyPath -Value $trustDoc -Encoding ascii

$existingRole = aws iam get-role --role-name $RoleName --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
  aws iam create-role --role-name $RoleName --assume-role-policy-document "file://$TrustPolicyPath" --region $Region | Out-Null
} else {
  aws iam update-assume-role-policy --role-name $RoleName --policy-document "file://$TrustPolicyPath" --region $Region | Out-Null
}

aws iam put-role-policy --role-name $RoleName --policy-name github-actions-chronos-deploy --policy-document "file://$InlinePolicyPath" --region $Region | Out-Null

foreach ($entry in $requiredSecrets.GetEnumerator()) {
  $entry.Value | gh secret set $entry.Key --repo $Repo --body - | Out-Null
}

Write-Host "GitHub Actions AWS deploy bootstrap ready." -ForegroundColor Green
Write-Host "Role ARN: $RoleArn"
Write-Host "Repo secrets updated for $Repo"
