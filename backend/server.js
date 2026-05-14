const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const apiRoutes = require('./routes/apiRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const healthRoutes = require('./routes/healthRoutes');

const app = express();
const distPath = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distPath, 'index.html');

const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = String(process.env.CORS_ORIGINS || 'http://localhost:3005,http://127.0.0.1:3005')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isDev) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
}));

app.use(express.json({ limit: '1mb' }));
if (fs.existsSync(distPath)) app.use(express.static(distPath));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use('/webhook', webhookRoutes);

app.get('*', (_req, res) => {
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(200).send('Frontend no compilado. Ejecuta npm run dev o npm run build.');
});

app.listen(config.port, () => {
  console.log(`CRM WhatsApp backend corriendo en ${config.appBaseUrl}`);
});
