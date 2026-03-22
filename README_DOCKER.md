# 🚗 oto-crawler – Hướng dẫn triển khai bằng Docker

> Chạy Web Crawler oto.com.vn trên **bất kỳ máy nào** chỉ cần Docker  
> — không cần Node.js, không cần cài thêm gì —

---

## 📁 Cấu trúc file cần thiết

```
your-folder/
├── Dockerfile           ← Build image
├── docker-compose.yml   ← (tuỳ chọn) dùng với docker compose
├── .dockerignore
├── crawler.sh           ← Script chạy nhanh (Linux/Mac)
├── crawler.ps1          ← Script chạy nhanh (Windows PowerShell)
└── <source code>        ← Chỉ cần khi BUILD – không cần khi chạy ở máy khác
```

---

## 🔨 Bước 0 – Build image (chỉ làm 1 lần tại máy có source)

```bash
# Linux / Mac
docker build -t oto-crawler:latest .

# Windows PowerShell
docker build -t oto-crawler:latest .
```

---

## 📦 Mang image sang máy khác (không cần source code)

### Cách 1 – File .tar.gz (USB / mạng nội bộ)

```bash
# Máy nguồn: xuất ra file
docker save oto-crawler:latest | gzip > oto-crawler.tar.gz

# Máy đích: nạp vào
docker load < oto-crawler.tar.gz         # Linux/Mac
Get-Content oto-crawler.tar.gz | docker load   # Windows PowerShell
```

### Cách 2 – Docker Hub / Registry

```bash
# Máy nguồn: đẩy lên
docker tag oto-crawler:latest yourname/oto-crawler:latest
docker push yourname/oto-crawler:latest

# Máy đích: kéo về
docker pull yourname/oto-crawler:latest
docker tag yourname/oto-crawler:latest oto-crawler:latest
```

---

## 🚀 Chạy Crawler (tại máy đích – chỉ cần Docker + script)

> Copy 3 file sang máy đích: `crawler.sh` (hoặc `crawler.ps1`) + `docker-compose.yml`  
> Dữ liệu tự động lưu vào thư mục `crawler-data/` ngay bên cạnh script

### Linux / Mac

```bash
chmod +x crawler.sh

./crawler.sh categories       # Bước 1a – Lấy hãng xe
./crawler.sh subcategories    # Bước 1b – Lấy dòng xe
./crawler.sh queue            # Bước 2  – Khởi tạo hàng đợi
./crawler.sh run              # Bước 3  – Chạy crawler

./crawler.sh check            # Bước 4  – Kiểm tra tính toàn vẹn
./crawler.sh repair           # Bước 5  – Vá lỗi

# Chạy toàn bộ 1 lần:
./crawler.sh all

# Tuỳ chỉnh số luồng:
WORKERS=5 ./crawler.sh run
```

### Windows PowerShell

```powershell
.\crawler.ps1 categories
.\crawler.ps1 subcategories
.\crawler.ps1 queue
.\crawler.ps1 run               # Mặc định 3 workers
.\crawler.ps1 run -Workers 5    # Tuỳ chỉnh workers

.\crawler.ps1 check
.\crawler.ps1 repair

# Chạy toàn bộ:
.\crawler.ps1 all -Workers 5
```

### Docker Compose (tuỳ chọn)

```bash
docker compose run --rm crawler crawl:categories
docker compose run --rm crawler crawl:subcategories
docker compose run --rm crawler crawl:queue
WORKERS=5 docker compose run --rm crawler crawl:run
docker compose run --rm crawler integrity:check
docker compose run --rm crawler integrity:repair
```

---

## 📂 Dữ liệu đầu ra

```
crawler-data/
├── data/
│   ├── categories.json          ← Danh sách hãng xe
│   ├── subcategories.json       ← Danh sách dòng xe
│   ├── subcategory_queue.json   ← Hàng đợi (có dedup + crash recovery)
│   ├── visited_ids.json         ← ID đã crawl
│   ├── repair_queue.json        ← Danh sách xe cần vá lỗi
│   └── vehicles/
│       └── <brand>/
│           └── <id>.json        ← Dữ liệu từng xe
└── logs/
    └── integrity_report.json    ← Báo cáo tính toàn vẹn
```

---

## ⚙️ Biến môi trường

| Biến            | Mặc định | Ý nghĩa                           |
|-----------------|----------|-----------------------------------|
| `WORKERS`       | `3`      | Số luồng crawler đồng thời        |
| `MAX_RETRIES`   | `3`      | Số lần thử lại khi lỗi            |
| `REQUEST_DELAY` | `1500`   | Delay giữa các request (ms)       |
| `PAGE_TIMEOUT`  | `30000`  | Timeout mỗi trang (ms)            |
| `HEADLESS`      | `true`   | Ẩn/hiện trình duyệt Chromium      |

---

## 💡 Ghi chú quan trọng

- **Crash Recovery**: Nếu terminal bị tắt giữa chừng khi đang `run`, chỉ cần chạy lại  
  `./crawler.sh run` — crawler sẽ tiếp tục từ trang đang dở, **không crawl lại từ đầu**.

- **Deduplication**: Bước `queue` tự động loại bỏ URL trùng lặp bằng `url_hash`.

- **Dữ liệu an toàn**: Dù xoá container, dữ liệu trong `crawler-data/` vẫn còn nguyên.
