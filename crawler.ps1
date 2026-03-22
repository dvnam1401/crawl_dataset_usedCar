# ================================================================
#  crawler.ps1 – Script tiện lợi chạy oto-crawler qua Docker
#  Dùng: .\crawler.ps1 <lệnh>
#  VD:   .\crawler.ps1 categories
# ================================================================
param(
    [Parameter(Position=0)]
    [string]$Command = "help",

    [int]$Workers     = $env:WORKERS      ?? 3,
    [int]$MaxRetries  = $env:MAX_RETRIES  ?? 3,
    [int]$Delay       = $env:REQUEST_DELAY ?? 1500,
    [int]$Timeout     = $env:PAGE_TIMEOUT  ?? 30000,
    [string]$Headless = $env:HEADLESS      ?? "true"
)

$IMAGE    = "oto-crawler:latest"
$DATA_DIR = Join-Path $PSScriptRoot "crawler-data"
$SHM      = "512mb"

# ── Màu sắc ──
function Write-Banner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║     🚗  oto-crawler  (Docker Edition)     ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Help {
    Write-Banner
    Write-Host "Cách dùng:" -ForegroundColor White
    Write-Host "  .\crawler.ps1 <lệnh> [-Workers N]`n"
    Write-Host "Các lệnh có sẵn:" -ForegroundColor White
    Write-Host "  categories    " -NoNewline -ForegroundColor Green; Write-Host "Bước 1a – Lấy danh sách hãng xe"
    Write-Host "  subcategories " -NoNewline -ForegroundColor Green; Write-Host "Bước 1b – Lấy danh sách dòng xe"
    Write-Host "  queue         " -NoNewline -ForegroundColor Green; Write-Host "Bước 2  – Khởi tạo hàng đợi (có dedup)"
    Write-Host "  run           " -NoNewline -ForegroundColor Green; Write-Host "Bước 3  – Chạy crawler (đa luồng + crash recovery)"
    Write-Host "  check         " -NoNewline -ForegroundColor Green; Write-Host "Bước 4  – Kiểm tra tính toàn vẹn"
    Write-Host "  repair        " -NoNewline -ForegroundColor Green; Write-Host "Bước 5  – Vá lỗi tự động"
    Write-Host "  all           " -NoNewline -ForegroundColor Green; Write-Host "Chạy toàn bộ Bước 1→3 tự động"
    Write-Host "  build         " -NoNewline -ForegroundColor Green; Write-Host "Build Docker image từ source"
    Write-Host "  save          " -NoNewline -ForegroundColor Green; Write-Host "Xuất image ra file .tar.gz"
    Write-Host "  load          " -NoNewline -ForegroundColor Green; Write-Host "Nạp image từ file .tar.gz"
    Write-Host ""
    Write-Host "Ví dụ:" -ForegroundColor White
    Write-Host "  .\crawler.ps1 run -Workers 5"
    Write-Host "  .\crawler.ps1 all -Workers 3 -Headless false"
    Write-Host ""
    Write-Host "Dữ liệu đầu ra:" -ForegroundColor White
    Write-Host "  $DATA_DIR\data\    ← JSON + queue files"
    Write-Host "  $DATA_DIR\logs\    ← Log & integrity report"
}

function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "✗ Docker chưa được cài đặt!" -ForegroundColor Red
        Write-Host "  Tải tại: https://docs.docker.com/get-docker/"
        exit 1
    }
    $check = docker image inspect $IMAGE 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Image '$IMAGE' không tồn tại!" -ForegroundColor Red
        Write-Host "  Hãy build image trước: .\crawler.ps1 build" -ForegroundColor Yellow
        exit 1
    }
}

function Invoke-CrawlerStep {
    param([string]$Label, [string]$NpmCommand)

    Write-Host "`n▶ $Label" -ForegroundColor Cyan
    Write-Host "  docker run ... npm run $NpmCommand`n" -ForegroundColor Yellow

    $dataMount = "${DATA_DIR}\data:/app/data"
    $logsMount = "${DATA_DIR}\logs:/app/logs"

    docker run --rm `
        -v $dataMount `
        -v $logsMount `
        --shm-size=$SHM `
        -e WORKERS=$Workers `
        -e MAX_RETRIES=$MaxRetries `
        -e REQUEST_DELAY=$Delay `
        -e PAGE_TIMEOUT=$Timeout `
        -e HEADLESS=$Headless `
        $IMAGE $NpmCommand

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n✗ Lỗi khi chạy: $NpmCommand (exit: $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "`n✔ Hoàn thành: $Label" -ForegroundColor Green
}

# ── Tạo thư mục data nếu chưa có ──
New-Item -ItemType Directory -Force -Path "$DATA_DIR\data\vehicles" | Out-Null
New-Item -ItemType Directory -Force -Path "$DATA_DIR\logs"          | Out-Null

Write-Banner

switch ($Command) {
    "build" {
        Write-Host "▶ Build Docker image..." -ForegroundColor Cyan
        docker build -t $IMAGE .
        if ($LASTEXITCODE -eq 0) { Write-Host "✔ Build thành công: $IMAGE" -ForegroundColor Green }
    }
    "save" {
        Write-Host "▶ Xuất image ra oto-crawler.tar.gz ..." -ForegroundColor Cyan
        docker save $IMAGE | gzip > oto-crawler.tar.gz
        Write-Host "✔ Đã lưu: oto-crawler.tar.gz" -ForegroundColor Green
        Write-Host "  → Copy sang máy khác rồi chạy: .\crawler.ps1 load"
    }
    "load" {
        Write-Host "▶ Nạp image từ oto-crawler.tar.gz ..." -ForegroundColor Cyan
        Get-Content oto-crawler.tar.gz -Raw | docker load
        Write-Host "✔ Nạp thành công!" -ForegroundColor Green
    }
    "categories"    { Test-Docker; Invoke-CrawlerStep "Bước 1a – Lấy danh sách hãng xe"  "crawl:categories" }
    "subcategories" { Test-Docker; Invoke-CrawlerStep "Bước 1b – Lấy danh sách dòng xe"  "crawl:subcategories" }
    "queue"         { Test-Docker; Invoke-CrawlerStep "Bước 2 – Khởi tạo hàng đợi"        "crawl:queue" }
    "run"           { Test-Docker; Invoke-CrawlerStep "Bước 3 – Chạy Crawler (Workers=$Workers)" "crawl:run" }
    "check"         { Test-Docker; Invoke-CrawlerStep "Bước 4 – Kiểm tra tính toàn vẹn"   "integrity:check" }
    "repair"        { Test-Docker; Invoke-CrawlerStep "Bước 5 – Vá lỗi tự động"           "integrity:repair" }
    "all" {
        Test-Docker
        Write-Host "▶ Chạy toàn bộ pipeline (Bước 1 → 3)..." -ForegroundColor White
        Invoke-CrawlerStep "Bước 1a – Lấy danh sách hãng xe"  "crawl:categories"
        Invoke-CrawlerStep "Bước 1b – Lấy danh sách dòng xe"  "crawl:subcategories"
        Invoke-CrawlerStep "Bước 2 – Khởi tạo hàng đợi"        "crawl:queue"
        Invoke-CrawlerStep "Bước 3 – Chạy Crawler"              "crawl:run"
        Write-Host "`n🎉 Pipeline hoàn tất!" -ForegroundColor Green
        Write-Host "  Dữ liệu lưu tại: $DATA_DIR\data\"
    }
    default { Write-Help }
}
