// --- PURE NODE.JS LIST HANDLER (NO LIBRARIES) ---
const https = require('https');

// --- Helper: Supabase REST Request ---
const supabaseRequest = async (endpoint, method) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Missing Env Vars");

    const baseUrl = SUPABASE_URL.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/rest/v1/${endpoint}`);

    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve([]); // Fallback
                    }
                } else {
                    reject(new Error(`Supabase Error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
};

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Fetch events sorted by timestamp
        const data = await supabaseRequest('events?select=*&order=timestamp.asc', 'GET');

        if (!Array.isArray(data)) {
            return res.status(200).json([]);
        }

        const mappedData = data.map(item => ({
            type: item.type,
            timestamp: item.timestamp,
            content: item.content,
            name: item.name,
            size: item.size,
            path: item.path,
            headers: typeof item.headers === 'string' ? JSON.parse(item.headers) : (item.headers || {})
        }));

        res.status(200).json(mappedData);

    } catch (e) {
        console.error("List Error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
