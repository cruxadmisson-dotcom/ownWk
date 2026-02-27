// --- PURE NODE.JS WEBHOOK HANDLER (NO LIBRARIES) ---
const https = require('https');

// --- Helper: Get Body ---
const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
    });
};

// --- Helper: Supabase REST Request ---
const supabaseRequest = async (endpoint, method, body) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Missing Env Vars");

    // Clean URL
    const baseUrl = SUPABASE_URL.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/rest/v1/${endpoint}`);

    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`Supabase Error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const buffer = await getRawBody(req);
        const rawContent = buffer.toString('utf-8');
        
        // Simple JSON validation
        let validContent = rawContent;
        try {
            const json = JSON.parse(rawContent);
            if (json.type === 'chat_message') {
                validContent = JSON.stringify(json);
            }
        } catch(e) {}

        const channelId = req.headers['x-channel-id'] || 'andere';
        const ip = req.headers['x-forwarded-for'] || 'unknown';

        // Insert into 'events' table using pure REST
        await supabaseRequest('events', 'POST', {
            type: 'webhook',
            timestamp: new Date().toISOString(),
            content: validContent,
            name: channelId,
            headers: JSON.stringify({ ip })
        });

        res.status(200).json({ success: true });

    } catch (error) {
        console.error("Handler Error:", error);
        res.status(500).json({ error: error.message });
    }
};

module.exports.config = {
    api: {
        bodyParser: false,
    },
};
