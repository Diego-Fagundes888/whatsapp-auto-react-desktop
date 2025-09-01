Write-Host "=== Preparando arquivos para build ===" -ForegroundColor Green

# 1. Criar LICENSE.txt
Write-Host "`n1. Criando LICENSE.txt..." -ForegroundColor Yellow
@'
MIT License

Copyright (c) 2024 Diego Fagundes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'@ | Out-File -FilePath "LICENSE.txt" -Encoding UTF8

Write-Host "LICENSE.txt criado!" -ForegroundColor Green

# 2. Atualizar package.json sem ícone (temporário)
Write-Host "`n2. Atualizando package.json..." -ForegroundColor Yellow
$packageContent = Get-Content "package.json" -Raw | ConvertFrom-Json

# Remover referências ao ícone se não existir
if (!(Test-Path "assets\icon.ico")) {
    Write-Host "Removendo referências ao ícone (não encontrado)..." -ForegroundColor Yellow
    $packageContent.build.win.PSObject.Properties.Remove("icon")
    $packageContent.build.nsis.PSObject.Properties.Remove("installerIcon")
    $packageContent.build.nsis.PSObject.Properties.Remove("uninstallerIcon")
    $packageContent.build.nsis.PSObject.Properties.Remove("installerHeaderIcon")
}

# Salvar package.json atualizado
$packageContent | ConvertTo-Json -Depth 10 | Out-File -FilePath "package.json" -Encoding UTF8
Write-Host "package.json atualizado!" -ForegroundColor Green

# 3. Verificar estrutura de pastas
Write-Host "`n3. Verificando estrutura..." -ForegroundColor Yellow
$required = @("src", "src/main.js", "src/index.html", "LICENSE.txt")
$missing = @()

foreach ($item in $required) {
    if (!(Test-Path $item)) {
        $missing += $item
        Write-Host "  ❌ $item está faltando" -ForegroundColor Red
    } else {
        Write-Host "  ✓ $item OK" -ForegroundColor Green
    }
}

if ($missing.Count -eq 0) {
    Write-Host "`n✅ Tudo pronto para o build!" -ForegroundColor Green
    Write-Host "`nExecute: npm run dist" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠ Alguns arquivos estão faltando!" -ForegroundColor Yellow
}