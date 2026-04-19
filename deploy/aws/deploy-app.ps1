param(
  [string]$Region = 'us-east-1',
  [string]$AppName = 'flolabs-chronos'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ProvisionPath = Join-Path $PSScriptRoot 'provision-output.json'
if (-not (Test-Path $ProvisionPath)) { throw 'Missing deploy/aws/provision-output.json. Run provision.ps1 first.' }
$Provision = Get-Content $ProvisionPath -Raw | ConvertFrom-Json
$AccountId = (aws sts get-caller-identity --query Account --output text --region $Region).Trim()
$RepositoryName = $Provision.repositoryName
$ImageTag = 'latest'
$ImageUri = "${AccountId}.dkr.ecr.${Region}.amazonaws.com/${RepositoryName}:${ImageTag}"
$SourceConfigPath = Join-Path $PSScriptRoot 'apprunner-source.json'
$ServiceConfigPath = Join-Path $PSScriptRoot 'apprunner-service.json'
$InstanceConfig = @{ Cpu = '1 vCPU'; Memory = '2 GB' }

function Get-EnvMap {
  param([string]$Path)
  $map = [ordered]@{}
  if (-not (Test-Path $Path)) { return $map }
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

function Set-OrReplaceEnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $lines = if (Test-Path $Path) { Get-Content $Path } else { @() }
  $escaped = [Regex]::Escape($Key)
  $replacement = "$Key=$Value"
  $matched = $false
  $updated = foreach ($line in $lines) {
    if ($line -match "^${escaped}=") {
      $matched = $true
      $replacement
    } else {
      $line
    }
  }

  if (-not $matched) {
    if ($updated.Count -gt 0 -and $updated[-1] -ne '') {
      $updated += ''
    }
    $updated += $replacement
  }

  Set-Content -Path $Path -Value $updated -Encoding utf8
}

function Wait-AppRunnerOperation {
  param([string]$OperationArn)
  if (-not $OperationArn) { return }
  do {
    Start-Sleep -Seconds 10
    $status = (aws apprunner list-operations --service-arn $serviceArn --region $Region --query "OperationSummaryList[?Id=='$OperationArn'].Status | [0]" --output text).Trim()
    if (-not $status -or $status -eq 'None') {
      $status = (aws apprunner list-operations --service-arn $serviceArn --region $Region --query 'OperationSummaryList[0].Status' --output text).Trim()
    }
  } while ($status -eq 'IN_PROGRESS' -or $status -eq 'PENDING')
  if ($status -ne 'SUCCEEDED') { throw "App Runner operation failed with status: $status" }
}

$envFromFile = Get-EnvMap -Path (Join-Path $ProjectRoot '.env.production.local')
if ($envFromFile.Count -eq 0) {
  $envFromFile = Get-EnvMap -Path (Join-Path $ProjectRoot '.env.local')
}
$envFromFile = [ordered]@{} + $envFromFile

$skipEnvKeys = @(
  'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_OIDC_TOKEN', 'VERCEL_TARGET_ENV',
  'VERCEL_GIT_COMMIT_AUTHOR_LOGIN', 'VERCEL_GIT_COMMIT_AUTHOR_NAME', 'VERCEL_GIT_COMMIT_MESSAGE',
  'VERCEL_GIT_COMMIT_REF', 'VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_PREVIOUS_SHA', 'VERCEL_GIT_PROVIDER',
  'VERCEL_GIT_PULL_REQUEST_ID', 'VERCEL_GIT_REPO_ID', 'VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG',
  'TURBO_CACHE', 'TURBO_DOWNLOAD_LOCAL_ENABLED', 'TURBO_REMOTE_ONLY', 'TURBO_RUN_SUMMARY', 'VERCEL_TOKEN',
  'FL_CHRONOS_NEON_PROJECT_ID', 'FL_CHRONOS_PGDATABASE', 'FL_CHRONOS_PGHOST', 'FL_CHRONOS_PGHOST_UNPOOLED',
  'FL_CHRONOS_PGPASSWORD', 'FL_CHRONOS_PGUSER', 'FL_CHRONOS_POSTGRES_DATABASE', 'FL_CHRONOS_POSTGRES_HOST',
  'FL_CHRONOS_POSTGRES_PASSWORD', 'FL_CHRONOS_POSTGRES_PRISMA_URL', 'FL_CHRONOS_POSTGRES_URL',
  'FL_CHRONOS_POSTGRES_URL_NON_POOLING', 'FL_CHRONOS_POSTGRES_URL_NO_SSL', 'FL_CHRONOS_POSTGRES_USER',
  'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL_NO_SSL',
  'PGDATABASE', 'PGHOST', 'PGHOST_UNPOOLED', 'PGPASSWORD', 'PGUSER'
)
foreach ($key in $skipEnvKeys) {
  if ($envFromFile.Contains($key)) { $envFromFile.Remove($key) }
}

$neonEnvKeys = @(
  'FL_CHRONOS_NEON_PROJECT_ID', 'FL_CHRONOS_PGDATABASE', 'FL_CHRONOS_PGHOST', 'FL_CHRONOS_PGHOST_UNPOOLED',
  'FL_CHRONOS_PGPASSWORD', 'FL_CHRONOS_PGUSER', 'FL_CHRONOS_POSTGRES_DATABASE', 'FL_CHRONOS_POSTGRES_HOST',
  'FL_CHRONOS_POSTGRES_PASSWORD', 'FL_CHRONOS_POSTGRES_PRISMA_URL', 'FL_CHRONOS_POSTGRES_URL',
  'FL_CHRONOS_POSTGRES_URL_NON_POOLING', 'FL_CHRONOS_POSTGRES_URL_NO_SSL', 'FL_CHRONOS_POSTGRES_USER',
  'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL_NO_SSL',
  'PGDATABASE', 'PGHOST', 'PGHOST_UNPOOLED', 'PGPASSWORD', 'PGUSER'
)
foreach ($key in $neonEnvKeys) {
  if ($envFromFile.Contains($key)) { $envFromFile.Remove($key) }
}

$envFromFile['DATABASE_URL'] = [string]$Provision.databaseUrl
$envFromFile['FL_CHRONOS_DATABASE_URL'] = [string]$Provision.databaseUrl
$envFromFile['FL_CHRONOS_DATABASE_URL_UNPOOLED'] = [string]$Provision.databaseUrl
if ($Provision.redisUrl) {
  $envFromFile['KV_URL'] = [string]$Provision.redisUrl
  $envFromFile['FL_KV_REDIS_URL'] = [string]$Provision.redisUrl
}
$envFromFile['CRON_SECRET'] = [string]$Provision.cronSecret
$envFromFile['NODE_ENV'] = 'production'

$localEnvPath = Join-Path $ProjectRoot '.env.production.local'
if (-not (Test-Path $localEnvPath)) {
  $localEnvPath = Join-Path $ProjectRoot '.env.local'
}
if ($localEnvPath) {
  foreach ($key in $neonEnvKeys) {
    if ((Get-EnvMap -Path $localEnvPath).Contains($key)) {
      $lines = Get-Content $localEnvPath
      $escaped = [Regex]::Escape($key)
      $lines = $lines | Where-Object { $_ -notmatch "^${escaped}=" }
      Set-Content -Path $localEnvPath -Value $lines -Encoding utf8
    }
  }
  Set-OrReplaceEnvValue -Path $localEnvPath -Key 'DATABASE_URL' -Value ([string]$Provision.databaseUrl)
  Set-OrReplaceEnvValue -Path $localEnvPath -Key 'FL_CHRONOS_DATABASE_URL' -Value ([string]$Provision.databaseUrl)
  Set-OrReplaceEnvValue -Path $localEnvPath -Key 'FL_CHRONOS_DATABASE_URL_UNPOOLED' -Value ([string]$Provision.databaseUrl)
  if ($Provision.redisUrl) {
    Set-OrReplaceEnvValue -Path $localEnvPath -Key 'KV_URL' -Value ([string]$Provision.redisUrl)
    Set-OrReplaceEnvValue -Path $localEnvPath -Key 'FL_KV_REDIS_URL' -Value ([string]$Provision.redisUrl)
  }
  Set-OrReplaceEnvValue -Path $localEnvPath -Key 'CRON_SECRET' -Value ([string]$Provision.cronSecret)
}

aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "${AccountId}.dkr.ecr.${Region}.amazonaws.com"
docker build -t "${RepositoryName}:${ImageTag}" $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw 'Docker build failed' }

