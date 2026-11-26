$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    Write-Host 'Validando SLENDER: THE 8 PAGES...' -ForegroundColor Cyan
    node .\scripts\validate-project.mjs
    if ($LASTEXITCODE -ne 0) {
        throw 'La validación encontró errores. Revisa el detalle anterior.'
    }
    Write-Host 'Validación finalizada correctamente.' -ForegroundColor Green
}
finally {
    Pop-Location
}
