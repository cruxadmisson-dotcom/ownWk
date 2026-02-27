const { createClient } = require('@supabase/supabase-js');

// --- Helper: Read Body Safely ---
const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        try {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', (err) => reject(err));
        } catch (e) {
            reject(e);
        }
    });
};

module.exports = async (req, res) => {
    // --- 1. CORS Headers (ALWAYS First) ---
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    // --- 2. Handle Preflight ---
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // --- 3. Env Var Check (Inside try-catch) ---
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.error("CRITICAL: Missing Vercel Environment Variables");
            return res.status(503).json({ 
                error: "Setup Required", 
                message: "Supabase-Schlüssel fehlen in Vercel. Bitte unter Settings -> Environment Variables eintragen.",
                missing_vars: true
            });
        }

        // --- 4. Init Supabase (Only if vars exist) ---
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // --- 5. Validate Method ---
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        // --- 6. Read Data ---
        const buffer = await getRawBody(req);
        if (!buffer || buffer.length === 0) {
            return res.status(400).json({ error: "Keine Daten empfangen (Body leer)" });
        }

        const fileName = req.headers['x-file-name'];
        const channelId = req.headers['x-channel-id'] || 'andere';
        const contentType = req.headers['content-type'] || '';
        const ip = req.headers['x-forwarded-for'] || 'unknown';
        const timestamp = new Date().toISOString();

        // --- 7. Process Logic ---
        
        // A) FILE UPLOAD
        if (fileName || contentType.includes('application/octet-stream')) {
            const safeFileName = `${Date.now()}_${fileName || 'unnamed_file'}`;
            
            // Upload to Storage
            const { error: storageError } = await supabase.storage
                .from('uploads')
                .upload(safeFileName, buffer, { 
                    contentType: contentType || 'application/octet-stream',
                    upsert: false
                });

            if (storageError) {
                console.error("Storage Error:", storageError);
                return res.status(500).json({ error: "Fehler beim Speichern der Datei: " + storageError.message });
            }

            // Get Link
            const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(safeFileName);
            const publicUrl = urlData.publicUrl;

            // Save Metadata
            const { error: dbError } = await supabase.from('events').insert([{
                type: 'upload',
                timestamp,
                name: fileName || 'file',
                size: buffer.length,
                path: publicUrl,
                content: channelId,
                headers: JSON.stringify({ ip })
            }]);

            if (dbError) throw dbError;
            return res.status(200).json({ success: true, type: 'upload' });
        } 
        
        // B) CHAT MESSAGE
        const rawContent = buffer.toString('utf-8');
        
        // Validate JSON
        let validContent = rawContent;
        try {
            const json = JSON.parse(rawContent);
            if (json.type === 'chat_message') {
                // Ensure content is not empty
                if (!json.content || !json.content.trim()) {
                    return res.status(400).json({ error: "Nachricht darf nicht leer sein" });
                }
                validContent = JSON.stringify(json);
            }
        } catch (e) {
            // Not JSON, just string
        }

        const { error: dbError } = await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: validContent,
            name: channelId,
            headers: JSON.stringify({ ip })
        }]);

        if (dbError) {
            console.error("DB Insert Error:", dbError);
            return res.status(500).json({ error: "Datenbank-Fehler: " + dbError.message });
        }

        return res.status(200).json({ success: true, type: 'message' });

    } catch (globalError) {
        console.error("CRITICAL HANDLER ERROR:", globalError);
        return res.status(500).json({ 
            error: "Interner Server Fehler", 
            details: globalError.message 
        });
    }
};

// Vercel Config
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
