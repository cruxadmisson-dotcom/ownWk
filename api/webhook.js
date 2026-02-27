const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Configuration to disable Vercel's automatic body parsing
// This must be at the top level
module.exports.config = {
    api: {
        bodyParser: false,
    },
};

const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', err => reject(err));
    });
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const timestamp = new Date().toISOString();
    const contentType = req.headers['content-type'] || '';
    const fileName = req.headers['x-file-name'] || `file_${Date.now()}`;
    const channelId = req.headers['x-channel-id'] || 'general';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        const buffer = await getRawBody(req);
        
        // --- CASE 1: FILE UPLOAD ---
        if (contentType.includes('application/octet-stream') || req.headers['x-file-name']) {
            const safeFileName = `${Date.now()}_${fileName}`;
            
            const { error: storageError } = await supabase.storage
                .from('uploads')
                .upload(safeFileName, buffer, { contentType: contentType || 'application/octet-stream' });

            if (storageError) throw storageError;

            const publicUrl = supabase.storage.from('uploads').getPublicUrl(safeFileName).data.publicUrl;

            await supabase.from('events').insert([{
                type: 'upload',
                timestamp,
                name: fileName,
                size: buffer.length,
                path: publicUrl,
                content: channelId, // Reuse content column for channelId
                headers: JSON.stringify({ ...req.headers, ip: ip })
            }]);

            return res.status(200).send('File received and saved');
        } 
        
        // --- CASE 2: WEBHOOK OR CHAT MESSAGE ---
        let content = buffer.toString();
        
        await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: content,
            name: channelId, // Reuse name column for channelId
            headers: JSON.stringify({ ...req.headers, ip: ip })
        }]);

        res.status(200).send('Data received and saved');

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ error: error.message });
    }
};
