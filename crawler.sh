#!/usr/bin/env bash
# ================================================================
#  crawler.sh – Script tiện lợi chạy oto-crawler qua Docker
#  Dùng: ./crawler.sh <lệnh>
#  VD:   ./crawler.sh categories
# ================================================================

IMAGE="oto-crawler:latest"
DATA_DIR="$(pwd)/crawler-data"
SHM="512mb"

# Màu sắc terminal
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

print_banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ╔═══════════════════════════════════════════╗"
  echo "  ║     🚗  oto-crawler  (Docker Edition)     ║"
  echo "  ╚═══════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_help() {
  print_banner
  echo -e "${BOLD}Cách dùng:${NC}"
  echo "  ./crawler.sh <lệnh> [tùy-chọn]"
  echo ""
  echo -e "${BOLD}Các lệnh có sẵn:${NC}"
  echo -e "  ${GREEN}categories${NC}      Bước 1a – Lấy danh sách hãng xe"
  echo -e "  ${GREEN}subcategories${NC}   Bước 1b – Lấy danh sách dòng xe"
  echo -e "  ${GREEN}queue${NC}           Bước 2  – Khởi tạo hàng đợi (có dedup)"
  echo -e "  ${GREEN}run${NC}             Bước 3  – Chạy crawler (đa luồng + crash recovery)"
  echo -e "  ${GREEN}check${NC}           Bước 4  – Kiểm tra tính toàn vẹn"
  echo -e "  ${GREEN}repair${NC}          Bước 5  – Vá lỗi tự động"
  echo -e "  ${GREEN}all${NC}             Chạy toàn bộ Bước 1→3 tự động"
  echo ""
  echo -e "${BOLD}Biến môi trường:${NC}"
  echo "  WORKERS=5 ./crawler.sh run    (mặc định: 3)"
  echo "  HEADLESS=false ./crawler.sh run"
  echo ""
  echo -e "${BOLD}Dữ liệu đầu ra:${NC}"
  echo "  ${DATA_DIR}/data/    ← JSON + queue files"
  echo "  ${DATA_DIR}/logs/    ← Log & integrity report"
}

run_step() {
  local label="$1"
  local cmd="$2"
  echo -e "\n${CYAN}▶ ${BOLD}${label}${NC}"
  echo -e "${YELLOW}  docker run ... npm run ${cmd}${NC}\n"

  docker run --rm \
    -v "${DATA_DIR}/data:/app/data" \
    -v "${DATA_DIR}/logs:/app/logs" \
    --shm-size="${SHM}" \
    -e WORKERS="${WORKERS:-3}" \
    -e MAX_RETRIES="${MAX_RETRIES:-3}" \
    -e REQUEST_DELAY="${REQUEST_DELAY:-1500}" \
    -e PAGE_TIMEOUT="${PAGE_TIMEOUT:-30000}" \
    -e HEADLESS="${HEADLESS:-true}" \
    "${IMAGE}" "${cmd}"

  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo -e "\n${RED}✗ Lỗi khi chạy: ${cmd} (exit code: ${exit_code})${NC}"
    exit $exit_code
  fi
  echo -e "\n${GREEN}✔ Hoàn thành: ${label}${NC}"
}

check_docker() {
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}✗ Docker chưa được cài đặt!${NC}"
    echo "  Tải tại: https://docs.docker.com/get-docker/"
    exit 1
  fi

  if ! docker image inspect "${IMAGE}" &>/dev/null; then
    echo -e "${RED}✗ Image '${IMAGE}' không tồn tại!${NC}"
    echo -e "  Hãy build image trước: ${YELLOW}./crawler.sh build${NC}"
    exit 1
  fi
}

# Tạo thư mục data nếu chưa có
mkdir -p "${DATA_DIR}/data/vehicles" "${DATA_DIR}/logs"

print_banner

case "${1:-help}" in
  build)
    echo -e "${CYAN}▶ Build Docker image...${NC}"
    docker build -t "${IMAGE}" .
    echo -e "${GREEN}✔ Build thành công: ${IMAGE}${NC}"
    ;;
  save)
    echo -e "${CYAN}▶ Xuất image ra file oto-crawler.tar ...${NC}"
    docker save "${IMAGE}" | gzip > oto-crawler.tar.gz
    echo -e "${GREEN}✔ Đã lưu: oto-crawler.tar.gz ($(du -sh oto-crawler.tar.gz | cut -f1))${NC}"
    echo "  → Copy file này sang máy khác rồi chạy: ./crawler.sh load"
    ;;
  load)
    echo -e "${CYAN}▶ Nạp image từ oto-crawler.tar.gz ...${NC}"
    docker load < oto-crawler.tar.gz
    echo -e "${GREEN}✔ Nạp thành công!${NC}"
    ;;
  categories)
    check_docker
    run_step "Bước 1a – Lấy danh sách hãng xe" "crawl:categories"
    ;;
  subcategories)
    check_docker
    run_step "Bước 1b – Lấy danh sách dòng xe" "crawl:subcategories"
    ;;
  queue)
    check_docker
    run_step "Bước 2 – Khởi tạo hàng đợi" "crawl:queue"
    ;;
  run)
    check_docker
    run_step "Bước 3 – Chạy Crawler (WORKERS=${WORKERS:-3})" "crawl:run"
    ;;
  check)
    check_docker
    run_step "Bước 4 – Kiểm tra tính toàn vẹn" "integrity:check"
    ;;
  repair)
    check_docker
    run_step "Bước 5 – Vá lỗi tự động" "integrity:repair"
    ;;
  all)
    check_docker
    echo -e "${BOLD}▶ Chạy toàn bộ pipeline (Bước 1 → 3)...${NC}"
    run_step "Bước 1a – Lấy danh sách hãng xe"  "crawl:categories"
    run_step "Bước 1b – Lấy danh sách dòng xe"  "crawl:subcategories"
    run_step "Bước 2 – Khởi tạo hàng đợi"        "crawl:queue"
    run_step "Bước 3 – Chạy Crawler"              "crawl:run"
    echo -e "\n${GREEN}${BOLD}🎉 Pipeline hoàn tất!${NC}"
    echo -e "  Dữ liệu lưu tại: ${DATA_DIR}/data/"
    ;;
  help|--help|-h|*)
    print_help
    ;;
esac
