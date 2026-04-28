param(
  [Parameter(Mandatory = $false)]
  [string]$ApiBaseUrl = "https://ancient-ocean-78301-96aad9a4957a.herokuapp.com",

  [Parameter(Mandatory = $false)]
  [string]$MasterApiKey = "",

  [Parameter(Mandatory = $true)]
  [string]$ClientId,

  [Parameter(Mandatory = $true)]
  [string]$Name,

  [Parameter(Mandatory = $false)]
  [string]$Description = "",

  [Parameter(Mandatory = $false)]
  [string]$Plan = "",

  [Parameter(Mandatory = $false)]
  [string[]]$Permissions = @("*"),

  [Parameter(Mandatory = $false)]
  [string]$OutputFile = ".\data\generated-api-keys.local.json",

  [Parameter(Mandatory = $false)]
  [switch]$IncludeConnections,

  [Parameter(Mandatory = $false)]
  [bool]$TriggerQrWindow = $true,

  [Parameter(Mandatory = $false)]
  [int]$QrWindowSeconds = 10
)

$ErrorActionPreference = "Stop"

function Get-EnvValueFromFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string]$Key
  )

  if (-not (Test-Path $FilePath)) {
    return $null
  }

  $line = Get-Content $FilePath | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  $value = ($line -split "=", 2)[1].Trim()
  return $value.Trim('"').Trim("'")
}

if ([string]::IsNullOrWhiteSpace($MasterApiKey)) {
  if ($env:API_KEY) {
    $MasterApiKey = $env:API_KEY
  } else {
    $projectEnvPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
    $MasterApiKey = Get-EnvValueFromFile -FilePath $projectEnvPath -Key "API_KEY"
  }
}

if ([string]::IsNullOrWhiteSpace($MasterApiKey)) {
  throw "Debes enviar -MasterApiKey, definir la variable de entorno API_KEY o tener API_KEY en el archivo .env del proyecto."
  }

$normalizedBaseUrl = $ApiBaseUrl.TrimEnd("/")
$endpoint = "$normalizedBaseUrl/api/auth/keys"

$body = @{
  name = $Name
  description = $Description
  clientId = $ClientId
  permissions = $Permissions
}

if (-not [string]::IsNullOrWhiteSpace($Plan)) {
  $body.plan = $Plan
}

Write-Host "Creando API key para tenant $ClientId en $endpoint" -ForegroundColor Cyan

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $endpoint `
  -Headers @{
    "Content-Type" = "application/json"
    "X-API-Key" = $MasterApiKey
  } `
  -Body ($body | ConvertTo-Json -Depth 5)

if (-not $response.success) {
  throw "La API no devolvio success=true."
}

if ($QrWindowSeconds -lt 1) {
  $QrWindowSeconds = 10
}

if ($TriggerQrWindow) {
  Write-Host "" 
  Write-Host "Inicializando conexiones del tenant para generar QR ($QrWindowSeconds s)..." -ForegroundColor Cyan
  try {
    $restartBody = @{
      clientId = $response.data.clientId
    }

    Invoke-RestMethod `
      -Method Post `
      -Uri "$normalizedBaseUrl/api/session/restart" `
      -Headers @{
        "Content-Type" = "application/json"
        "X-API-Key" = $response.data.key
      } `
      -Body ($restartBody | ConvertTo-Json -Depth 5) | Out-Null

    Start-Sleep -Seconds $QrWindowSeconds

    $logoutBody = @{
      clientId = $response.data.clientId
    }

    Invoke-RestMethod `
      -Method Post `
      -Uri "$normalizedBaseUrl/api/session/logout" `
      -Headers @{
        "Content-Type" = "application/json"
        "X-API-Key" = $response.data.key
      } `
      -Body ($logoutBody | ConvertTo-Json -Depth 5) | Out-Null

    Write-Host "Ventana QR finalizada. Conexiones del tenant desconectadas." -ForegroundColor Green
  } catch {
    Write-Warning "No se pudo ejecutar el disparador QR del tenant: $($_.Exception.Message)"
  }
}

