const https = require('https');

// --- CONFIG ---
// Load env vars (Vercel provides these automatically)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

// --- HELPERS ---
function sendRes(res, statusCode, data) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Channel-Id');

    res.statusCode = statusCode;
    if (typeof data === 'object') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    } else {
        res.end(data);
    }
}

function supabaseRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return reject(new Error('Missing Supabase Config'));
        }

        const url = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : null;
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject({ statusCode: res.statusCode, error: json });
                    }
                } catch (e) {
                    reject({ statusCode: res.statusCode, error: data });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    // Handle OPTIONS (CORS)
    if (req.method === 'OPTIONS') {
        return sendRes(res, 200, '');
    }

    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;
        
        // 1. HEALTH
        if (path.includes('/api/health')) {
            return sendRes(res, 200, { 
                status: "ok", 
                mode: "native-node",
                env_check: { url: !!SUPABASE_URL, key: !!SUPABASE_KEY }
            });
        }

        // 2. CHANNELS
        if (path.includes('/api/channels')) {
            if (req.method === 'GET') {
                try {
                    const data = await supabaseRequest('GET', 'channels?select=*&order=created_at.asc');
                    return sendRes(res, 200, data);
                } catch (err) {
                    // Fallback if table missing
                    return sendRes(res, 200, []);
                }
            }
            if (req.method === 'POST') {
                const { name } = req.body;
                if (!name) return sendRes(res, 400, { error: "Name required" });
                
                const data = await supabaseRequest('POST', 'channels', { name });
                return sendRes(res, 200, data[0]);
            }

            if (req.method === 'PATCH') {
                const id = path.split('/').pop();
                const { name } = req.body;
                if (!name) return sendRes(res, 400, { error: "Name required" });
                
                await supabaseRequest('PATCH', `channels?id=eq.${id}`, { name });
                return sendRes(res, 200, { success: true });
            }

            if (req.method === 'DELETE') {
                const id = path.split('/').pop();
                await supabaseRequest('DELETE', `channels?id=eq.${id}`);
                return sendRes(res, 200, { success: true });
            }
        }

        // 3. LIST MESSAGES
        if (path.includes('/api/list')) {
            const channelId = url.searchParams.get('channelId') || 'general';
            const limit = parseInt(url.searchParams.get('limit')) || 50; // Allow custom limit
            
            // If channel is 'file_storage', we might need specific filtering
            const fileId = url.searchParams.get('fileId');
            
            let endpoint = `events?select=*&path=eq.${channelId}`;
            
            if (fileId) {
                // If fetching chunks for a specific file
                // We assume headers contains the fileId. Since headers is text, we use ilike
                endpoint += `&headers=ilike.*${fileId}*&order=timestamp.asc&limit=1000`;
            } else {
                // Normal chat
                endpoint += `&order=timestamp.desc&limit=${limit}`;
            }

            const data = await supabaseRequest('GET', endpoint);
            return sendRes(res, 200, data);
        }

        // 3.1 MESSAGE MANAGEMENT
        if (path.includes('/api/messages')) {
            const id = path.split('/').pop();
            
            if (req.method === 'DELETE') {
                await supabaseRequest('DELETE', `events?id=eq.${id}`);
                return sendRes(res, 200, { success: true });
            }

            if (req.method === 'PATCH') {
                if (!supabase) return res.status(500).json({ error: "DB Config Missing" });
                const { content, reactions } = req.body;
                
                const updateData = {};
                if (content !== undefined) updateData.content = content;
                if (reactions !== undefined) updateData.headers = JSON.stringify(reactions); // Store reactions in 'headers' column for simplicity as JSON string
                
                const { error } = await supabase.from('events').update(updateData).eq('id', id);
                if (error) throw error;
                return sendRes(res, 200, { success: true });
            }
        }

        // 4. WEBHOOK
        if (path.includes('/api/webhook')) {
            if (req.method === 'GET') {
                return sendRes(res, 200, { type: 1, id: "123", name: "Hook", token: "fake" });
            }
            if (req.method === 'POST') {
                const body = req.body;
                const channelId = req.headers['x-channel-id'] || url.searchParams.get('channelId') || 'general';
                
                let content = body.content || '';
                // Support rich metadata in 'headers' column if provided (for file chunks)
                // If body.metadata exists, store it in headers column as JSON string
                let headersVal = null;
                if (body.metadata) {
                    headersVal = JSON.stringify(body.metadata);
                } else if (body.embeds && Array.isArray(body.embeds)) {
                    body.embeds.forEach(e => content += `\n${e.title || ''} ${e.description || ''}`);
                }

                await supabaseRequest('POST', 'events', {
                    type: 'message',
                    name: body.username || 'Webhook',
                    content: content,
                    path: channelId,
                    headers: headersVal
                });
                
                return sendRes(res, 204, '');
            }
        }

        return sendRes(res, 404, { error: "Not found" });

    } catch (error) {
        console.error("Handler Error:", error);
        return sendRes(res, 500, { error: error.message || "Internal Server Error" });
    }
};
