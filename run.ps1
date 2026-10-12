# run.ps1 - Pharmacy APP Backend Microservices Launcher

# Ensure execution policy allows running this script locally in this session if needed
# Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# Load environment variables from .env, then .env.local (git-ignored local secrets such as
# GROQ_API_KEY), so values in .env.local win.
foreach ($envFile in @(".env", ".env.local")) {
  if (Test-Path "$PSScriptRoot\$envFile") {
    Write-Host "Loading environment variables from $envFile..." -ForegroundColor Gray
    Get-Content "$PSScriptRoot\$envFile" | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
        $parts = $_ -split '=', 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
            if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
            [System.Environment]::SetEnvironmentVariable($key, $val, [System.EnvironmentVariableTarget]::Process)
        }
    }
  }
}

# Helper function to free a port before starting a service
function Free-Port {
    param([int]$Port)
    $lines = netstat -ano 2>$null | Select-String ":$Port " | Where-Object { $_ -match "LISTENING" }
    if ($lines) {
        foreach ($line in $lines) {
            $parts = ($line.ToString()).Trim() -split '\s+'
            $pid_ = $parts[-1]
            if ($pid_ -match '^\d+$' -and [int]$pid_ -gt 0) {
                Write-Host "  [AutoFix] Killing PID $pid_ occupying port $Port..." -ForegroundColor DarkYellow
                taskkill /F /PID $pid_ 2>$null | Out-Null
            }
        }
        Start-Sleep -Seconds 1
    }
}

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "            PHARMACY APP BACKEND LAUNCHER              " -ForegroundColor Yellow -BackgroundColor DarkBlue
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Select a service to run:" -ForegroundColor Green
Write-Host "1) API Gateway (Port 8089)" -ForegroundColor Gray
Write-Host "2) Auth Service (Port 8081)"
Write-Host "3) Product Service (Port 8082)"
Write-Host "4) Cart Service (Port 8083)"
Write-Host "5) Order Service (Port 8084)"
Write-Host "6) Payment Service (Port 8085)"
Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "7) RUN ALL SERVICES & Open Swagger UI Dashboard (http://localhost:8089/swagger-ui.html)" -ForegroundColor Yellow
Write-Host "8) KILL ALL JAVA PROCESSES (free all ports)" -ForegroundColor Red
Write-Host "9) Exit"
Write-Host ""

$choice = Read-Host "Enter your choice [1-9]"

switch ($choice) {
    "1" {
        Write-Host "Freeing port 8089..." -ForegroundColor Gray
        Free-Port 8089
        Write-Host "Starting API Gateway..." -ForegroundColor Yellow
        .\mvnw spring-boot:run -pl api-gateway
    }
    "2" {
        Write-Host "Freeing port 8081..." -ForegroundColor Gray
        Free-Port 8081
        Write-Host "Starting Auth Service..." -ForegroundColor Yellow
        .\mvnw spring-boot:run -pl auth-service
    }
    "3" {
        Write-Host "Freeing port 8082..." -ForegroundColor Gray
        Free-Port 8082
        Write-Host "Starting Product Service..." -ForegroundColor Yellow
        .\mvnw spring-boot:run -pl product-service
    }
    "4" {
        Write-Host "Freeing port 8083..." -ForegroundColor Gray
        Free-Port 8083
        Write-Host "Starting Cart Service..." -ForegroundColor Yellow
        .\mvnw spring-boot:run -pl cart-service
    }
    "5" {
        Write-Host "Freeing port 8084..." -ForegroundColor Gray
        Free-Port 8084
        Write-Host "Starting Order Service..." -ForegroundColor Yellow
        .\mvnw spring-boot:run -pl order-service
    }
    "6" {
        Write-Host "Freeing port 8085..." -ForegroundColor Gray
        Free-Port 8085
        Write-Host "Starting Payment Service..." -ForegroundColor Yellow
        .\mvnw spring-boot:run -pl payment-service
    }
    "7" {
        Write-Host "Freeing all service ports first..." -ForegroundColor DarkYellow
        Free-Port 8081
        Free-Port 8082
        Free-Port 8083
        Free-Port 8084
        Free-Port 8085
        Free-Port 8089
        Write-Host ""
        Write-Host "Launching all microservices in separate windows..." -ForegroundColor Yellow
 
        Write-Host "-> Launching Auth Service..." -ForegroundColor Cyan
        Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='1. Auth Service'; .\mvnw spring-boot:run -pl auth-service"
 
        Write-Host "-> Launching Product Service..." -ForegroundColor Cyan
        Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='2. Product Service'; .\mvnw spring-boot:run -pl product-service"
 
        Write-Host "-> Launching Cart Service..." -ForegroundColor Cyan
        Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='3. Cart Service'; .\mvnw spring-boot:run -pl cart-service"
 
        Write-Host "-> Launching Order Service..." -ForegroundColor Cyan
        Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='4. Order Service'; .\mvnw spring-boot:run -pl order-service"
 
        Write-Host "-> Launching Payment Service..." -ForegroundColor Cyan
        Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='5. Payment Service'; .\mvnw spring-boot:run -pl payment-service"
 
        Write-Host "Waiting 5 seconds for services to initialize..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
 
        Write-Host "-> Launching API Gateway..." -ForegroundColor Cyan
        Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='6. API Gateway'; .\mvnw spring-boot:run -pl api-gateway"
 
        Write-Host "Waiting 3 seconds for API Gateway to bind to port 8089..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
 
        Write-Host "Opening Unified Swagger UI Dashboard in default browser..." -ForegroundColor Yellow
        Start-Process "http://localhost:8089/swagger-ui.html"
 
        Write-Host "All services launched! You can monitor them in the separate PowerShell windows." -ForegroundColor Green
    }
    "8" {
        Write-Host "Killing ALL Java processes (freeing all ports)..." -ForegroundColor Red
        taskkill /F /IM java.exe 2>$null
        Write-Host "All Java processes terminated." -ForegroundColor Green
        Write-Host "You can now restart services cleanly." -ForegroundColor Cyan
    }
    "9" {
        Write-Host "Exiting launcher." -ForegroundColor Gray
    }
    default {
        Write-Host "Invalid choice! Please select a number between 1 and 9." -ForegroundColor Red
    }
}