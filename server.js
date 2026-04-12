import 'dotenv/config';
import express from 'express';
import fetch   from 'node-fetch';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

/* ─── Helpers ─────────────────────────────────────── */
function ghHeaders(token) {
  return {
    Authorization : `Bearer ${token}`,
    Accept        : 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent'  : 'watermark-tool/2.0'
  };
}

function filePath(folder, filename) {
  return `${(folder || 'img').replace(/\/+$/, '')}/${filename}`;
}

/**
 * Chẩn đoán lỗi GitHub chính xác cho private repo:
 * - GitHub trả 404 cho cả "repo không tồn tại" VÀ "token không có quyền"
 * - Cần kiểm tra token hợp lệ (GET /user) trước để phân biệt
 */
async function diagnoseGitHubError(status, owner, repo, token) {
  if (status === 401) {
    return {
      error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
      hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens với scope "repo"'
    };
  }

  if (status === 404) {
    // Kiểm tra token có hợp lệ không (GET /user luôn hoạt động nếu token đúng)
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: ghHeaders(token)
      });

      if (!userRes.ok) {
        // Token không hợp lệ
        return {
          error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
          hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens với scope "repo"'
        };
      }

      const user = await userRes.json();

      // Token hợp lệ nhưng vẫn 404 → thiếu scope "repo" cho private repo
      // hoặc repo thực sự không tồn tại
      return {
        error: `Không thể truy cập repo "${owner}/${repo}"`,
        hint : `Token của "${user.login}" thiếu quyền truy cập. Với private repo, cần scope "repo" (Classic Token). Kiểm tra tại https://github.com/settings/tokens — hoặc repo chưa được tạo.`
      };
    } catch (_) {
      return {
        error: `Repo "${owner}/${repo}" không tồn tại hoặc token thiếu quyền`,
        hint : 'Đảm bảo token Classic có scope "repo" hoặc Fine-grained token có quyền "Contents: Read & write" cho repo này'
      };
    }
  }

  if (status === 403) {
    return {
      error: 'Token không có quyền ghi vào repo',
      hint : 'Đảm bảo token có scope "repo" (Classic) hoặc quyền "Contents: Read & write" (Fine-grained)'
    };
  }

  if (status === 422) {
    return {
      error: 'Dữ liệu không hợp lệ (branch sai hoặc SHA không khớp)',
      hint : `Kiểm tra GH_BRANCH trong .env — branch hiện tại: "${process.env.GH_BRANCH || 'main'}"`
    };
  }

  return { error: `GitHub API lỗi ${status}`, hint: '' };
}

/* ─── GET /api/check-config ───────────────────────── */
app.get('/api/check-config', async (req, res) => {
  const owner  = process.env.GH_OWNER;
  const repo   = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main';
  const token  = process.env.GH_TOKEN;

  // 1. Kiểm tra .env đầy đủ chưa
  const missing = [];
  if (!owner) missing.push('GH_OWNER');
  if (!repo)  missing.push('GH_REPO');
  if (!token) missing.push('GH_TOKEN');
  if (missing.length) {
    return res.status(500).json({
      ok: false,
      error: `Thiếu biến môi trường: ${missing.join(', ')}`,
      hint : 'Kiểm tra file .env hoặc Environment Variables trên Render'
    });
  }

  try {
    // 2. Kiểm tra token hợp lệ qua GET /user
    const userRes = await fetch('https://api.github.com/user', {
      headers: ghHeaders(token)
    });

    if (userRes.status === 401) {
      return res.status(401).json({
        ok: false,
        error: 'Token GitHub không hợp lệ hoặc đã hết hạn',
        hint : 'Tạo Personal Access Token mới tại https://github.com/settings/tokens với scope "repo"'
      });
    }

    if (!userRes.ok) {
      return res.status(userRes.status).json({
        ok: false,
        error: `Không xác thực được với GitHub (${userRes.status})`,
        hint : 'Kiểm tra lại GH_TOKEN'
      });
    }

    const userInfo = await userRes.json();

    // 3. Kiểm tra quyền truy cập repo
    const repoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: ghHeaders(token) }
    );

    if (repoRes.status === 404) {
      return res.status(404).json({
        ok: false,
        error: `Repo "${owner}/${repo}" không tồn tại hoặc token của "${userInfo.login}" thiếu quyền truy cập`,
        hint : 'Với private repo: dùng Classic Token có scope "repo", hoặc Fine-grained Token với quyền "Contents: Read & write" cho repo này. Tạo token tại https://github.com/settings/tokens'
      });
    }

    if (!repoRes.ok) {
      const { error, hint } = await diagnoseGitHubError(repoRes.status, owner, repo, token);
      return res.status(repoRes.status).json({ ok: false, error, hint });
    }

    const repoInfo = await repoRes.json();

    // 4. Kiểm tra branch tồn tại
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      { headers: ghHeaders(token) }
    );

    if (!branchRes.ok) {
      return res.status(404).json({
        ok: false,
        error: `Branch "${branch}" không tồn tại trong repo "${owner}/${repo}"`,
        hint : `Kiểm tra GH_BRANCH trong .env. Các branch thường dùng: main, master`
      });
    }

    return res.json({
      ok      : true,
      repo    : `${owner}/${repo}`,
      branch,
      private : repoInfo.private,
      user    : userInfo.login,
      message : `✅ Kết nối OK · ${owner}/${repo} (${repoInfo.private ? 'private' : 'public'}) · branch: ${branch}`
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

  if (!owner || !repo || !token) {
    return res.status(500).json({
      error: 'Server chưa cấu hình GitHub (.env)',
      hint : 'Thêm GH_OWNER, GH_REPO, GH_TOKEN vào file .env'
    });
  }

  const path   = filePath(folder, filename);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = ghHeaders(token);

  // Lấy SHA nếu file đã tồn tại (update thay vì tạo mới)
  let sha = null;
  try {
    const chk = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (chk.ok) {
      const j = await chk.json();
      sha = j.sha;
    } else if (chk.status !== 404) {
      // 404 = file chưa có → bình thường, tạo mới
      // Các lỗi khác (401, 403...) → báo ngay
      const { error, hint } = await diagnoseGitHubError(chk.status, owner, repo, token);
      return res.status(chk.status).json({ error, hint });
    }
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
      const { error, hint } = await diagnoseGitHubError(ghRes.status, owner, repo, token);
      // Ưu tiên message từ GitHub nếu có thông tin cụ thể hơn
      return res.status(ghRes.status).json({
        error: errBody.message && errBody.message !== 'Not Found' ? errBody.message : error,
        hint
      });
    }

    // Với private repo, raw.githubusercontent.com cần token để truy cập
    // Trả về cả URL API lẫn raw URL để client tự chọn
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const apiFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

    res.json({ url: rawUrl, apiUrl: apiFileUrl, private: false });

  } catch (networkErr) {
    return res.status(500).json({
      error: `Lỗi kết nối GitHub: ${networkErr.message}`
    });
  }
});

app.listen(PORT, () => console.log(`WaterMark Pro server: http://localhost:${PORT}`));
