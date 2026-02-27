const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

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
    
    // Check if it's a multipart (file upload) or JSON
    const contentType = req.headers['content-type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
        const busboy = Busboy({ headers: req.headers });
        
        busboy.on('file', async (fieldname, file, info) => {
            const { filename, encoding, mimeType } = info;
            const safeFileName = `${Date.now()}_${filename}`;
            
            // Upload to Supabase Storage
            const chunks = [];
            for await (const chunk of file) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            
            const { data, error } = await supabase.storage
                .from('uploads')
                .upload(safeFileName, buffer, { contentType: mimeType });

            if (error) {
                console.error('Storage error:', error);
                return res.status(500).send('Storage Error');
            }

            // Save metadata to database
            const { error: dbError } = await supabase
                .from('events')
                .insert([{
                    type: 'upload',
                    timestamp,
                    name: filename,
                    size: buffer.length,
                    path: supabase.storage.from('uploads').getPublicUrl(safeFileName).data.publicUrl
                }]);

            if (dbError) console.error('DB error:', dbError);
            res.status(200).send(`File uploaded successfully as ${safeFileName}`);
        });

        req.pipe(busboy);
    } else {
        // Handle JSON Webhook
        const body = req.body;
        const { error: dbError } = await supabase
            .from('events')
            .insert([{
                type: 'webhook',
                timestamp,
                content: typeof body === 'string' ? body : JSON.stringify(body),
                headers: JSON.stringify(req.headers)
            }]);

        if (dbError) {
            console.error('DB error:', dbError);
            return res.status(500).send('Database Error');
        }
        res.status(200).send('Webhook received successfully');
    }
};
