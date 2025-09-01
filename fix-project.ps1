# fix-project.ps1
Write-Host "=== Iniciando correção completa do projeto ===" -ForegroundColor Green

# 1. Remover node_modules com força
Write-Host "`n1. Removendo node_modules..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    cmd /c "rmdir /s /q node_modules" 2>$null
    if (Test-Path "node_modules") {
        Write-Host "Tentando remover com takeown..." -ForegroundColor Yellow
        cmd /c "takeown /f node_modules /r /d y" 2>$null
        cmd /c "icacls node_modules /grant administrators:F /t" 2>$null
        cmd /c "rmdir /s /q node_modules" 2>$null
    }
}

# 2. Remover package-lock.json
Write-Host "`n2. Removendo package-lock.json..." -ForegroundColor Yellow
Remove-Item "package-lock.json" -Force -ErrorAction SilentlyContinue

# 3. Fazer backup do package.json atual
Write-Host "`n3. Fazendo backup do package.json..." -ForegroundColor Yellow
Copy-Item "package.json" "package.json.backup" -Force

# 4. Criar novo package.json limpo (sem BOM e com encoding correto)
Write-Host "`n4. Criando package.json limpo..." -ForegroundColor Yellow
$packageContent = @'
{
  "name": "whatsapp-auto-react-desktop",
  "version": "1.0.0",
  "description": "WhatsApp Auto React Desktop Application",
  "main": "src/main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win",
    "dist:win32": "electron-builder --win --ia32",
    "dist:win64": "electron-builder --win --x64"
  },
  "keywords": ["whatsapp", "automation", "electron"],
  "author": "Diego Fagundes",
  "license": "MIT",
  "devDependencies": {
    "electron": "^27.0.0",
    "electron-builder": "^24.6.4"
  },
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "qrcode-terminal": "^0.12.0",
    "electron-store": "^8.1.0"
  },
  "build": {
    "appId": "com.diegofagundes.whatsappreact",
    "productName": "WhatsApp Auto React",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64", "ia32"]
        }
      ],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "assets/icon.ico",
      "uninstallerIcon": "assets/icon.ico",
      "installerHeaderIcon": "assets/icon.ico",
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "license": "LICENSE.txt"
    }
  }
}
'@

# Salvar sem BOM e com UTF-8
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$PWD\package.json", $packageContent, $utf8NoBom)

Write-Host "package.json criado com sucesso!" -ForegroundColor Green

# 5. Limpar cache do npm
Write-Host "`n5. Limpando cache do npm..." -ForegroundColor Yellow
npm cache clean --force

# 6. Instalar dependências
Write-Host "`n6. Instalando dependências..." -ForegroundColor Yellow
npm install --force

# 7. Verificar se electron-builder foi instalado
Write-Host "`n7. Verificando electron-builder..." -ForegroundColor Yellow
if (!(Test-Path "node_modules\.bin\electron-builder.cmd")) {
    Write-Host "electron-builder não encontrado, instalando globalmente..." -ForegroundColor Yellow
    npm install -g electron-builder
}

# 8. Criar estrutura de pastas necessária
Write-Host "`n8. Criando estrutura de pastas..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "src" | Out-Null
New-Item -ItemType Directory -Force -Path "assets" | Out-Null

# 9. Criar arquivo main.js básico se não existir
if (!(Test-Path "src\main.js")) {
    Write-Host "Criando main.js básico..." -ForegroundColor Yellow
    $mainJs = @'
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('src/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
'@
    $mainJs | Out-File -FilePath "src\main.js" -Encoding UTF8
}

# 10. Criar index.html básico se não existir
if (!(Test-Path "src\index.html")) {
    Write-Host "Criando index.html básico..." -ForegroundColor Yellow
    $indexHtml = @'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>WhatsApp Auto React</title>
</head>
<body>
    <h1>WhatsApp Auto React Desktop</h1>
    <div id="app"></div>
</body>
</html>
'@
    $indexHtml | Out-File -FilePath "src\index.html" -Encoding UTF8
}

Write-Host "`n=== Correção concluída! ===" -ForegroundColor Green
Write-Host "`nAgora você pode executar:" -ForegroundColor Cyan
Write-Host "  npm start     - Para testar o aplicativo" -ForegroundColor White
Write-Host "  npm run dist  - Para criar o instalador" -ForegroundColor White