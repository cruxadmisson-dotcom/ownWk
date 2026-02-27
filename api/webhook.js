const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// We RE-ENABLE bodyParser to make chat messages easy, 
// but we handle files via the raw request if needed.
module.exports = async (req, res) => {
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
        // --- CASE 1: FILE UPLOAD (handled as stream) ---
        if (fileName || contentType.includes('application/octet-stream')) {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const safeFileName = `${Date.now()}_${fileName || 'file'}`;
            
            const { error: storageError } = await supabase.storage
                .from('uploads')
                .upload(safeFileName, buffer, { contentType: contentType || 'application/octet-stream' });

            if (storageError) throw storageError;

            const publicUrl = supabase.storage.from('uploads').getPublicUrl(safeFileName).data.publicUrl;

            await supabase.from('events').insert([{
                type: 'upload',
                timestamp,
                name: fileName || 'file',
                size: buffer.length,
                path: publicUrl,
                content: channelId,
                headers: JSON.stringify({ ip })
            }]);

            return res.status(200).send('OK');
        } 
        
        // --- CASE 2: CHAT MESSAGE OR JSON (handled by Vercel's default parser) ---
        // Vercel parses JSON automatically if bodyParser is not disabled.
        const body = req.body;
        const content = typeof body === 'object' ? JSON.stringify(body) : body.toString();

        await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: content,
            name: channelId,
            headers: JSON.stringify({ ip })
        }]);

        res.status(200).send('OK');
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: error.message });
    }
};
