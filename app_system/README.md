# 協會法規智慧索引系統 (Legal Index System)

這是一個專為「儲蓄互助協會」開發的輕量級法規檢索系統。支援 PDF 與 Word 檔案的全文搜尋、自動高亮以及行動裝置適配。

## 🚀 核心功能
- **全文檢索**：一秒搜尋上百份法規文件內文。
- **自動高亮**：點擊搜尋結果，自動在 PDF 或 Word 預覽中標記關鍵字位置。
- **自動定位**：開啟 PDF 後自動跳轉至關鍵字所在的頁面。
- **行動化設計**：專為手機優化的滿版閱讀介面。
- **雲端化維護**：只需將新法規上傳至 GitHub 的 `data/` 資料夾，系統即自動更新索引。

## 📂 目錄結構
- `data/`: 存放原始法規檔案 (.pdf, .docx)。
- `static/`: 前端介面程式碼 (HTML, CSS, JS)。
- `main.py`: FastAPI 後端主程式。
- `indexer.py`: 文件解析與搜尋索引建立工具。
- `requirements.txt`: 系統套件依賴清單。

## 🛠️ 維護與更新法規
1. **新增檔案**：將新的法規檔案丟入 GitHub 的 `data` 資料夾。
2. **自動部署**：Render 會偵測到更新，自動執行 `indexer.py` 重新掃描並建立索引。
3. **完成**：新法規即可被搜尋。

## 💻 本地開發
1. 建立虛擬環境：`python -m venv venv`
2. 安裝套件：`pip install -r requirements.txt`
3. 建立索引：`python indexer.py`
4. 啟動系統：`python main.py`
5. 訪問：`http://localhost:8000`

---
*Powered by FastAPI & PDF.js*
