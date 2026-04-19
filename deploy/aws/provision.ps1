param(
  [string]$Region = 'us-east-1',
  [string]$AppName = 'flolabs-chronos',
  [string]$DbName = 'chronos',
  [string]$DbUsername = 'chronos',
  [string]$DbInstanceClass = 'db.t4g.micro',
  [string]$DbStorageGb = '20'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-AwsText {
  param([Parameter(Mandatory = $true)][string[]]$Args)
  $output = & aws @Args 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return (($output | Out-String).Trim())
}

function New-RandomSecret {
  param([int]$Bytes = 32, [string]$Replacement = 'A')
  return ([Convert]::ToBase64String((1..$Bytes | ForEach-Object { Get-Random -Maximum 256 })) -replace '[^A-Za-z0-9]', $Replacement)
}

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$OutputPath = Join-Path $PSScriptRoot 'provision-output.json'
$Existing = $null
if (Test-Path $OutputPath) {
  $Existing = Get-Content $OutputPath -Raw | ConvertFrom-Json
}

$AccountId = (Invoke-AwsText @('sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', $Region))
if (-not $AccountId) { throw 'Unable to resolve AWS account via sts get-caller-identity' }

$RepositoryName = $AppName
$DbIdentifier = "$AppName-db"
$DbSecurityGroupName = "$AppName-db-sg"
$ConnectorSecurityGroupName = "$AppName-vpc-connector-sg"
$RedisSecurityGroupName = "$AppName-redis-sg"
$SubnetGroup = "$AppName-db-subnets"
$VpcConnectorName = "$AppName-vpc-connector"
$EcrAccessRoleName = "$AppName-apprunner-ecr-access-role"
$RedisCacheName = "$AppName-redis"
$CronSecret = if ($Existing?.cronSecret) { [string]$Existing.cronSecret } else { New-RandomSecret -Bytes 32 -Replacement 'A' }
$DbPassword = if ($Existing?.dbPassword) { [string]$Existing.dbPassword } else { New-RandomSecret -Bytes 24 -Replacement 'B' }

Write-Host "=== Provisioning AWS for $AppName in $Region ===" -ForegroundColor Cyan

$vpcId = Invoke-AwsText @('ec2', 'describe-vpcs', '--filters', 'Name=is-default,Values=true', '--query', 'Vpcs[0].VpcId', '--output', 'text', '--region', $Region)
$subnetText = Invoke-AwsText @('ec2', 'describe-subnets', '--filters', "Name=vpc-id,Values=$vpcId", '--query', 'Subnets[].SubnetId', '--output', 'text', '--region', $Region)
$subnetIds = @($subnetText -split '\s+' | Where-Object { $_ })
if (-not $vpcId -or $vpcId -eq 'None' -or $subnetIds.Count -lt 2) { throw 'Default VPC/subnets not available' }

$existingRepo = Invoke-AwsText @('ecr', 'describe-repositories', '--query', "repositories[?repositoryName=='$RepositoryName'].repositoryName | [0]", '--output', 'text', '--region', $Region)
if (-not $existingRepo -or $existingRepo -eq 'None') {
  & aws ecr create-repository --repository-name $RepositoryName --image-scanning-configuration scanOnPush=true --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create ECR repository' }
}
Write-Host "ECR repo ready: $RepositoryName" -ForegroundColor Green

$dbSgId = Invoke-AwsText @('ec2', 'describe-security-groups', '--filters', "Name=group-name,Values=$DbSecurityGroupName", "Name=vpc-id,Values=$vpcId", '--query', 'SecurityGroups[0].GroupId', '--output', 'text', '--region', $Region)
if (-not $dbSgId -or $dbSgId -eq 'None') {
  $dbSgId = Invoke-AwsText @('ec2', 'create-security-group', '--group-name', $DbSecurityGroupName, '--description', 'Chronos RDS access', '--vpc-id', $vpcId, '--query', 'GroupId', '--output', 'text', '--region', $Region)
}

$connectorSgId = Invoke-AwsText @('ec2', 'describe-security-groups', '--filters', "Name=group-name,Values=$ConnectorSecurityGroupName", "Name=vpc-id,Values=$vpcId", '--query', 'SecurityGroups[0].GroupId', '--output', 'text', '--region', $Region)
if (-not $connectorSgId -or $connectorSgId -eq 'None') {
  $connectorSgId = Invoke-AwsText @('ec2', 'create-security-group', '--group-name', $ConnectorSecurityGroupName, '--description', 'Chronos App Runner connector', '--vpc-id', $vpcId, '--query', 'GroupId', '--output', 'text', '--region', $Region)
}

$redisSgId = Invoke-AwsText @('ec2', 'describe-security-groups', '--filters', "Name=group-name,Values=$RedisSecurityGroupName", "Name=vpc-id,Values=$vpcId", '--query', 'SecurityGroups[0].GroupId', '--output', 'text', '--region', $Region)
if (-not $redisSgId -or $redisSgId -eq 'None') {
  $redisSgId = Invoke-AwsText @('ec2', 'create-security-group', '--group-name', $RedisSecurityGroupName, '--description', 'Chronos Redis access', '--vpc-id', $vpcId, '--query', 'GroupId', '--output', 'text', '--region', $Region)
}

$existingIngress = Invoke-AwsText @('ec2', 'describe-security-groups', '--group-ids', $dbSgId, '--query', "SecurityGroups[0].IpPermissions[?FromPort==`5432` && ToPort==`5432` && UserIdGroupPairs[?GroupId=='$connectorSgId']][0]", '--output', 'text', '--region', $Region)
if (-not $existingIngress -or $existingIngress -eq 'None') {
  & aws ec2 authorize-security-group-ingress --group-id $dbSgId --protocol tcp --port 5432 --source-group $connectorSgId --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to authorize DB ingress from App Runner connector' }
}

$existingRedisIngress = Invoke-AwsText @('ec2', 'describe-security-groups', '--group-ids', $redisSgId, '--query', "SecurityGroups[0].IpPermissions[?FromPort==`6379` && ToPort==`6379` && UserIdGroupPairs[?GroupId=='$connectorSgId']][0]", '--output', 'text', '--region', $Region)
if (-not $existingRedisIngress -or $existingRedisIngress -eq 'None') {
  & aws ec2 authorize-security-group-ingress --group-id $redisSgId --protocol tcp --port 6379 --source-group $connectorSgId --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to authorize Redis ingress from App Runner connector' }
}
Write-Host "Security groups ready: DB=$dbSgId Connector=$connectorSgId Redis=$redisSgId" -ForegroundColor Green

$existingSubnetGroup = Invoke-AwsText @('rds', 'describe-db-subnet-groups', '--query', "DBSubnetGroups[?DBSubnetGroupName=='$SubnetGroup'].DBSubnetGroupName | [0]", '--output', 'text', '--region', $Region)
if (-not $existingSubnetGroup -or $existingSubnetGroup -eq 'None') {
  & aws rds create-db-subnet-group --db-subnet-group-name $SubnetGroup --db-subnet-group-description 'Chronos DB subnets' --subnet-ids @($subnetIds) --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create DB subnet group' }
}
Write-Host "DB subnet group ready: $SubnetGroup" -ForegroundColor Green

$existingDb = Invoke-AwsText @('rds', 'describe-db-instances', '--query', "DBInstances[?DBInstanceIdentifier=='$DbIdentifier'].DBInstanceIdentifier | [0]", '--output', 'text', '--region', $Region)
if (-not $existingDb -or $existingDb -eq 'None') {
  & aws rds create-db-instance `
    --db-instance-identifier $DbIdentifier `
    --engine postgres `
    --engine-version 17.4 `
    --db-instance-class $DbInstanceClass `
    --allocated-storage $DbStorageGb `
    --storage-type gp3 `
    --master-username $DbUsername `
    --master-user-password $DbPassword `
    --db-name $DbName `
    --vpc-security-group-ids $dbSgId `
    --db-subnet-group-name $SubnetGroup `
    --backup-retention-period 7 `
    --no-multi-az `
    --publicly-accessible `
    --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create RDS instance' }
}
Write-Host "RDS instance provisioning: $DbIdentifier" -ForegroundColor Green
& aws rds wait db-instance-available --db-instance-identifier $DbIdentifier --region $Region
if ($LASTEXITCODE -ne 0) { throw 'RDS instance did not become available' }
$dbHost = Invoke-AwsText @('rds', 'describe-db-instances', '--db-instance-identifier', $DbIdentifier, '--query', 'DBInstances[0].Endpoint.Address', '--output', 'text', '--region', $Region)
$dbPort = Invoke-AwsText @('rds', 'describe-db-instances', '--db-instance-identifier', $DbIdentifier, '--query', 'DBInstances[0].Endpoint.Port', '--output', 'text', '--region', $Region)

$trustPolicyPath = Join-Path $PSScriptRoot 'apprunner-ecr-trust-policy.json'
@'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "build.apprunner.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
'@ | Set-Content -Path $trustPolicyPath -Encoding ascii

$ecrAccessRoleArn = Invoke-AwsText @('iam', 'list-roles', '--query', "Roles[?RoleName=='$EcrAccessRoleName'].Arn | [0]", '--output', 'text')
if (-not $ecrAccessRoleArn -or $ecrAccessRoleArn -eq 'None') {
  $ecrAccessRoleArn = Invoke-AwsText @('iam', 'create-role', '--role-name', $EcrAccessRoleName, '--assume-role-policy-document', "file://$trustPolicyPath", '--query', 'Role.Arn', '--output', 'text')
  if (-not $ecrAccessRoleArn) { throw 'Failed to create App Runner ECR access role' }
}
& aws iam attach-role-policy --role-name $EcrAccessRoleName --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess | Out-Null
Write-Host "App Runner ECR access role ready: $ecrAccessRoleArn" -ForegroundColor Green

$vpcConnectorArn = Invoke-AwsText @('apprunner', 'list-vpc-connectors', '--query', "VpcConnectors[?VpcConnectorName=='$VpcConnectorName'].VpcConnectorArn | [0]", '--output', 'text', '--region', $Region)
if (-not $vpcConnectorArn -or $vpcConnectorArn -eq 'None') {
  & aws apprunner create-vpc-connector --vpc-connector-name $VpcConnectorName --subnets @($subnetIds) --security-groups $connectorSgId --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create App Runner VPC connector' }
}

do {
  Start-Sleep -Seconds 5
  $vpcConnectorArn = Invoke-AwsText @('apprunner', 'list-vpc-connectors', '--query', "VpcConnectors[?VpcConnectorName=='$VpcConnectorName'].VpcConnectorArn | [0]", '--output', 'text', '--region', $Region)
  $status = Invoke-AwsText @('apprunner', 'list-vpc-connectors', '--query', "VpcConnectors[?VpcConnectorName=='$VpcConnectorName'].Status | [0]", '--output', 'text', '--region', $Region)
} while ($status -and $status -ne 'ACTIVE')
Write-Host "App Runner VPC connector ready: $vpcConnectorArn" -ForegroundColor Green

$existingRedisArn = Invoke-AwsText @('elasticache', 'describe-serverless-caches', '--serverless-cache-name', $RedisCacheName, '--query', 'ServerlessCaches[0].ARN', '--output', 'text', '--region', $Region)
if (-not $existingRedisArn -or $existingRedisArn -eq 'None') {
  & aws elasticache create-serverless-cache --serverless-cache-name $RedisCacheName --engine redis --security-group-ids $redisSgId --subnet-ids @($subnetIds[0..2]) --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create ElastiCache Serverless cache' }
}

do {
  Start-Sleep -Seconds 5
  $redisStatus = Invoke-AwsText @('elasticache', 'describe-serverless-caches', '--serverless-cache-name', $RedisCacheName, '--query', 'ServerlessCaches[0].Status', '--output', 'text', '--region', $Region)
} while ($redisStatus -and $redisStatus -ne 'available')

$redisEndpoint = Invoke-AwsText @('elasticache', 'describe-serverless-caches', '--serverless-cache-name', $RedisCacheName, '--query', 'ServerlessCaches[0].Endpoint.Address', '--output', 'text', '--region', $Region)
$redisPort = Invoke-AwsText @('elasticache', 'describe-serverless-caches', '--serverless-cache-name', $RedisCacheName, '--query', 'ServerlessCaches[0].Endpoint.Port', '--output', 'text', '--region', $Region)
$redisUrl = if ($redisEndpoint -and $redisEndpoint -ne 'None') { "redis://${redisEndpoint}:${redisPort}" } else { $null }

$ssmPrefix = "/$AppName"
$databaseUrl = "postgresql://${DbUsername}:${DbPassword}@${dbHost}:${dbPort}/${DbName}?sslmode=require"
& aws ssm put-parameter --name "$ssmPrefix/DATABASE_URL" --type SecureString --value $databaseUrl --overwrite --region $Region | Out-Null
& aws ssm put-parameter --name "$ssmPrefix/CRON_SECRET" --type SecureString --value $CronSecret --overwrite --region $Region | Out-Null
if ($redisUrl) {
  & aws ssm put-parameter --name "$ssmPrefix/REDIS_URL" --type SecureString --value $redisUrl --overwrite --region $Region | Out-Null
}

$result = [ordered]@{
  appName = $AppName
  region = $Region
  accountId = $AccountId
  repositoryName = $RepositoryName
  dbIdentifier = $DbIdentifier
  dbHost = $dbHost
  dbPort = $dbPort
  dbName = $DbName
  dbUsername = $DbUsername
  dbPassword = $DbPassword
  databaseUrl = $databaseUrl
  cronSecret = $CronSecret
  dbSecurityGroupId = $dbSgId
  connectorSecurityGroupId = $connectorSgId
  redisSecurityGroupId = $redisSgId
  subnetGroup = $SubnetGroup
  vpcConnectorArn = $vpcConnectorArn
  ecrAccessRoleArn = $ecrAccessRoleArn
  redisCacheName = $RedisCacheName
  redisUrl = $redisUrl
  ssmPrefix = $ssmPrefix
}
$result | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputPath
Remove-Item $trustPolicyPath -ErrorAction SilentlyContinue
Write-Host ($result | ConvertTo-Json -Depth 5)
