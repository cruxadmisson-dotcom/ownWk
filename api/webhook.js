const { createClient } = require('@supabase/supabase-js');

// --- Helper: Safe Supabase Client ---
// We initialize this lazily or with placeholders to prevent
// the function from crashing on boot if env vars are missing.
const getSupabase = () => {
    const url = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = process.env.SUPABASE_ANON_KEY || 'placeholder';
    return createClient(url, key);
};

// --- Helper: Read Raw Body ---
const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
    });
};

// --- Main Handler ---
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Check Env Vars (Graceful Failure)
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error("Missing Supabase Environment Variables!");
        // We return 500 but as JSON, so the client can show a helpful error
        return res.status(500).json({ 
            error: "Server Configuration Error", 
            details: "SUPABASE_URL or SUPABASE_ANON_KEY is missing in Vercel Settings." 
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const timestamp = new Date().toISOString();
    const contentType = req.headers['content-type'] || '';
    const fileName = req.headers['x-file-name'];
    const channelId = req.headers['x-channel-id'] || 'andere';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    try {
        const supabase = getSupabase();
        const buffer = await getRawBody(req);
        
        if (!buffer || buffer.length === 0) {
            return res.status(400).json({ error: "Empty request body" });
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
        
        // --- CASE 2: CHAT MESSAGE ---
        const rawContent = buffer.toString('utf-8');
        
        // Try to parse JSON to ensure it's valid, but store string
        let contentToStore = rawContent;
        try {
            const json = JSON.parse(rawContent);
            // If it's our own chat format
            if (json.type === 'chat_message') {
                contentToStore = JSON.stringify(json);
            }
        } catch (e) {
            // It's just a string, keep as is
        }

        const { error: dbError } = await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: contentToStore,
            name: channelId,
            headers: JSON.stringify({ ip })
        }]);

        if (dbError) throw dbError;
        return res.status(200).json({ success: true, type: 'message' });

    } catch (error) {
        console.error("Handler Error:", error);
        return res.status(500).json({ error: error.message });
    }
};

// Vercel Config: Disable Body Parser
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
