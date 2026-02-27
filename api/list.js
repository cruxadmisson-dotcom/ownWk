const { createClient } = require('@supabase/supabase-js');

// --- Helper: Safe Supabase Client ---
const getSupabase = () => {
    const url = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = process.env.SUPABASE_ANON_KEY || 'placeholder';
    return createClient(url, key);
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const supabase = getSupabase();
        
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('timestamp', { ascending: true });

        if (error) {
            // Check if it's a URL/Key error
            if (error.message && error.message.includes("supabaseUrl")) {
                console.error("Supabase Config Error:", error);
                return res.status(500).json({ error: "Server Configuration Error: Check Env Vars" });
            }
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!data) {
            return res.status(200).json([]);
        }

        // Map events to the structure expected by the frontend
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
    } catch (error) {
        console.error('List API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
