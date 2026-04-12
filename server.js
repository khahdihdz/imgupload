import 'dotenv/config';
import express from 'express';
import fetch   from 'node-fetch';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

/* ─── Helper: build GitHub API URL ─── */
function ghApiUrl(owner, repo, folder, filename) {
  const path = `${(folder || 'img').replace(/\/+$/, '')}/${filename}`;
  return {
    path,
    url: `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  };
}

function ghHeaders(token) {
  return {
    Authorization : `Bearer ${token}`,
    Accept        : 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent'  : 'watermark-tool/2.0'
  };
}

/* ─── GET /api/check-config ───────────────────────
   Kiểm tra .env và kết nối GitHub trước khi push
─────────────────────────────────────────────────── */
app.get('/api/check-config', async (req, res) => {
  const owner  = process.env.GH_OWNER;
  const repo   = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main';
  const token  = process.env.GH_TOKEN;

  const missing = [];
  if (!owner)  missing.push('GH_OWNER');
  if (!repo)   missing.push('GH_REPO');
  if (!token)  missing.push('GH_TOKEN');

  if (missing.length) {
    return res.status(500).json({
      ok: false,
      error: `Thiếu biến môi trường: ${missing.join(', ')}`,
      hint : 'Kiểm tra file .env hoặc Environment Variables trên Render'
    });
  }

  // Kiểm tra repo tồn tại & token hợp lệ
  try {
    const chk = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: ghHeaders(token) }
    );

    if (chk.status === 404) {
      return res.status(404).json({
        ok: false,
        error: `Repo "${owner}/${repo}" không tồn tại hoặc token không có quyền truy cập`,
        hint : 'Kiểm tra GH_OWNER, GH_REPO và đảm bảo token có scope "repo" (với private repo) hoặc "public_repo" (với public repo)'
      });
    }

    if (chk.status === 401) {
      return res.status(401).json({
        ok: false,
        error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
        hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens với scope "repo"'
      });
    }

    if (!chk.ok) {
      const body = await chk.json().catch(() => ({}));
      return res.status(chk.status).json({
        ok: false,
        error: body.message || `GitHub API lỗi ${chk.status}`,
        hint : 'Xem console để biết thêm chi tiết'
      });
    }

    const info = await chk.json();
    return res.json({
      ok      : true,
      repo    : `${owner}/${repo}`,
      branch,
      private : info.private,
      message : `✅ Kết nối thành công tới ${owner}/${repo} (${info.private ? 'private' : 'public'})`
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: `Lỗi mạng: ${err.message}`,
      hint : 'Kiểm tra kết nối internet của server'
    });
  }
});

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
  const folder = process.env.GH_FOLDER || 'img';
  const token  = process.env.GH_TOKEN;

  if (!owner || !repo || !token) {
    return res.status(500).json({
      error: 'Server chưa cấu hình GitHub (.env)',
      hint : 'Thêm GH_OWNER, GH_REPO, GH_TOKEN vào file .env'
    });
  }

  const { path, url: apiUrl } = ghApiUrl(owner, repo, folder, filename);
  const headers = ghHeaders(token);

  // Lấy sha nếu file đã tồn tại (để update thay vì tạo mới)
  let sha = null;
  try {
    const chk = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (chk.ok) {
      const j = await chk.json();
      sha = j.sha;
    } else if (chk.status === 401) {
      return res.status(401).json({
        error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
        hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens'
      });
    } else if (chk.status === 404) {
      // File chưa tồn tại → sẽ tạo mới, không cần sha
      // Nhưng nếu repo không tồn tại thì cũng 404 → kiểm tra thêm
      const errBody = await chk.json().catch(() => ({}));
      if (errBody.message === 'Not Found') {
        // Có thể là repo không tồn tại, kiểm tra repo
        const repoChk = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          { headers }
        );
        if (!repoChk.ok) {
          return res.status(404).json({
            error: `Repo "${owner}/${repo}" không tồn tại hoặc token không có quyền`,
            hint : 'Kiểm tra GH_OWNER, GH_REPO trong .env và đảm bảo token có scope "repo"'
          });
        }
        // Repo tồn tại, file chưa có → tạo mới bình thường
      }
    }
  } catch (networkErr) {
    return res.status(500).json({
      error: `Lỗi kết nối GitHub: ${networkErr.message}`,
      hint : 'Kiểm tra kết nối mạng của server'
    });
  }

  const body = {
    message: `upload ${filename}`,
    content: base64,
    branch
  };
  if (sha) body.sha = sha;

  try {
    const ghRes = await fetch(apiUrl, {
      method : 'PUT',
      headers,
      body   : JSON.stringify(body)
    });

    if (!ghRes.ok) {
      const err = await ghRes.json().catch(() => ({}));
      const msg = err.message || ghRes.statusText;

      // Cung cấp hint cụ thể theo từng mã lỗi
      let hint = '';
      if (ghRes.status === 404) {
        hint = `Repo "${owner}/${repo}" hoặc branch "${branch}" không tồn tại. Kiểm tra GH_OWNER, GH_REPO, GH_BRANCH trong .env`;
      } else if (ghRes.status === 401) {
        hint = 'Token hết hạn hoặc sai. Tạo token mới tại https://github.com/settings/tokens với scope "repo"';
      } else if (ghRes.status === 403) {
        hint = 'Token không có quyền ghi. Đảm bảo token có scope "repo" hoặc "public_repo"';
      } else if (ghRes.status === 422) {
        hint = 'Nội dung file không hợp lệ hoặc branch không khớp';
      }

      return res.status(ghRes.status).json({ error: msg, hint });
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    res.json({ url: rawUrl });

  } catch (networkErr) {
    return res.status(500).json({
      error: `Lỗi kết nối GitHub: ${networkErr.message}`
    });
  }
});

app.listen(PORT, () => console.log(`WaterMark Pro server: http://localhost:${PORT}`));
