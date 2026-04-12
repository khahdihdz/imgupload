import 'dotenv/config';
import express from 'express';
import fetch   from 'node-fetch';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));        // watermark-tool.html đặt trong /public

/* ─── POST /api/github-push ─────────────────────────
   Body: { filename: string, base64: string }
   Token & repo config lấy từ .env, không lộ ra client
─────────────────────────────────────────────────── */
app.post('/api/github-push', async (req, res) => {
  const { filename, base64 } = req.body;

  if (!filename || !base64) {
    return res.status(400).json({ error: 'Thiếu filename hoặc base64' });
  }

  const owner  = process.env.GH_OWNER;
  const repo   = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main';
  const folder = (process.env.GH_FOLDER || 'img').replace(/\/+$/, '');
  const token  = process.env.GH_TOKEN;

  if (!owner || !repo || !token) {
    return res.status(500).json({ error: 'Server chưa cấu hình GitHub (.env)' });
  }

  const path   = `${folder}/${filename}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Authorization : `Bearer ${token}`,
    Accept        : 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent'  : 'watermark-tool'
  };

  // Lấy sha nếu file đã tồn tại (để update thay vì tạo mới)
  let sha = null;
  try {
    const chk = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (chk.ok) { const j = await chk.json(); sha = j.sha; }
  } catch (_) {}

  const body = { message: `upload ${filename}`, content: base64, branch };
  if (sha) body.sha = sha;

  const ghRes = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });

  if (!ghRes.ok) {
    const err = await ghRes.json().catch(() => ({}));
    return res.status(ghRes.status).json({ error: err.message || ghRes.statusText });
  }

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  res.json({ url: rawUrl });
});

app.listen(PORT, '0.0.0.0', () => console.log(`WaterMark Pro server running on port ${PORT}`));
