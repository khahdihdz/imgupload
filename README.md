# WaterMark Pro 🖼️ v4.0

Đóng dấu ảnh hàng loạt, push lên GitHub, lấy raw URL dùng ngay.
Kèm **File Manager** — duyệt, xem trước, xóa ảnh trong GitHub repo.

> Chỉ hỗ trợ **public repo**. Token cần scope **`public_repo`**.

---

## Cài đặt nhanh

**1. Cài dependencies**
```bash
npm install
```

**2. Tạo token GitHub**
→ [github.com/settings/tokens](https://github.com/settings/tokens) → Classic Token → scope: `public_repo`

**3. Tạo repo public** trên GitHub (cần ít nhất 1 commit)

**4. Tạo GitHub OAuth App** (cho File Manager)
→ [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App
- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/auth/github/callback`
- (Trên Render thay `localhost:3000` bằng URL thật)

**5. Cấu hình `.env`**
```bash
cp .env.example .env
```
```env
GH_OWNER=your_github_username
GH_REPO=my-images
GH_BRANCH=main
GH_FOLDER=img
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
GITHUB_ADMIN_USERNAME=your_github_username

SESSION_SECRET=random_long_secret_string
```

**6. Chạy**
```bash
npm run dev   # development
npm start     # production
```
→ [http://localhost:3000](http://localhost:3000)

---

## File Manager

Truy cập `/filemanager.html`:
1. Nhấn **Đăng nhập với GitHub** → xác thực OAuth
2. Chỉ tài khoản khớp `GITHUB_ADMIN_USERNAME` mới vào được
3. Duyệt ảnh dạng grid · Preview · Copy URL · Xóa file
4. Chọn nhiều file → Xóa hàng loạt
5. Tìm kiếm & sắp xếp

---

## Deploy lên Render

1. Push code lên GitHub (không push `.env`)
2. Tạo Web Service → Build: `npm install` · Start: `npm start`
3. Thêm Environment Variables (tất cả biến trong `.env`)
4. Cập nhật Callback URL trong GitHub OAuth App thành URL Render thật
5. Deploy ✅

---

## Gỡ lỗi

| Lỗi | Cách xử lý |
|-----|------------|
| `Repo là private` | GitHub Settings → Make public |
| `Token không hợp lệ` | Tạo token mới, scope `public_repo` |
| `Chưa cấu hình GITHUB_CLIENT_ID` | Thêm biến vào `.env` |
| `Tài khoản không phải Admin` | Cập nhật `GITHUB_ADMIN_USERNAME` |
| `Callback URL mismatch` | Cập nhật OAuth App callback URL |

---

## Cấu trúc

```
watermark-pro/
├── public/
│   ├── index.html        # WaterMark UI
│   ├── lazada.html       # Lazada Affiliate
│   ├── filemanager.html  # File Manager (mới v4.0)
│   └── style.css         # Shared design system
├── server.js             # Express + GitHub API + OAuth
├── lazada-api.js         # Lazada OpenAPI routes
├── .env                  # Cấu hình local (không commit)
├── .env.example
└── package.json
```

---

## License

MIT
