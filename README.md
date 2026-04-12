# WaterMark Pro 🖼️

Đóng dấu ảnh hàng loạt, push lên GitHub, lấy raw URL dùng ngay.

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

**4. Cấu hình `.env`**
```bash
cp .env.example .env
```
```env
GH_OWNER=your_github_username
GH_REPO=my-images
GH_BRANCH=main
GH_FOLDER=img
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

**5. Chạy**
```bash
npm run dev   # development
npm start     # production
```
→ [http://localhost:3000](http://localhost:3000)

---

## Deploy lên Render

1. Push code lên GitHub (không push `.env`)
2. Tạo Web Service → Build: `npm install` · Start: `npm start`
3. Thêm Environment Variables (5 biến trong `.env`)
4. Deploy ✅

---

## Gỡ lỗi

| Lỗi | Cách xử lý |
|-----|------------|
| `Repo là private` | GitHub Settings → Make public |
| `Token không hợp lệ` | Tạo token mới, scope `public_repo` |
| `Token không có quyền ghi` | Chọn lại scope `public_repo` khi tạo token |
| `Repo không tồn tại` | Kiểm tra GH_OWNER, GH_REPO trong `.env` |
| `Branch không tồn tại` | Đặt GH_BRANCH là `main` hoặc `master` |

Nhấn **🔌 Test** trong app để kiểm tra cấu hình trước khi push.

---

## Cấu trúc

```
watermark-pro/
├── public/index.html   # UI (HTML + CSS + JS)
├── server.js           # Express + GitHub API proxy
├── .env                # Cấu hình local (không commit)
├── .env.example
└── package.json
```

---

## License

MIT
