const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Helper to get body buffer from stream
const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', err => reject(err));
    });
};

const handler = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const timestamp = new Date().toISOString();
    const contentType = req.headers['content-type'] || '';
    const fileName = req.headers['x-file-name'];
    const channelId = req.headers['x-channel-id'] || 'andere';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        // Read the stream ONCE
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
                    cacheControl: '3600',
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
            return res.status(200).json({ success: true, message: "File uploaded" });
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

        return res.status(200).json({ success: true, message: "Message saved" });
    } catch (error) {
        console.error("Webhook Handler Error:", error);
        return res.status(500).json({ 
            error: error.message, 
            details: "Please check Supabase connection and table structure." 
        });
    }
};

module.exports = handler;
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
