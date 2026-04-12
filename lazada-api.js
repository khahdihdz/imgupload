import crypto from 'crypto';
import fetch  from 'node-fetch';

const API_HOST = 'https://api.lazada.vn/rest';

function getCredentials() {
  return {
    APP_KEY   : process.env.LAZADA_APP_KEY    || '',
    APP_SECRET: process.env.LAZADA_APP_SECRET || '',
    USER_TOKEN: process.env.LAZADA_USER_TOKEN || '',
  };
}

/**
 * Tạo chữ ký HMAC-SHA256 đúng spec Lazada OpenAPI v2:
 * baseString = Method + apiPath + sorted_params (key+value, alphabetical)
 * KHÔNG đưa sign vào params khi tính sign
 */
function sign(apiPath, params, secret) {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}${params[k]}`)
    .join('');
  const baseString = apiPath + sorted;
  return crypto
    .createHmac('sha256', secret)
    .update(baseString)
    .digest('hex')
    .toUpperCase();
}

/**
 * Gọi Lazada OpenAPI
 * apiPath phải bắt đầu bằng / và KHÔNG có trailing slash
 * ví dụ: '/auth/token/query'
 */
async function lazadaCall(apiPath, extraParams = {}) {
  const { APP_KEY, APP_SECRET, USER_TOKEN } = getCredentials();

  const params = {
    app_key     : APP_KEY,
    timestamp   : Date.now().toString(),
    sign_method : 'sha256',
    access_token: USER_TOKEN,
    ...extraParams,
  };

  params.sign = sign(apiPath, params, APP_SECRET);

  const qs  = new URLSearchParams(params).toString();
  const url = `${API_HOST}${apiPath}?${qs}`;

  const res  = await fetch(url, {
    headers: { 'User-Agent': 'watermark-pro/4.0' },
    timeout: 15000,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch (_) { throw new Error(`Lazada API không trả JSON (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  return json;
}

function checkEnv() {
  const { APP_KEY, APP_SECRET, USER_TOKEN } = getCredentials();
  const missing = [];
  if (!APP_KEY)    missing.push('LAZADA_APP_KEY');
  if (!APP_SECRET) missing.push('LAZADA_APP_SECRET');
  if (!USER_TOKEN) missing.push('LAZADA_USER_TOKEN');
  if (missing.length) {
    return {
      error: `Thiếu cấu hình: ${missing.join(', ')}`,
      hint : 'Thêm vào Environment Variables trên Render (hoặc file .env khi dev)',
    };
  }
  return null;
}

/**
 * Chuẩn hóa URL Lazada:
 * - Thêm https:// nếu thiếu scheme
 * - Chỉ giữ domain lazada.vn / s.lazada.vn / lazada.sg v.v.
 */
function normalizeUrl(url) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

/**
 * Trích xuất affiliate URL từ response Lazada.
 * Lazada trả về nhiều cấu trúc khác nhau tuỳ version API:
 *   data.result[0].aff_url           (generate_affiliate_links)
 *   data.result.aff_url
 *   data.data.aff_url
 *   data.aff_url
 */
function extractAffUrl(data) {
  const r = data?.result ?? data?.data ?? data;
  if (!r) return { affiliate: '', short: '' };

  const item = Array.isArray(r) ? (r[0] ?? {}) : r;
  const affiliate = item.aff_url       ?? item.affiliate_url  ??
                    item.encoded_url   ?? item.url            ?? '';
  const short     = item.aff_short_url ?? item.short_url      ?? '';
  return { affiliate, short };
}

export function registerLazadaRoutes(app) {

  /* ── GET /api/lazada/status ─────────────────────── */
  app.get('/api/lazada/status', async (req, res) => {
    const envErr = checkEnv();
    if (envErr) return res.status(500).json({ ok: false, ...envErr });

    try {
      // /auth/token/query — endpoint chính thức để verify access_token
      const data = await lazadaCall('/auth/token/query');

      // code '0' = thành công, code 0 (số) cũng chấp nhận
      if (data.code === '0' || data.code === 0) {
        return res.json({ ok: true, message: '✅ Lazada token hợp lệ' });
      }

      // Một số app trả code "IllegalAccessToken" hoặc "27"
      return res.status(401).json({
        ok   : false,
        error: data.message || `Lỗi Lazada code: ${data.code}`,
        code : data.code,
        hint : 'Tạo lại User Token tại Lazada Open Platform → My Apps → Token Management',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* ── POST /api/lazada/convert ───────────────────── */
  /*
   * Lazada Affiliate API đúng path:
   *   POST /affiliate/customized/url/get
   *   Params: urls (string, một URL mỗi lần call)
   *           tracking_id (optional)
   *
   * Nếu app của bạn là Publisher App thì cần
   * LAZADA_TRACKING_ID trong .env để truyền vào.
   *
   * QUAN TRỌNG: "urls" phải là STRING (không phải array),
   * Lazada nhận một URL mỗi request — ta loop ở server.
   */
  app.post('/api/lazada/convert', async (req, res) => {
    const envErr = checkEnv();
    if (envErr) return res.status(500).json({ ...envErr });

    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0)
      return res.status(400).json({ error: 'Thiếu danh sách URL' });
    if (urls.length > 50)
      return res.status(400).json({ error: 'Tối đa 50 URL mỗi lần' });

    const trackingId = process.env.LAZADA_TRACKING_ID || '';

    const results = await Promise.all(
      urls.map(async (original) => {
        const normalized = normalizeUrl(original);
        try {
          const extraParams = {
            urls: normalized,          // string, không phải array
            ...(trackingId ? { tracking_id: trackingId } : {}),
          };

          const data = await lazadaCall('/affiliate/customized/url/get', extraParams);

          // Kiểm tra lỗi API path (code: "IllegalApiPath" hoặc message chứa "API Path")
          if (data.code === 'IllegalApiPath' || String(data.code) === '27' ||
              (data.message && /api path/i.test(data.message))) {
            return {
              original,
              error: `Lazada API path không hợp lệ với app này. Kiểm tra loại App (Publisher/Seller) và quyền affiliate.`,
              hint : 'Vào Lazada Open Platform → My Apps → kiểm tra App Type và API permissions',
            };
          }

          if (data.code !== '0' && data.code !== 0) {
            return {
              original,
              error: data.message || `Lỗi Lazada code: ${data.code}`,
              hint : data.code === 'ISP_SYSTEM_ERROR' ? 'Lỗi hệ thống Lazada, thử lại sau' : '',
            };
          }

          const { affiliate, short } = extractAffUrl(data);
          if (!affiliate) {
            return {
              original,
              error: 'Lazada không trả về affiliate URL (response không có aff_url)',
              raw  : JSON.stringify(data).slice(0, 300),
            };
          }

          return { original, affiliate, short };
        } catch (e) {
          return { original, error: e.message };
        }
      })
    );

    res.json({ results });
  });

  /* ── GET /api/lazada/debug ──────────────────────── */
  /* Endpoint debug: gọi thử API với URL mẫu, trả raw response */
  app.get('/api/lazada/debug', async (req, res) => {
    const envErr = checkEnv();
    if (envErr) return res.status(500).json({ ...envErr });
    try {
      const raw = await lazadaCall('/affiliate/customized/url/get', {
        urls: 'https://www.lazada.vn/',
      });
      res.json({ raw });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
