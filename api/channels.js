const { createClient } = require('@supabase/supabase-js');

// --- Helper: Safe Supabase Client ---
const getSupabase = () => {
    const url = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = process.env.SUPABASE_ANON_KEY || 'placeholder';
    return createClient(url, key);
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;

    try {
        const supabase = getSupabase();

        if (method === 'GET') {
            const { data, error } = await supabase.from('channels').select('*').order('created_at', { ascending: true });
            if (error) throw error;
            return res.status(200).json(data);
        }

        if (method === 'POST') {
            const { name } = req.body;
            const { data, error } = await supabase.from('channels').insert([{ name }]).select();
            if (error) throw error;
            return res.status(200).json(data[0]);
        }

        if (method === 'DELETE') {
            const { id } = req.query;
            const { error } = await supabase.from('channels').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        res.status(405).send('Method Not Allowed');
    } catch (error) {
        console.error('Channels API Error:', error);
        res.status(500).json({ error: error.message });
    }
};
