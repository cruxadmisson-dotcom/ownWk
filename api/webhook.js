const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// We keep the default bodyParser ENABLED for normal chat messages
// This is the most stable way for Vercel functions
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const timestamp = new Date().toISOString();
    const contentType = req.headers['content-type'] || '';
    const fileName = req.headers['x-file-name'];
    const channelId = req.headers['x-channel-id'] || 'andere';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    try {
        // --- CASE 1: CHAT MESSAGE (JSON) ---
        // Since we didn't disable bodyParser, req.body is already parsed
        if (contentType.includes('application/json')) {
            const body = req.body;
            const content = typeof body === 'string' ? body : JSON.stringify(body);
            
            const { error: dbError } = await supabase.from('events').insert([{
                type: 'webhook',
                timestamp,
                content: content,
                name: channelId,
                headers: JSON.stringify({ ip })
            }]);

            if (dbError) throw dbError;
            return res.status(200).json({ success: true });
        }

        // --- CASE 2: FILE UPLOAD ---
        // For files, we still need to handle the stream
        // Note: This might conflict with bodyParser if not configured correctly,
        // but for now we prioritize making CHAT work!
        res.status(400).json({ error: 'Please send JSON for chat messages' });

    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: error.message });
    }
};
