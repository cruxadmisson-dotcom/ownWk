const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080;

// Configuration
const receivedDir = path.join(__dirname, 'received_webhooks');
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(receivedDir);
fs.ensureDirSync(uploadsDir);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Storage configuration for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        cb(null, `${timestamp}_${file.originalname}`);
    }
});
const upload = multer({ storage });

// --- Webhook Endpoint ---
app.post('/webhook', upload.single('file'), async (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
        if (req.file) {
            console.log('File received:', req.file.filename);
            return res.status(200).send(`File uploaded successfully as ${req.file.filename}`);
        } else {
            const webhookData = {
                timestamp,
                headers: req.headers,
                method: req.method,
                body: req.body
            };
            const fileName = `webhook_${timestamp}.json`;
            await fs.writeJson(path.join(receivedDir, fileName), webhookData, { spaces: 2 });
            console.log('Webhook data received:', fileName);
            return res.status(200).send('Webhook received successfully');
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// --- List Endpoint ---
app.get('/list', async (req, res) => {
    try {
        const webhookFiles = await fs.readdir(receivedDir);
        const webhooks = await Promise.all(
            webhookFiles.filter(f => f.endsWith('.json')).map(async (f) => {
                return await fs.readJson(path.join(receivedDir, f));
            })
        );

        const uploadFiles = await fs.readdir(uploadsDir);
        const uploads = await Promise.all(
            uploadFiles.map(async (f) => {
                const stats = await fs.stat(path.join(uploadsDir, f));
                return {
                    name: f,
                    size: stats.size,
                    time: stats.mtime.toLocaleString(),
                    path: `/uploads/${f}`
                };
            })
        );

        res.json({
            webhooks: webhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
            uploads: uploads.sort((a, b) => new Date(b.time) - new Date(a.time))
        });
    } catch (error) {
        console.error('Error listing data:', error);
        res.status(500).send('Internal Server Error');
    }
});

// --- Download Endpoint ---
app.use('/uploads', express.static(uploadsDir));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
