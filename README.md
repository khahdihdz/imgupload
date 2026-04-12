# WaterMark Pro 🖼️

Công cụ đóng dấu ảnh hàng loạt, tự động push lên GitHub để lấy raw URL dùng luôn.

Built with: **Node.js + Express** · **Canvas API** · **GitHub Contents API** · **Bootstrap 5**

> ⚠️ **Yêu cầu:** Chỉ hỗ trợ **public repo**. Repo private sẽ bị từ chối khi kiểm tra cấu hình.

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
3. Chọn scope: ✅ **`public_repo`**
4. Copy token

### 3. Tạo repo GitHub public để lưu ảnh

Tạo một **public repo** mới trên GitHub. Ví dụ: `my-images`.

**Quan trọng:** Repo phải có ít nhất 1 commit (tạo file README khi tạo repo).

### 4. Cấu hình `.env`

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
GH_OWNER=your_github_username      # Username hoặc org GitHub
GH_REPO=my-images                  # Tên repo PUBLIC chứa ảnh
GH_BRANCH=main                     # Branch (mặc định: main)
GH_FOLDER=img                      # Thư mục trong repo (mặc định: img)
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx  # Personal Access Token (scope: public_repo)

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
4. Thêm **Environment Variables**:

| Key | Value |
|-----|-------|
| `GH_OWNER` | your_github_username |
| `GH_REPO` | my-images |
| `GH_BRANCH` | main |
| `GH_FOLDER` | img |
| `GH_TOKEN` | ghp_xxxxxxxxxxxxxxxxxxxx |

5. Deploy → done ✅

---

## Gỡ lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|------------|
| `Repo là private` | Repo chưa được đặt là public | GitHub → Settings → Danger Zone → **Make public** |
| `Token không hợp lệ` | Token hết hạn hoặc sai | Tạo token mới tại [github.com/settings/tokens](https://github.com/settings/tokens) |
| `Token không có quyền ghi` | Thiếu scope `public_repo` | Tạo lại token, chọn scope **`public_repo`** |
| `Repo không tồn tại` | GH_OWNER hoặc GH_REPO sai | Kiểm tra chính tả trong `.env` |
| `Branch không tồn tại` | GH_BRANCH sai | Đặt `main` hoặc `master` |

**Cách kiểm tra nhanh:** Nhấn nút **🔌 Test** trong ứng dụng — server sẽ xác minh cấu hình và báo lỗi cụ thể.

---

## Cấu trúc dự án

```
watermark-pro/
├── public/
│   └── index.html      # Toàn bộ UI (HTML + CSS + JS)
├── img/                # Placeholder
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

**Response OK:**
```json
{ "ok": true, "repo": "owner/repo", "branch": "main", "private": false, "message": "✅ Kết nối OK..." }
```

---

## License

MIT
