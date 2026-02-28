const app = require('./api/index');
const express = require('express');
const path = require('path');

// Serve static files for local dev
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
    console.log('NOTE: Ensure you have a .env file with SUPABASE_URL and SUPABASE_KEY for DB access.');
});
