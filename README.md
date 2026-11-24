# Quant Portfolio Terminal v2.0

Hệ thống phân tích, tối ưu hóa và kiểm thử danh mục đầu tư định lượng theo kiến trúc:

- **Backend**: Python 3.11+ · FastAPI · Pydantic v2 · Polars · DuckDB · NumPy · SciPy · scikit-learn · yfinance
- **Frontend**: React 18 · TypeScript (`strict`) · Vite · Tailwind CSS · Plotly.js · Lucide Icons

---

## 1. Tính năng cốt lõi (5 phân hệ phân tích)

| Phân hệ                       | Nội dung chính                                                                                                                                                                                                                                                                                 |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Danh Mục (`PortfolioTab`)** | Hero KPI (Lợi nhuận ròng, CAGR, Active Return vs SPY, Sharpe/Sortino/Calmar, CAPM Alpha, Regime), phân bổ hiện tại vs tối ưu (**Max Sharpe Ledoit-Wolf** / **HRP**), biểu đồ tăng trưởng `$1` (4 đường) và Đường biên hiệu quả Monte Carlo.                                                    |
| **Rủi Ro (`RiskTab`)**        | Volatility năm hóa, Max Drawdown, Historical VaR & CVaR (95%), ma trận tương quan tài sản, phân phối lợi nhuận ngày, Drawdown, Rolling Volatility 20 phiên, Rolling Beta 20 phiên và tương quan Động lượng 12-1 tháng.                                                                         |
| **Tín Hiệu (`SignalsTab`)**   | Động cơ tín hiệu xu hướng **MA20 / MA50** vector hóa bằng Polars theo tỷ trọng danh mục, khuyến nghị `BUY` (> 55%), `HOLD` (45%–55%), `SELL` (< 45%) và bảng kiểm toán 20 phiên gần nhất.                                                                                                      |
| **Kiểm Thử (`BacktestTab`)**  | Động cơ **Walk-Forward Regime-Switching** nhân quả (không look-ahead bias, độ trễ thực thi 1 phiên `t-1 → t`), mô phỏng trôi tỷ trọng, tính Turnover & khấu trừ phí giao dịch + trượt giá (**Gross vs Net**), tiền mặt ở trạng thái `BEAR` hưởng lãi suất phi rủi ro `^IRX` thả nổi theo ngày. |
| **Nhân Tố (`FactorsTab`)**    | Hồi quy **OLS đa biến** trên các nhân tố trực giao hóa (`SPY - Rf`, `QQQ - SPY`, `IWM - SPY`, `^VIX %Δ`) kèm t-stat, $R^2$, Alpha đa biến, Jensen's Alpha, Treynor Ratio, biểu đồ lợi nhuận chủ động tích lũy và bản đồ nhiệt Rolling Beta 60 phiên.                                           |

### Các đảm bảo về tài chính định lượng & kỹ thuật

- **Zero Look-Ahead Bias**: Nhận diện trạng thái thị trường (`BULL` / `NEUTRAL` / `BEAR`) dùng phân vị trượt 252 phiên quá khứ; Walk-Forward chỉ ước lượng tỷ trọng trên dữ liệu quá khứ trước ngày `t` và thực thi trễ 1 phiên.
- **Vùng đệm & Đồng bộ ngày tự động**: Tự động kéo lùi **390 ngày dương lịch** để đủ lịch sử tính `MA200`, `12-1 Momentum` và cửa sổ Walk-Forward; tự động loại bỏ mã lỗi, chuẩn hóa lại tỷ trọng và dời `effective_start_date` khi gặp mã mới IPO.
- **DuckDB Cache-Aside an toàn đa luồng**: Chỉ tải bù mã mới hoặc khoảng ngày đầu/đuôi bị khuyết từ Yahoo Finance, bảo vệ truy cập bằng `threading.RLock`, không lưu kết quả rỗng.

---

## 2. Cấu trúc mã nguồn

