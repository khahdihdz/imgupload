import 'dotenv/config';
import express  from 'express';
import session  from 'express-session';
import fetch    from 'node-fetch';

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── SESSION ─────────────────────────────────────── */
app.use(session({
  secret           : process.env.SESSION_SECRET || 'watermark-pro-secret-2024',
  resave           : false,
  saveUninitialized: false,
  cookie           : { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

/* ─── Helpers ─────────────────────────────────────── */
function ghHeaders(token) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'watermark-tool/4.0' };
  if (token) { h.Authorization = `Bearer ${token}`; h['Content-Type'] = 'application/json'; }
  return h;
}
function mkFilePath(folder, filename) {
  return `${(folder || 'img').replace(/\/+$/, '')}/${filename}`;
}
function getEnv() {
  return {
    owner : process.env.GH_OWNER,
    repo  : process.env.GH_REPO,
    branch: process.env.GH_BRANCH || 'main',
    folder: process.env.GH_FOLDER || 'img',
    token : process.env.GH_TOKEN,
  };
}

/* ─── AUTH MIDDLEWARE ──────────────────────────────── */
function requireAdmin(req, res, next) {
  if (!req.session?.ghUser)
    return res.status(401).json({ error: 'Chưa đăng nhập', redirect: '/filemanager.html' });
  const adminUser = process.env.GITHUB_ADMIN_USERNAME;
  if (adminUser && req.session.ghUser.login !== adminUser)
    return res.status(403).json({ error: 'Không có quyền. Chỉ admin mới được dùng File Manager.' });
  next();
}

/* ═══ GITHUB OAUTH ═══════════════════════════════════ */

app.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).send('Chưa cấu hình GITHUB_CLIENT_ID');
  const p = new URLSearchParams({ client_id: clientId, scope: 'read:user', state: Math.random().toString(36).slice(2) });
  res.redirect(`https://github.com/login/oauth/authorize?${p}`);
});

app.get('/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/filemanager.html?error=no_code');
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) return res.redirect('/filemanager.html?error=token_failed');

    const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders(tokenData.access_token) });
    const user = await userRes.json();

    const adminUser = process.env.GITHUB_ADMIN_USERNAME;
    if (adminUser && user.login !== adminUser) return res.redirect('/filemanager.html?error=not_admin');

    req.session.ghUser = { login: user.login, name: user.name || user.login, avatar: user.avatar_url };
    res.redirect('/filemanager.html');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/filemanager.html?error=server_error');
  }
});

