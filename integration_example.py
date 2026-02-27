# Integration Beispiel für deinen Webhook
# Kopiere diesen Code in deine Software, um ZIP-Dateien und Daten zu senden.

import requests
import os

WEBHOOK_URL = "https://own-wk.vercel.app/api/webhook"

def send_to_webhook(file_path):
    if not os.path.exists(file_path):
        print(f"Datei {file_path} nicht gefunden!")
        return

    file_name = os.path.basename(file_path)
    
    print(f"Sende {file_name} an Webhook...")
    
    with open(file_path, 'rb') as f:
        # Wir senden die Datei als 'application/octet-stream' 
        # und packen den Namen in den Header 'X-File-Name'
        headers = {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': file_name
        }
        
        response = requests.post(WEBHOOK_URL, data=f, headers=headers)
        
        if response.status_code == 200:
            print("Erfolgreich gesendet! Schau in dein Dashboard.")
        else:
            print(f"Fehler: {response.status_code}")
            print(response.text)

# Beispiel Nutzung:
# send_to_webhook("daten.zip")
