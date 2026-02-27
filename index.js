import express from "express";

const app = express();
app.use(express.json());

let messages = [];

app.post("/webhook", (req, res) => {
  messages.push({
    time: new Date().toLocaleString(),
    data: req.body
  });
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Webhook Nachrichten</title>
        <meta charset="utf-8" />
      </head>
      <body style="font-family:sans-serif">
        <h2>📩 Eingehende Webhooks</h2>
        <ul>
          ${messages.map(m =>
            `<li><b>${m.time}</b><pre>${JSON.stringify(m.data, null, 2)}</pre></li>`
          ).join("")}
        </ul>
      </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000);