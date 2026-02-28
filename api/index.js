// Minimal API for Vercel
const { createClient } = require('@supabase/supabase-js');

// Init Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Channel-Id'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const path = req.url.split('?')[0];
        
        // 1. HEALTH CHECK
        if (path === '/api/health') {
            if (!supabase) return res.status(500).json({ status: "error", error: "Missing Supabase Config" });
            const { error } = await supabase.from('channels').select('count', { count: 'exact', head: true });
            if (error) return res.status(500).json({ status: "db_error", details: error });
            return res.json({ status: "ok", db: "connected" });
        }

        // 2. LIST MESSAGES
        if (path === '/api/list') {
            if (!supabase) return res.status(500).json({ error: "DB Config Missing" });
            const channelId = req.query.channelId || 'general';
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('path', channelId)
                .order('timestamp', { ascending: false })
                .limit(50);
            
            if (error) throw error;
            return res.json(data || []);
        }

        // 3. CHANNELS (GET / POST / DELETE)
        if (path.startsWith('/api/channels')) {
            if (!supabase) return res.status(500).json({ error: "DB Config Missing" });
            
            if (req.method === 'GET') {
                const { data, error } = await supabase.from('channels').select('*').order('created_at', { ascending: true });
                if (error) {
                    if (error.code === '42P01') return res.json([]); // Table missing -> empty list
                    throw error;
                }
                return res.json(data);
            }

            if (req.method === 'POST') {
                const { name } = req.body;
                if (!name) return res.status(400).json({ error: "Name required" });
                const { data, error } = await supabase.from('channels').insert([{ name }]).select();
                if (error) throw error;
                return res.json(data[0]);
            }

            if (req.method === 'DELETE') {
                const id = path.split('/').pop();
                const { error } = await supabase.from('channels').delete().eq('id', id);
                if (error) throw error;
                return res.json({ success: true });
            }
        }

        // 4. WEBHOOK (POST / GET)
        if (path === '/api/webhook') {
            if (req.method === 'GET') {
                return res.json({
                    type: 1, id: "1234567890", name: "Captain Hook", channel_id: "123", guild_id: "123", token: "fake"
                });
            }

            if (req.method === 'POST') {
                if (!supabase) return res.status(500).json({ error: "DB Config Missing" });
                
                const { content, embeds, username } = req.body;
                const channelId = req.headers['x-channel-id'] || req.query.channelId || 'general';
                
                let finalContent = content || '';
                if (embeds && Array.isArray(embeds)) {
                    embeds.forEach(e => {
                        if (e.title) finalContent += `\n**${e.title}**`;
                        if (e.description) finalContent += `\n${e.description}`;
                    });
                }

                const { error } = await supabase.from('events').insert([{
                    type: 'message',
                    name: username || 'Webhook',
                    content: finalContent,
                    path: channelId
                }]);

                if (error) throw error;
                return res.status(204).end();
            }
        }

        // 404
        res.status(404).json({ error: "Not Found", path });

    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: err.message });
    }
};
