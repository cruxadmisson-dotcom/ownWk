const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', err => reject(err));
    });
};

const handler = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const timestamp = new Date().toISOString();
    const contentType = req.headers['content-type'] || '';
    const fileName = req.headers['x-file-name'] || `file_${Date.now()}`;
    const channelId = req.headers['x-channel-id'] || 'andere';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        const buffer = await getRawBody(req);
        
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
                content: channelId,
                headers: JSON.stringify({ ...req.headers, ip: ip })
            }]);

            return res.status(200).send('File received');
        } 
        
        const content = buffer.toString();
        await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: content,
            name: channelId,
            headers: JSON.stringify({ ...req.headers, ip: ip })
        }]);

        res.status(200).send('Saved');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
