import { createClient } from '@supabase/supabase-js';

// --- Environment Variable Check ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing Supabase environment variables!");
}

const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY || 'placeholder'
);

export const config = {
    api: {
        bodyParser: false,
    },
};

// Robust buffer reading
const getRawBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Health Check / Debug Endpoint
    if (req.method === 'GET') {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(500).json({ error: "Supabase Environment Variables Missing on Server" });
        }
        return res.status(200).json({ status: "Webhook is online", timestamp: new Date().toISOString() });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // Check Env Vars before processing
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({ error: "Server Configuration Error: Missing Supabase Keys" });
    }

    const timestamp = new Date().toISOString();
    const contentType = req.headers['content-type'] || '';
    const fileName = req.headers['x-file-name'];
    const channelId = req.headers['x-channel-id'] || 'andere';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    try {
        const buffer = await getRawBody(req);
        
        if (!buffer || buffer.length === 0) {
            return res.status(400).json({ error: "No data received in body" });
        }

        // --- CASE 1: FILE UPLOAD ---
        if (fileName || contentType.includes('application/octet-stream')) {
            const safeFileName = `${Date.now()}_${fileName || 'file'}`;
            
            const { error: storageError } = await supabase.storage
                .from('uploads')
                .upload(safeFileName, buffer, { 
                    contentType: contentType || 'application/octet-stream',
                    upsert: false
                });

            if (storageError) throw storageError;

            const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(safeFileName);

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
        
        // --- CASE 2: CHAT MESSAGE OR JSON WEBHOOK ---
        const rawContent = buffer.toString('utf-8');
        
        const { error: dbError } = await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: rawContent,
            name: channelId,
            headers: JSON.stringify({ ip })
        }]);

        if (dbError) throw dbError;
        return res.status(200).json({ success: true, type: 'message' });

    } catch (error) {
        console.error("Critical Error:", error);
        return res.status(500).json({ error: error.message, details: "Check server logs" });
    }
}
