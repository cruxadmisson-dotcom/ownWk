# 24/7 Custom Webhook System (Vercel + Supabase)

Ein privates Webhook-System, das Dateien und Nachrichten empfängt und dauerhaft in der Cloud speichert. **Keine Kreditkarte für das Hosting erforderlich.**

## Komponenten

- **`/api/webhook.js`**: Empfängt POST-Requests (JSON oder Dateien) und sendet sie an Supabase.
- **`/api/list.js`**: Holt die Liste aller Ereignisse aus der Datenbank.
- **`/public/index.html`**: Das Dashboard (Discord-Style), um alles 24/7 live zu verfolgen.

## 24/7 Deployment Anleitung (Schritt-für-Schritt)

### 1. Supabase (Datenbank & Speicher)
Supabase dient als dein kostenloser Cloud-Speicher für Nachrichten und Dateien.
1. Melde dich bei [supabase.com](https://supabase.com/) mit GitHub an.
2. Erstelle ein Projekt (z.B. `webhook-cloud`).
3. Gehe zum **SQL Editor** (linkes Menü) und führe diesen Code aus:
   ```sql
   create table events (
     id serial primary key,
     timestamp timestamp with time zone default now(),
     type text,
     name text,
     size bigint,
     path text,
     content text,
     headers text
   );
   ```
4. Gehe zu **Storage** -> **New Bucket**. Name: `uploads`. Setze den Bucket auf **Public**.
5. Gehe zu **Settings** -> **API** und kopiere die `Project URL` und den `anon key`.

### 2. GitHub (Code Hosting)
1. Erstelle ein neues privates oder öffentliches Repository auf GitHub.
2. Lade diesen Code hoch:
   ```bash
   git add .
   git commit -m "Vercel + Supabase deployment"
   git push origin main
   ```

### 3. Vercel (24/7 Hosting)
1. Melde dich bei [vercel.com](https://vercel.com/) mit GitHub an.
2. Klicke auf **"Add New"** -> **"Project"** und wähle dein Repo aus.
3. Füge unter **Environment Variables** diese zwei hinzu:
   - `SUPABASE_URL`: (Deine Supabase URL)
   - `SUPABASE_ANON_KEY`: (Dein Anon Key)
4. Klicke auf **"Deploy"**.

## Nutzung
- Dein Webhook-Endpunkt ist: `https://DEIN-PROJEKT.vercel.app/api/webhook`
- Dein Dashboard ist unter der gleichen URL erreichbar.
- Das Dashboard aktualisiert sich alle 5 Sekunden automatisch.

## Lokale Entwicklung (Optional)
- Installiere Node.js.
- Führe `npm install` aus.
- Erstelle eine `.env` Datei mit deinen Supabase-Daten.
- Starte mit `npm start`.