docker tag "${RepositoryName}:${ImageTag}" $ImageUri
docker push $ImageUri
if ($LASTEXITCODE -ne 0) { throw 'Docker push failed' }

$serviceArn = (aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$AppName'].ServiceArn | [0]" --output text --region $Region).Trim()
$initialUrl = if ($serviceArn -and $serviceArn -ne 'None') {
  (aws apprunner describe-service --service-arn $serviceArn --query 'Service.ServiceUrl' --output text --region $Region).Trim()
} else {
  $null
}

$runtimeEnv = [ordered]@{}
foreach ($entry in $envFromFile.GetEnumerator()) {
  if (-not [string]::IsNullOrWhiteSpace($entry.Value)) {
    $runtimeEnv[[string]$entry.Key] = [string]$entry.Value
  }
}

if ($initialUrl -and $initialUrl -ne 'None') {
  $runtimeEnv['NEXTAUTH_URL'] = "https://$initialUrl"
  $runtimeEnv['APP_URL'] = "https://$initialUrl"
}

@{
  AuthenticationConfiguration = @{ AccessRoleArn = [string]$Provision.ecrAccessRoleArn }
  AutoDeploymentsEnabled = $true
  ImageRepository = @{
    ImageIdentifier = $ImageUri
    ImageRepositoryType = 'ECR'
    ImageConfiguration = @{
      Port = '3000'
      RuntimeEnvironmentVariables = $runtimeEnv
    }
  }
} | ConvertTo-Json -Depth 10 | Set-Content -Path $SourceConfigPath -Encoding ascii

@{
  Cpu = $InstanceConfig.Cpu
  Memory = $InstanceConfig.Memory
} | ConvertTo-Json -Depth 4 | Set-Content -Path $ServiceConfigPath -Encoding ascii

if (-not $serviceArn -or $serviceArn -eq 'None') {
  $create = aws apprunner create-service --service-name $AppName --source-configuration "file://$SourceConfigPath" --instance-configuration "file://$ServiceConfigPath" --network-configuration "EgressConfiguration={EgressType=VPC,VpcConnectorArn=$($Provision.vpcConnectorArn)}" --region $Region | ConvertFrom-Json
  $serviceArn = $create.Service.ServiceArn
  $operationArn = $create.OperationId
} else {
  while ($true) {
    $serviceStatus = (aws apprunner describe-service --service-arn $serviceArn --query 'Service.Status' --output text --region $Region).Trim()
    if ($serviceStatus -notin @('OPERATION_IN_PROGRESS', 'CREATE_FAILED', 'DELETE_FAILED')) { break }
    Start-Sleep -Seconds 10
  }
  $update = aws apprunner update-service --service-arn $serviceArn --source-configuration "file://$SourceConfigPath" --instance-configuration "file://$ServiceConfigPath" --network-configuration "EgressConfiguration={EgressType=VPC,VpcConnectorArn=$($Provision.vpcConnectorArn)}" --region $Region | ConvertFrom-Json
  $operationArn = $update.OperationId
}

Wait-AppRunnerOperation -OperationArn $operationArn
$serviceUrl = (aws apprunner describe-service --service-arn $serviceArn --query 'Service.ServiceUrl' --output text --region $Region).Trim()
if (-not $serviceUrl -or $serviceUrl -eq 'None') { throw 'App Runner service URL not available after deployment' }

$finalRuntimeEnv = [ordered]@{}
foreach ($entry in $runtimeEnv.GetEnumerator()) {
  if ($entry.Key -notin @('NEXTAUTH_URL', 'APP_URL')) {
    $finalRuntimeEnv[[string]$entry.Key] = [string]$entry.Value
  }
}
$finalRuntimeEnv['NEXTAUTH_URL'] = "https://$serviceUrl"
$finalRuntimeEnv['APP_URL'] = "https://$serviceUrl"

@{
  AuthenticationConfiguration = @{ AccessRoleArn = [string]$Provision.ecrAccessRoleArn }
  AutoDeploymentsEnabled = $true
  ImageRepository = @{
    ImageIdentifier = $ImageUri
    ImageRepositoryType = 'ECR'
    ImageConfiguration = @{
      Port = '3000'
      RuntimeEnvironmentVariables = $finalRuntimeEnv
    }
  }
} | ConvertTo-Json -Depth 10 | Set-Content -Path $SourceConfigPath -Encoding ascii

while ($true) {
  $serviceStatus = (aws apprunner describe-service --service-arn $serviceArn --query 'Service.Status' --output text --region $Region).Trim()
  if ($serviceStatus -notin @('OPERATION_IN_PROGRESS', 'CREATE_FAILED', 'DELETE_FAILED')) { break }
  Start-Sleep -Seconds 10
}
$updateFinal = aws apprunner update-service --service-arn $serviceArn --source-configuration "file://$SourceConfigPath" --instance-configuration "file://$ServiceConfigPath" --network-configuration "EgressConfiguration={EgressType=VPC,VpcConnectorArn=$($Provision.vpcConnectorArn)}" --region $Region | ConvertFrom-Json
Wait-AppRunnerOperation -OperationArn $updateFinal.OperationId

aws apprunner describe-service --service-arn $serviceArn --region $Region
