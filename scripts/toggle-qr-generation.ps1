param(
  [Parameter(Mandatory = $false)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status',

  [Parameter(Mandatory = $false)]
  [string]$ApiBaseUrl = 'https://ancient-ocean-78301-96aad9a4957a.herokuapp.com',

  [Parameter(Mandatory = $false)]
  [string]$MasterApiKey = ''
)

$ErrorActionPreference = 'Stop'

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

  $value = ($line -split '=', 2)[1].Trim()
  return $value.Trim('"').Trim("'")
}

if ([string]::IsNullOrWhiteSpace($MasterApiKey)) {
  if ($env:API_KEY) {
    $MasterApiKey = $env:API_KEY
  } else {
    $projectEnvPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
    $MasterApiKey = Get-EnvValueFromFile -FilePath $projectEnvPath -Key 'API_KEY'
  }
}

if ([string]::IsNullOrWhiteSpace($MasterApiKey)) {
  throw 'Debes enviar -MasterApiKey, definir API_KEY como variable de entorno o en el .env del proyecto.'
}

$normalizedBaseUrl = $ApiBaseUrl.TrimEnd('/')
$endpoint = "$normalizedBaseUrl/api/session/qr-generation"
$headers = @{
  'Content-Type' = 'application/json'
  'X-API-Key' = $MasterApiKey
}

switch ($Action) {
  'status' {
    $response = Invoke-RestMethod -Method Get -Uri $endpoint -Headers $headers
    $enabled = [bool]$response.data.enabled
    $stateText = if ($enabled) { 'ACTIVA' } else { 'DETENIDA' }

    Write-Host "Estado de generacion de QR: $stateText" -ForegroundColor Cyan
    if (-not $enabled) {
      Write-Host 'Las conexiones ya establecidas continúan operando normalmente.' -ForegroundColor DarkYellow
    }
  }

  'start' {
    $body = @{ enabled = $true } | ConvertTo-Json
    $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $body
    Write-Host ($response.message | Out-String).Trim() -ForegroundColor Green
    Write-Host 'Nuevas solicitudes de QR quedan habilitadas.' -ForegroundColor Green
  }

  'stop' {
    $body = @{ enabled = $false } | ConvertTo-Json
    $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $body
    Write-Host ($response.message | Out-String).Trim() -ForegroundColor Yellow
    Write-Host 'Las conexiones ya establecidas se mantienen; solo se bloquea entrega/inicializacion de QR.' -ForegroundColor Yellow
  }
}
