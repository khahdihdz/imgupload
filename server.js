import 'dotenv/config';
import express from 'express';
import fetch   from 'node-fetch';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

/* ─── Helpers ─────────────────────────────────────── */
function ghHeaders(token) {
  const headers = {
    Accept      : 'application/vnd.github+json',
    'User-Agent': 'watermark-tool/2.0'
  };
  if (token) {
    headers.Authorization   = `Bearer ${token}`;
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function filePath(folder, filename) {
  return `${(folder || 'img').replace(/\/+$/, '')}/${filename}`;
}

/* ─── GET /api/check-config ───────────────────────── */
app.get('/api/check-config', async (req, res) => {
  const owner  = process.env.GH_OWNER;
  const repo   = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main';
  const token  = process.env.GH_TOKEN;

  const missing = [];
  if (!owner) missing.push('GH_OWNER');
  if (!repo)  missing.push('GH_REPO');
  if (missing.length) {
    return res.status(500).json({
      ok: false,
      error: `Thiếu biến môi trường: ${missing.join(', ')}`,
      hint : 'Kiểm tra file .env hoặc Environment Variables trên Render'
    });
  }

  try {
    // Kiểm tra repo tồn tại và public
    const repoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: ghHeaders(token) }
    );

    if (repoRes.status === 404) {
      return res.status(404).json({
        ok: false,
        error: `Repo "${owner}/${repo}" không tồn tại`,
        hint : 'Kiểm tra lại GH_OWNER và GH_REPO trong .env'
      });
    }

    if (!repoRes.ok) {
      return res.status(repoRes.status).json({
        ok: false,
        error: `GitHub API lỗi ${repoRes.status}`,
        hint : 'Kiểm tra lại cấu hình .env'
      });
    }

    const repoInfo = await repoRes.json();

    if (repoInfo.private) {
      return res.status(403).json({
        ok: false,
        error: `Repo "${owner}/${repo}" là private`,
        hint : 'Công cụ này chỉ hỗ trợ public repo. Vào GitHub Settings → chuyển repo sang Public, hoặc tạo repo public mới.'
      });
    }

    // Kiểm tra token hợp lệ (nếu có)
    if (token) {
      const userRes = await fetch('https://api.github.com/user', {
        headers: ghHeaders(token)
      });
      if (userRes.status === 401) {
        return res.status(401).json({
          ok: false,
          error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
          hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens với scope "public_repo"'
        });
      }
    }

    // Kiểm tra branch tồn tại
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      { headers: ghHeaders(token) }
    );

    if (!branchRes.ok) {
      return res.status(404).json({
        ok: false,
        error: `Branch "${branch}" không tồn tại trong repo "${owner}/${repo}"`,
        hint : 'Kiểm tra GH_BRANCH trong .env. Các branch thường dùng: main, master'
      });
    }

    return res.json({
      ok     : true,
      repo   : `${owner}/${repo}`,
      branch,
      private: false,
      message: `✅ Kết nối OK · ${owner}/${repo} (public) · branch: ${branch}`
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: `Lỗi mạng: ${err.message}`,
      hint : 'Kiểm tra kết nối internet của server'
    });
  }
});

/* ─── POST /api/github-push ──────────────────────── */
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

  if (!owner || !repo) {
    return res.status(500).json({
      error: 'Server chưa cấu hình GitHub (.env)',
      hint : 'Thêm GH_OWNER, GH_REPO vào file .env'
    });
  }

  if (!token) {
    return res.status(500).json({
      error: 'Thiếu GH_TOKEN',
      hint : 'Thêm GH_TOKEN vào .env. Dùng Classic Token có scope "public_repo"'
    });
  }

  const path    = filePath(folder, filename);
  const apiUrl  = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = ghHeaders(token);

  // Lấy SHA nếu file đã tồn tại (update thay vì tạo mới)
  let sha = null;
  try {
    const chk = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (chk.ok) {
      const j = await chk.json();
      sha = j.sha;
    } else if (chk.status === 401) {
      return res.status(401).json({
        error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
        hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens với scope "public_repo"'
      });
    } else if (chk.status === 403) {
      return res.status(403).json({
        error: 'Token không có quyền ghi vào repo',
        hint : 'Đảm bảo token Classic có scope "public_repo"'
      });
    }
    // 404 = file chưa có → bình thường, tạo mới
  } catch (networkErr) {
    return res.status(500).json({
      error: `Lỗi kết nối GitHub: ${networkErr.message}`,
      hint : 'Kiểm tra kết nối mạng của server'
    });
  }

  // Ghi file lên GitHub
  const body = { message: `upload ${filename}`, content: base64, branch };
  if (sha) body.sha = sha;

  try {
    const ghRes = await fetch(apiUrl, {
      method : 'PUT',
      headers,
      body   : JSON.stringify(body)
    });

    if (!ghRes.ok) {
      const errBody = await ghRes.json().catch(() => ({}));

      if (ghRes.status === 401) {
        return res.status(401).json({
          error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
          hint : 'Tạo token mới tại https://github.com/settings/tokens với scope "public_repo"'
        });
      }
      if (ghRes.status === 403) {
        return res.status(403).json({
          error: 'Token không có quyền ghi vào repo',
          hint : 'Đảm bảo token Classic có scope "public_repo"'
        });
      }
      if (ghRes.status === 404) {
        return res.status(404).json({
          error: `Repo "${owner}/${repo}" không tồn tại`,
          hint : 'Kiểm tra lại GH_OWNER và GH_REPO trong .env'
        });
      }
      if (ghRes.status === 422) {
        return res.status(422).json({
          error: 'Dữ liệu không hợp lệ (branch sai hoặc SHA không khớp)',
          hint : `Kiểm tra GH_BRANCH trong .env — branch hiện tại: "${branch}"`
        });
      }

      return res.status(ghRes.status).json({
        error: errBody.message || `GitHub API lỗi ${ghRes.status}`,
        hint : 'Kiểm tra lại cấu hình .env'
      });
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