$connections = @()
$defaultConnectionId = $null
if ($IncludeConnections) {
  try {
    $adminConfigResponse = Invoke-RestMethod `
      -Method Get `
      -Uri "$normalizedBaseUrl/api/whatsapp-connections/admin-config" `
      -Headers @{
        "X-API-Key" = $response.data.key
      }

    if ($adminConfigResponse.success -and $adminConfigResponse.data) {
      $defaultConnectionId = $adminConfigResponse.data.defaultConnectionId
      if ($adminConfigResponse.data.connections) {
        $connections = @($adminConfigResponse.data.connections)
      }
    }

    if ($connections.Count -eq 0) {
    $connectionsResponse = Invoke-RestMethod `
      -Method Get `
      -Uri "$normalizedBaseUrl/api/whatsapp-connections" `
      -Headers @{
        "X-API-Key" = $response.data.key
      }

      if ($connectionsResponse.success -and $connectionsResponse.data) {
        $connections = @($connectionsResponse.data)
      }
    }
  } catch {
    Write-Warning "No se pudieron consultar las conexiones del tenant con la API key nueva: $($_.Exception.Message)"
  }
}

$record = [ordered]@{
  createdAt = (Get-Date).ToString("s")
  apiBaseUrl = $normalizedBaseUrl
  clientId = $response.data.clientId
  apiKeyId = $response.data.id
  name = $response.data.name
  description = $response.data.description
  plan = $response.data.plan
  permissions = $response.data.permissions
  apiKey = $response.data.key
  defaultConnectionId = $defaultConnectionId
  connections = $connections
}

$targetDir = Split-Path -Parent $OutputFile
if (-not [string]::IsNullOrWhiteSpace($targetDir) -and -not (Test-Path $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir | Out-Null
}

$existing = @()
if (Test-Path $OutputFile) {
  try {
    $raw = Get-Content $OutputFile -Raw
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
      $parsed = $raw | ConvertFrom-Json
      if ($parsed -is [System.Array]) {
        $existing = @($parsed)
      } elseif ($parsed) {
        $existing = @($parsed)
      }
    }
  } catch {
    Write-Warning "No se pudo leer el archivo existente. Se sobrescribira con un arreglo nuevo."
  }
}

$updated = @($existing) + [pscustomobject]$record
$updated | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputFile -Encoding UTF8

Write-Host ""
Write-Host "API key creada correctamente." -ForegroundColor Green
Write-Host "Tenant: $($record.clientId)"
Write-Host "API Key Id: $($record.apiKeyId)"
Write-Host "Name: $($record.name)"
Write-Host "API Key: $($record.apiKey)" -ForegroundColor Yellow
Write-Host "Guardada en: $OutputFile"

if ($connections.Count -gt 0) {
  Write-Host ""
  Write-Host "Conexiones disponibles para este tenant:" -ForegroundColor Cyan
  foreach ($connection in $connections) {
    $isDefault = $defaultConnectionId -and $connection.id -eq $defaultConnectionId
    $defaultLabel = if ($isDefault) { " | DEFAULT" } else { "" }
    Write-Host "- ConnectionId: $($connection.id) | SessionName: $($connection.sessionName) | Phone: $($connection.phone) | Status: $($connection.status)$defaultLabel"
  }

  if ($defaultConnectionId) {
    Write-Host ""
    Write-Host "ConnectionId por defecto: $defaultConnectionId" -ForegroundColor Green
  } else {
    Write-Host ""
    Write-Host "Este tenant no tiene una conexion por defecto configurada." -ForegroundColor DarkYellow
  }
} elseif ($IncludeConnections) {
  Write-Host ""
  Write-Host "No se encontraron conexiones para este tenant." -ForegroundColor DarkYellow
}
