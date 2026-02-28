const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Supabase Client Initialization
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase;

try {
    if (!supabaseUrl || !supabaseKey) {
        console.warn("⚠️ SUPABASE_URL or SUPABASE_KEY (or SUPABASE_ANON_KEY) is missing. Database features will fail.");
    } else {
        supabase = createClient(supabaseUrl, supabaseKey);
    }
} catch (err) {
    console.error("Supabase Init Error:", err.message);
}

// Helper to check DB connection
const checkDb = (res) => {
    if (!supabase) {
        res.status(500).json({ error: "Server Configuration Error: Missing Supabase Env Vars" });
        return false;
    }
    return true;
};

// --- ROUTES ---

// 1. GET /api/webhook - Mimic Discord Webhook Info
app.get('/api/webhook', (req, res) => {
    res.json({
        type: 1,
        id: "123456789012345678",
        name: "Captain Hook",
        avatar: null,
        channel_id: "123456789012345678",
        guild_id: "123456789012345678",
        application_id: null,
        token: "super-secret-token"
    });
});

// 2. POST /api/webhook - Receive Data (Mimic Discord)
app.post('/api/webhook', upload.any(), async (req, res) => {
    if (!checkDb(res)) return;

    try {
        const { content, embeds, username, avatar_url } = req.body;
        const files = req.files || [];
        // Handle both X-Channel-Id header and query param (some tools use one or other)
        const channelId = req.headers['x-channel-id'] || req.query.channelId || 'general'; 

        // Process Embeds
        let finalContent = content || '';
        if (embeds) {
            const embedList = typeof embeds === 'string' ? JSON.parse(embeds) : embeds;
            embedList.forEach(embed => {
                if (embed.title) finalContent += `\n**${embed.title}**`;
                if (embed.description) finalContent += `\n${embed.description}`;
                if (embed.fields) {
                    embed.fields.forEach(f => {
                        finalContent += `\n*${f.name}:* ${f.value}`;
                    });
                }
            });
        }

        // Process Files
        if (files.length > 0) {
            finalContent += `\n\n*[Attached ${files.length} file(s) - Storage not configured yet]*`;
            // TODO: Implement actual file upload to Supabase Storage
        }

        // Insert into Supabase
        const { error } = await supabase
            .from('events')
            .insert([
                {
                    type: 'message',
                    name: username || 'Webhook',
                    content: finalContent,
                    path: channelId // Using 'path' column to store channel_id/name
                }
            ]);

        if (error) throw error;

        // Return 204 No Content (Discord Standard)
        res.status(204).send();

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. GET /api/list - List Messages
app.get('/api/list', async (req, res) => {
    if (!checkDb(res)) return;

    try {
        const channelId = req.query.channelId || 'general';
        
        // Fetch messages for the specific channel
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('path', channelId) // Filtering by 'path' which stores channel_id
            .order('timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('List Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. GET /api/channels - List Channels
app.get('/api/channels', async (req, res) => {
    if (!checkDb(res)) return;

    try {
        const { data, error } = await supabase
            .from('channels')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            // If table doesn't exist, return empty list gracefully (or default)
            if (error.code === '42P01') { // undefined_table
                 console.warn("Channels table missing, returning empty");
                 return res.json([]);
            }
            throw error;
        }
        res.json(data);
    } catch (error) {
        console.error('Channels Error:', error);
        res.status(500).json({ error: error.message, code: error.code, details: error.details, hint: error.hint });
    }
});

// 5. POST /api/channels - Create Channel
app.post('/api/channels', async (req, res) => {
    if (!checkDb(res)) return;

    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const { data, error } = await supabase
            .from('channels')
            .insert([{ name }])
            .select();

        if (error) throw error;
        res.json(data[0]);
    } catch (error) {
        console.error('Create Channel Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. DELETE /api/channels/:id - Delete Channel
app.delete('/api/channels/:id', async (req, res) => {
    if (!checkDb(res)) return;

    try {
        const { id } = req.params;
        
        // Also delete messages? Optional. For now just delete channel.
        const { error } = await supabase
            .from('channels')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Channel Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. GET /api/health - Diagnostic
app.get('/api/health', async (req, res) => {
    const status = {
        env: {
            SUPABASE_URL: !!supabaseUrl,
            SUPABASE_KEY: !!supabaseKey
        },
        db: 'unknown'
    };
    
    if (supabase) {
        try {
            const { data, error } = await supabase.from('channels').select('count', { count: 'exact', head: true });
            if (error) {
                status.db = 'error';
                status.details = error;
            } else {
                status.db = 'connected';
            }
        } catch (e) {
            status.db = 'exception';
            status.details = e.message;
        }
    } else {
        status.db = 'not_initialized';
    }
    
    res.json(status);
});

// Export the app for Vercel
module.exports = app;
