import crypto from 'crypto';
import fetch  from 'node-fetch';

const APP_KEY    = process.env.LAZADA_APP_KEY;
const APP_SECRET = process.env.LAZADA_APP_SECRET;
const USER_TOKEN = process.env.LAZADA_USER_TOKEN;
const API_HOST   = 'https://api.lazada.vn/rest';

/**
 * Tạo chữ ký HMAC-SHA256 đúng spec Lazada OpenAPI:
 * baseString = apiPath + key1value1key2value2... (sorted alphabetically, NO sign param)
 */
function sign(apiPath, params, secret) {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}${params[k]}`)
    .join('');
  const baseString = apiPath + sorted;
  return crypto.createHmac('sha256', secret).update(baseString).digest('hex').toUpperCase();
}

/**
 * Gọi Lazada OpenAPI
 */
async function lazadaCall(apiPath, extraParams = {}) {
  const params = {
    app_key     : APP_KEY,
    timestamp   : Date.now().toString(),
    sign_method : 'sha256',
    access_token: USER_TOKEN,
    ...extraParams,
  };

  // Tính sign SAU khi có đủ params, KHÔNG đưa sign vào params trước khi ký
  params.sign = sign(apiPath, params, APP_SECRET);

  const qs  = new URLSearchParams(params).toString();
  const url = `${API_HOST}${apiPath}?${qs}`;

  const res  = await fetch(url, { headers: { 'User-Agent': 'lazada-affiliate-tool/1.0' } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch(_) { throw new Error(`Lazada API trả về không phải JSON: ${text.slice(0, 300)}`); }
  return json;
}

function checkEnv() {
  if (!APP_KEY || !APP_SECRET || !USER_TOKEN) {
    return {
      error: 'Thiếu cấu hình Lazada API',
      hint : 'Thêm LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_USER_TOKEN vào Environment Variables trên Render'
    };
  }
  return null;
}

export function registerLazadaRoutes(app) {

  /* GET /api/lazada/status — kiểm tra token */
  app.get('/api/lazada/status', async (req, res) => {
    const envErr = checkEnv();
    if (envErr) return res.status(500).json({ ok: false, ...envErr });

    try {
      // /auth/token/query là endpoint hợp lệ để verify token
      const data = await lazadaCall('/auth/token/query', {});
      if (data.code === '0') {
        res.json({ ok: true, message: '✅ Lazada token hợp lệ' });
      } else {
        res.status(401).json({ ok: false, error: data.message || `Lỗi code: ${data.code}`, code: data.code });
      }
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* POST /api/lazada/convert
     Body: { urls: string[] }
     Response: { results: [{ original, affiliate, short }] }
  */
  app.post('/api/lazada/convert', async (req, res) => {
    const envErr = checkEnv();
    if (envErr) return res.status(500).json({ ...envErr });

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
            // Đúng path theo Lazada OpenAPI docs cho affiliate link generation
            const data = await lazadaCall('/affiliate/customized/url/get', {
              urls: original,
            });

            if (data.code !== '0') {
              return { original, error: data.message || `Lỗi code: ${data.code}` };
            }

            // Lazada trả result dạng array hoặc single object tuỳ version
            const item = Array.isArray(data.result)
              ? (data.result[0] || {})
              : (data.result || data.data || {});

            return {
              original,
              affiliate : item.aff_url       || item.affiliate_url  || item.encoded_url   || '',
              short     : item.aff_short_url  || item.short_url      || '',
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
}