```text
portfolio-terminal/
├── backend/
│   ├── app/
│   │   ├── main.py                 # Khởi tạo FastAPI, lifespan (MarketDataStore), CORS, /health
│   │   ├── routes.py               # Thin HTTP controllers (/api/analyze, /api/cache/*)
│   │   ├── dependencies.py         # Dependency Injection cho store & analysis service
│   │   └── schemas.py              # Pydantic v2 request/response schemas đầy đủ (strict contract)
│   ├── services/
│   │   └── analysis_service.py     # Tầng dịch vụ điều phối toàn bộ pipeline định lượng
│   ├── config/
│   │   └── settings.py             # Hằng số định lượng & cấu hình từ biến môi trường
│   ├── data/
│   │   ├── loader.py               # MarketDataStore (DuckDB Cache-Aside + yfinance + Polars)
│   │   └── processor.py            # Làm sạch, forward-fill, đồng bộ ngày & tách warm-up/eval
│   ├── quant/
│   │   ├── optimizer.py            # Ledoit-Wolf Max Sharpe, HRP & Monte Carlo Frontier
│   │   ├── regime.py               # Phân loại trạng thái thị trường nhân quả (SPY + ^VIX)
│   │   ├── risk.py                 # Drawdown, VaR/CVaR, tương quan & rolling metrics vector hóa
│   │   ├── factors.py              # Hồi quy OLS đa biến & CAPM
│   │   └── indicators.py           # Tín hiệu MA20/MA50 & 12-1 Month Momentum
│   ├── backtest/
│   │   ├── engine.py               # Mô phỏng danh mục tĩnh & Walk-Forward Regime Backtest
│   │   └── metrics.py              # CAGR, Sharpe, Sortino, Calmar, Max Drawdown
│   ├── tests/
│   │   ├── test_quant_pipeline.py  # Kiểm thử zero look-ahead, optimizer, OLS, rolling risk
│   │   └── test_data_and_api.py    # Kiểm thử processor, indicators, DuckDB cache & API endpoints
│   ├── pyproject.toml              # Cấu hình project & pytest
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts           # HTTP client gọi FastAPI (hỗ trợ AbortSignal)
│   │   ├── constants/terminal.ts   # Bảng nhãn tiếng Việt & bảng màu biểu đồ dùng chung
│   │   ├── types/portfolio.ts      # Interface TypeScript khớp 1-1 với backend schemas
│   │   ├── utils/
│   │   │   ├── format.ts           # Định dạng ngày DD/MM/YYYY, %, USD, PnL tone/trend
│   │   │   └── weights.ts          # Hàm thuần parse ticker & cân bằng tỷ trọng khóa mã
│   │   ├── components/
│   │   │   ├── Sidebar.tsx         # Khung thanh điều khiển trái
│   │   │   ├── sidebar/            # 4 phân khu độc lập (Config, Weights, QuantParams, Cache)
│   │   │   ├── tabs/               # 5 tab phân tích (Portfolio, Risk, Signals, Backtest, Factors)
│   │   │   ├── MetricCard.tsx      # Thẻ KPI chuẩn Fintech (tabular-nums, trend badge)
│   │   │   └── PlotlyChart.tsx     # Wrapper Plotly.js Dark Terminal + ResizeObserver
│   │   ├── App.tsx                 # Root shell quản lý state, AbortController & điều hướng tab
│   │   └── index.css               # Design tokens & utility classes
│   ├── vite.config.ts              # Proxy /api & /health sang cổng 8000, tách chunk plotly
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
├── .gitignore
└── README.md
```

---

## 3. Yêu cầu hệ thống

- **Python**: 3.11+ (đã kiểm thử trên Python 3.13)
- **Node.js**: 18+ và `npm`
- Kết nối Internet ở lần tải dữ liệu đầu tiên cho mỗi mã cổ phiếu (sau đó dữ liệu được lưu đệm cục bộ bằng DuckDB).

---

## 4. Hướng dẫn cài đặt và khởi chạy

### Bước 1: Khởi chạy Backend (FastAPI)

```powershell
cd backend
python -m venv .venv

# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt

# Khởi chạy API server tại http://127.0.0.1:8000
uvicorn app.main:app --reload --port 8000
```

- Tài liệu tương tác OpenAPI (Swagger UI): `http://127.0.0.1:8000/docs`
- Kiểm tra tình trạng máy chủ: `GET http://127.0.0.1:8000/health`

### Bước 2: Khởi chạy Frontend (Vite + React)

Mở một cửa sổ terminal khác tại thư mục gốc dự án:

```powershell
cd frontend
npm install
npm run dev
```

Truy cập ứng dụng tại `http://localhost:5173`. Vite dev server tự động proxy toàn bộ yêu cầu `/api/*` và `/health` sang Backend ở `http://127.0.0.1:8000`.

---

## 5. Biến môi trường (tùy chọn)

### Backend

| Biến                         | Mặc định                                      | Mô tả                                                                |
| :--------------------------- | :-------------------------------------------- | :------------------------------------------------------------------- |
| `PORTFOLIO_DB_PATH`          | `backend/data/market_data.duckdb`             | Đường dẫn file cơ sở dữ liệu DuckDB lưu đệm giá lịch sử              |
| `API_CORS_ORIGINS`           | `http://localhost:5173,http://127.0.0.1:5173` | Danh sách origin được phép gọi API (phân tách bằng dấu phẩy)         |
| `API_CORS_ALLOW_CREDENTIALS` | `true`                                        | Cho phép gửi credentials qua CORS (tự động tắt nếu origins chứa `*`) |

### Frontend

| Biến                | Mặc định               | Mô tả                                                                      |
| :------------------ | :--------------------- | :------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `""` (dùng Vite proxy) | URL gốc của Backend khi deploy tách domain (vd: `https://api.example.com`) |

---

## 6. Các endpoint API chính

| Method   | Endpoint            | Mô tả                                                                         |
| :------- | :------------------ | :---------------------------------------------------------------------------- |
| `GET`    | `/health`           | Kiểm tra trạng thái hoạt động của API engine                                  |
| `POST`   | `/api/analyze`      | Chạy toàn bộ pipeline phân tích, tối ưu hóa, backtest và nhân tố cho danh mục |
| `GET`    | `/api/cache/status` | Xem số mã đã lưu đệm, số dòng, khoảng ngày và dung lượng file DuckDB          |
| `DELETE` | `/api/cache/clear`  | Xóa toàn bộ dữ liệu giá trong bộ nhớ đệm DuckDB                               |

---

## 7. Kiểm thử và Build Production

### Chạy bộ kiểm thử Backend (`pytest`)

```powershell
cd backend
pytest
```

(`backend/pyproject.toml` đã cấu hình sẵn `pythonpath = ["."]`, `testpaths = ["tests"]` và `addopts = "-v"`.)

### Kiểm tra kiểu TypeScript & Build Frontend

```powershell
cd frontend
npm run build
```

Lệnh trên chạy `tsc` ở chế độ `strict` trước khi đóng gói sản phẩm vào `frontend/dist/` (đã tách riêng vendor chunk `plotly` để tối ưu bộ nhớ đệm trình duyệt).
