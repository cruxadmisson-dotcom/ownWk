# Integration Beispiel für PowerShell
# Nutze diesen Code, um Dateien direkt aus Windows an deinen Webhook zu senden.

$webhookUrl = "https://own-wk.vercel.app/api/webhook"
$filePath = "C:\pfad\zu\deiner\datei.zip"

if (Test-Path $filePath) {
    $fileName = Split-Path $filePath -Leaf
    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)

    Write-Host "Sende $fileName an Webhook..."
    
    $headers = @{
        "Content-Type" = "application/octet-stream"
        "X-File-Name" = $fileName
    }

    $response = Invoke-RestMethod -Uri $webhookUrl -Method Post -Headers $headers -Body $fileBytes
    Write-Host "Antwort: $response"
} else {
    Write-Host "Datei nicht gefunden!"
}
