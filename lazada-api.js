import crypto from 'crypto';
import fetch  from 'node-fetch';

const APP_KEY    = process.env.LAZADA_APP_KEY    || '105827';
const APP_SECRET = process.env.LAZADA_APP_SECRET || 'r8ZMKhPxu1JZUCwTUBVMJiJnZKjhWeQF';
const USER_TOKEN = process.env.LAZADA_USER_TOKEN || 'c3ed9061b8d7473e9d224e14ae4b4212';
const API_HOST   = 'https://api.lazada.vn/rest';

/**
 * Tạo chữ ký HMAC-SHA256 cho Lazada OpenAPI
 * Spec: https://open.lazada.com/apps/doc/doc.htm?spm=a2o9m.11193531.0.0.6c8d6bbeg3Rz0x#/doc?nodeId=10450&docId=108068
 */
function sign(params, secret) {
  // 1. Sắp xếp params theo alphabet
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  // 2. Tính HMAC-SHA256
  return crypto.createHmac('sha256', secret).update(sorted).digest('hex').toUpperCase();
}

/**
 * Gọi Lazada OpenAPI
 */
async function lazadaCall(apiPath, extraParams = {}) {
  const params = {
    app_key   : APP_KEY,
    timestamp : Date.now().toString(),
    sign_method: 'sha256',
    access_token: USER_TOKEN,
    ...extraParams,
  };

  params.sign = sign({ ...params, method: apiPath }, APP_SECRET);

  const qs = new URLSearchParams(params).toString();
  const url = `${API_HOST}${apiPath}?${qs}`;

  const res  = await fetch(url, { headers: { 'User-Agent': 'lazada-tool/1.0' } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch(_) { throw new Error(`Lazada API trả về không phải JSON: ${text.slice(0,200)}`); }
  return json;
}

/**
 * Đăng ký route lên Express app
 */
export function registerLazadaRoutes(app) {

  /* POST /api/lazada/convert
     Body: { urls: string[] }   — mảng link Lazada gốc
     Response: { results: [{ original, affiliate, short }] }
  */
  app.post('/api/lazada/convert', async (req, res) => {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Thiếu danh sách URL' });
    }
    if (urls.length > 50) {
      return res.status(400).json({ error: 'Tối đa 50 URL mỗi lần' });
    }

    try {
      const results = await Promise.all(
        urls.map(async (original) => {
          try {
            const data = await lazadaCall('/affiliate/link/generate', {
              tracking_id: 'default',
              urls: original,
            });

            if (data.code !== '0') {
              return { original, error: data.message || `Lỗi code ${data.code}` };
            }

            const item = data.result?.[0] || data.data?.[0] || {};
            return {
              original,
              affiliate : item.aff_url  || item.affiliate_url || item.encoded_url || '',
              short     : item.short_url || item.aff_short_url || '',
            };
          } catch(e) {
            return { original, error: e.message };
          }
        })
      );

      res.json({ results });
    } catch(e) {
      res.status(500).json({ error: `Lỗi server: ${e.message}` });
    }
  });

  /* GET /api/lazada/status — kiểm tra token còn hoạt động */
  app.get('/api/lazada/status', async (req, res) => {
    try {
      const data = await lazadaCall('/auth/token/query', {});
      if (data.code === '0') {
        res.json({ ok: true, message: '✅ Lazada token hợp lệ' });
      } else {
        res.status(401).json({ ok: false, error: data.message || 'Token không hợp lệ', code: data.code });
      }
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