app.get('/auth/me', (req, res) => {
  if (!req.session?.ghUser) return res.json({ loggedIn: false });
  const { login, name, avatar } = req.session.ghUser;
  res.json({ loggedIn: true, login, name, avatar });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ═══ FILE MANAGER API ═══════════════════════════════ */

/* GET /api/fm/files — liệt kê file trong folder */
app.get('/api/fm/files', requireAdmin, async (req, res) => {
  const { owner, repo, branch, folder, token } = getEnv();
  if (!owner || !repo) return res.status(500).json({ error: 'Chưa cấu hình GH_OWNER / GH_REPO' });
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${folder}?ref=${branch}`, { headers: ghHeaders(token) });
    if (r.status === 404) return res.json({ files: [], folder, repo: `${owner}/${repo}`, branch });
    if (!r.ok) { const b = await r.json().catch(() => ({})); return res.status(r.status).json({ error: b.message || `GitHub API lỗi ${r.status}` }); }
    const data  = await r.json();
    const files = (Array.isArray(data) ? data : [])
      .filter(f => f.type === 'file')
      .map(f => ({ name: f.name, sha: f.sha, size: f.size, path: f.path, rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`, htmlUrl: f.html_url }));
    res.json({ files, folder, repo: `${owner}/${repo}`, branch });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* DELETE /api/fm/file */
app.delete('/api/fm/file', requireAdmin, async (req, res) => {
  const { path: fPath, sha } = req.body;
  if (!fPath || !sha) return res.status(400).json({ error: 'Thiếu path hoặc sha' });
  const { owner, repo, branch, token } = getEnv();
  if (!token) return res.status(500).json({ error: 'Thiếu GH_TOKEN để xóa file' });
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fPath}`, {
      method : 'DELETE',
      headers: ghHeaders(token),
      body   : JSON.stringify({ message: `delete ${fPath.split('/').pop()}`, sha, branch }),
    });
    if (!r.ok) { const b = await r.json().catch(() => ({})); return res.status(r.status).json({ error: b.message || `GitHub API lỗi ${r.status}` }); }
    res.json({ ok: true, deleted: fPath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* GET /api/fm/stats */
app.get('/api/fm/stats', requireAdmin, async (req, res) => {
  const { owner, repo, branch, folder, token } = getEnv();
  if (!owner || !repo) return res.status(500).json({ error: 'Chưa cấu hình .env' });
  try {
    const [repoRes, contentsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders(token) }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${folder}?ref=${branch}`, { headers: ghHeaders(token) }),
    ]);
    const repoData = repoRes.ok ? await repoRes.json() : {};
    const files    = contentsRes.ok ? await contentsRes.json().then(d => Array.isArray(d) ? d.filter(f => f.type === 'file') : []) : [];
    res.json({ repo: `${owner}/${repo}`, branch, folder, fileCount: files.length, totalSize: files.reduce((s, f) => s + (f.size || 0), 0), repoUrl: repoData.html_url || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ EXISTING ROUTES ════════════════════════════════ */

app.get('/api/check-config', async (req, res) => {
  const { owner, repo, branch, token } = getEnv();
  const missing = [];
  if (!owner) missing.push('GH_OWNER');
  if (!repo)  missing.push('GH_REPO');
  if (missing.length) return res.status(500).json({ ok: false, error: `Thiếu biến: ${missing.join(', ')}` });
  try {
    const repoRes  = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders(token) });
    if (repoRes.status === 404) return res.status(404).json({ ok: false, error: `Repo "${owner}/${repo}" không tồn tại` });
    if (!repoRes.ok) return res.status(repoRes.status).json({ ok: false, error: `GitHub API lỗi ${repoRes.status}` });
    const repoInfo = await repoRes.json();
    if (repoInfo.private) return res.status(403).json({ ok: false, error: `Repo "${owner}/${repo}" là private` });
    if (token) {
      const ur = await fetch('https://api.github.com/user', { headers: ghHeaders(token) });
      if (ur.status === 401) return res.status(401).json({ ok: false, error: 'Token không hợp lệ', hint: 'Tạo token mới tại https://github.com/settings/tokens' });
    }
    const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, { headers: ghHeaders(token) });
    if (!branchRes.ok) return res.status(404).json({ ok: false, error: `Branch "${branch}" không tồn tại` });
    return res.json({ ok: true, repo: `${owner}/${repo}`, branch, message: `✅ Kết nối OK · ${owner}/${repo} · branch: ${branch}` });
  } catch (err) { return res.status(500).json({ ok: false, error: `Lỗi mạng: ${err.message}` }); }
});

app.post('/api/github-push', async (req, res) => {
  const { filename, base64 } = req.body;
  if (!filename || !base64) return res.status(400).json({ error: 'Thiếu filename hoặc base64' });
  const { owner, repo, branch, folder, token } = getEnv();
  if (!owner || !repo) return res.status(500).json({ error: 'Server chưa cấu hình GitHub (.env)' });
  if (!token) return res.status(500).json({ error: 'Thiếu GH_TOKEN', hint: 'Thêm GH_TOKEN vào .env' });

  const path    = mkFilePath(folder, filename);
  const apiUrl  = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = ghHeaders(token);
  let sha = null;
  try {
    const chk = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (chk.ok) sha = (await chk.json()).sha;
    else if (chk.status === 401) return res.status(401).json({ error: 'Token không hợp lệ' });
    else if (chk.status === 403) return res.status(403).json({ error: 'Token không có quyền ghi' });
  } catch (e) { return res.status(500).json({ error: `Lỗi kết nối: ${e.message}` }); }

  const body = { message: `upload ${filename}`, content: base64, branch };
  if (sha) body.sha = sha;
  try {
    const ghRes = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!ghRes.ok) {
      const eb = await ghRes.json().catch(() => ({}));
      return res.status(ghRes.status).json({ error: eb.message || `GitHub API lỗi ${ghRes.status}` });
    }
    res.json({ url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}` });
  } catch (e) { return res.status(500).json({ error: `Lỗi kết nối: ${e.message}` }); }
});

app.listen(PORT, () => console.log(`WaterMark Pro v4.0 · http://localhost:${PORT}`));
