# legal-index-system

[![CI](https://github.com/rock903400-byte/cu-bylaws-search/actions/workflows/ci.yml/badge.svg)](https://github.com/rock903400-byte/cu-bylaws-search/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 協會法規智慧索引系統 — 儲蓄互助協會輕量級法規全文檢索系統

## 功能特色

- **全文檢索引擎**：支援解析 PDF 與 Word 等法規文件並將全文寫入 SQLite 資料庫建置索引。
- **自動高亮定位**：前端基於 PDF.js 實現檢視器之搜尋關鍵字自動高亮。
- **行動裝置優化**：具備完整的響應式介面，適配手機及平板操作。

## 技術棧

- **Backend**: FastAPI (Python)
- **Database**: SQLite (legal_index.db)
- **Frontend**: HTML, CSS, JavaScript (PDF.js)

## 快速開始

### 1. 安裝依賴環境
```bash
pip install -r requirements.txt
```

### 2. 建立法規全文索引
將 PDF/Word 文件置於 `data/` 目錄，並執行：
```bash
python indexer.py
```

### 3. 啟動 FastAPI 伺服器
```bash
uvicorn main:app --reload
```
啟動後可開啟瀏覽器存取 `http://127.0.0.1:8000`。

## 專案結構

```text
/
├── main.py             # FastAPI 路由與搜尋 API 接口
├── indexer.py          # 法規文件解析與 SQLite 索引建立腳本
├── legal_index.db      # SQLite 索引資料庫
├── static/             # 前端網頁靜態資源 (含 PDF.js 檢視器)
└── data/               # 原始法規文件目錄
```

## License

MIT
