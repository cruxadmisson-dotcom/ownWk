const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Env Check
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(503).json({ error: "Setup Required", missing_vars: true });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('timestamp', { ascending: true });

        if (error) {
            console.error("List DB Error:", error);
            return res.status(500).json({ error: "DB Error: " + error.message });
        }

        if (!data) return res.status(200).json([]);

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
        console.error("Critical List Error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
