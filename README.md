# WaterMark Pro 🖼️

Công cụ đóng dấu ảnh hàng loạt, tự động push lên GitHub để lấy raw URL dùng luôn.

Built with: **Node.js + Express** · **Canvas API** · **GitHub Contents API** · **Bootstrap 5**

---

## Tính năng

- Upload nhiều ảnh cùng lúc (drag & drop hoặc click)
- Đóng dấu watermark tùy chỉnh: text, font, cỡ, màu, góc xoay, độ mờ, khoảng cách, đổ bóng
- Preview realtime trên canvas
- Push ảnh đã watermark lên GitHub → trả về raw URL dùng ngay
- Kiểm tra kết nối GitHub trước khi push (nút **🔌 Test**)
- Tải ảnh về máy (đơn lẻ hoặc tất cả)
- Token GitHub **không lộ ra client** — xử lý hoàn toàn phía server

---

## Cài đặt

### 1. Clone & cài dependencies

```bash
git clone https://github.com/YOUR_USERNAME/watermark-pro.git
cd watermark-pro
npm install
```

### 2. Tạo Personal Access Token GitHub

1. Vào [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Chọn scope: **`repo`** (private repo) hoặc **`public_repo`** (public repo)
4. Copy token

### 3. Tạo repo GitHub để lưu ảnh

Tạo một repo mới (public hoặc private) trên GitHub. Ví dụ: `my-images`.

**Quan trọng:** Repo phải có ít nhất 1 commit (tạo file README khi tạo repo).

### 4. Cấu hình `.env`

Copy file mẫu và điền thông tin:

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
GH_OWNER=your_github_username      # Username hoặc org GitHub
GH_REPO=my-images                  # Tên repo chứa ảnh
GH_BRANCH=main                     # Branch (mặc định: main)
GH_FOLDER=img                      # Thư mục trong repo (mặc định: img)
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx  # Personal Access Token

PORT=3000
```

### 5. Chạy

```bash
# Development
npm run dev

# Production
npm start
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

---

## Deploy lên Render

1. Push code lên GitHub (**không** push file `.env`)
2. Tạo Web Service mới trên [render.com](https://render.com)
3. Chọn repo, cấu hình:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Thêm **Environment Variables** (thay cho `.env`):

| Key | Value |
|-----|-------|
| `GH_OWNER` | your_github_username |
| `GH_REPO` | my-images |
| `GH_BRANCH` | main |
| `GH_FOLDER` | img |
| `GH_TOKEN` | ghp_xxxxxxxxxxxxxxxxxxxx |

5. Deploy → done ✅

---

## Gỡ lỗi: "Push thất bại: Not Found"

Lỗi này xảy ra khi GitHub API trả về 404. Nguyên nhân thường gặp:

| Nguyên nhân | Cách xử lý |
|-------------|------------|
| `GH_OWNER` hoặc `GH_REPO` sai | Kiểm tra chính tả trong `.env` |
| Repo chưa tồn tại | Tạo repo trên GitHub trước |
| Repo private + token thiếu quyền | Đảm bảo token có scope **`repo`** (không chỉ `public_repo`) |
| Token hết hạn | Tạo token mới tại [github.com/settings/tokens](https://github.com/settings/tokens) |
| `GH_BRANCH` sai | Kiểm tra tên branch (thường là `main` hoặc `master`) |
| Repo chưa có commit nào | Tạo file README khi tạo repo |

**Cách kiểm tra nhanh:** Nhấn nút **🔌 Test** trong ứng dụng để kiểm tra kết nối GitHub trước khi push.

---

## Cấu trúc dự án

```
watermark-pro/
├── public/
│   └── index.html      # Toàn bộ UI (HTML + CSS + JS)
├── img/                # Placeholder (ảnh push lên GitHub repo riêng)
├── server.js           # Express server + GitHub API proxy
├── package.json
├── .env                # Cấu hình local (không commit)
├── .env.example        # Mẫu cấu hình
├── .gitignore
└── README.md
```

---

## API Endpoints

### `POST /api/github-push`
Push ảnh lên GitHub.

**Body:**
```json
{ "filename": "img_0_wm.png", "base64": "<base64 string>" }
```

**Response OK:**
```json
{ "url": "https://raw.githubusercontent.com/owner/repo/main/img/img_0_wm.png" }
```

**Response lỗi:**
```json
{ "error": "Mô tả lỗi", "hint": "Cách khắc phục" }
```

### `GET /api/check-config`
Kiểm tra cấu hình `.env` và kết nối tới GitHub repo.

**Response OK:**
```json
{ "ok": true, "repo": "owner/repo", "branch": "main", "private": false, "message": "✅ Kết nối thành công..." }
```

---

## License

MIT
