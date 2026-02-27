const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Helper to parse body if it's not already parsed
const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => resolve(body));
        req.on('error', err => reject(err));
    });
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name');

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

    try {
        // If it's a direct file stream (octet-stream) or we have a file name header
        if (contentType.includes('application/octet-stream') || req.headers['x-file-name']) {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const safeFileName = `${Date.now()}_${fileName}`;
            
            // Upload to Storage
            const { error: storageError } = await supabase.storage
                .from('uploads')
                .upload(safeFileName, buffer, { contentType: contentType || 'application/octet-stream' });

            if (storageError) throw storageError;

            const publicUrl = supabase.storage.from('uploads').getPublicUrl(safeFileName).data.publicUrl;

            // Save to DB
            await supabase.from('events').insert([{
                type: 'upload',
                timestamp,
                name: fileName,
                size: buffer.length,
                path: publicUrl
            }]);

            return res.status(200).send('File received and saved');
        } 
        
        // Otherwise handle as a normal data webhook
        const rawBody = await getRawBody(req);
        let content = rawBody;
        
        // Try to parse as JSON if possible for better storage
        try {
            const json = JSON.parse(rawBody);
            content = JSON.stringify(json, null, 2);
        } catch (e) {
            // Stay as raw string
        }

        await supabase.from('events').insert([{
            type: 'webhook',
            timestamp,
            content: content,
            headers: JSON.stringify(req.headers)
        }]);

        res.status(200).send('Data received and saved');

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ error: error.message });
    }
};
