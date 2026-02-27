const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Database Error:', error);
            return res.status(500).json({ error: 'Database Error' });
        }

        const webhooks = data.filter(item => item.type === 'webhook').map(item => ({
            timestamp: item.timestamp,
            body: item.content,
            headers: JSON.parse(item.headers || '{}')
        }));

        const uploads = data.filter(item => item.type === 'upload').map(item => ({
            name: item.name,
            size: item.size,
            time: item.timestamp,
            path: item.path
        }));

        res.status(200).json({
            webhooks,
            uploads
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
