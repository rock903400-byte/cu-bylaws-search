import os
import sqlite3
import tempfile
from firebase_functions import https_fn, options
from firebase_admin import initialize_app
from google.cloud import storage as gcs_storage

# 初始化 Firebase Admin
initialize_app()

# 環境變數 (直接寫死您提供的 Bucket 名稱，免去設定煩惱)
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "my-legal")
GCS_INTERNAL_BUCKET_NAME = os.environ.get("GCS_INTERNAL_BUCKET_NAME", "my-legal2")
DB_FILENAME = "legal_index.db"
LOCAL_DB_PATH = os.path.join(tempfile.gettempdir(), DB_FILENAME)
PROJECT_ROOT_DB = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", DB_FILENAME)
)

# 環境切換：偵測是否在模擬器執行
IS_EMULATOR = os.environ.get("FUNCTIONS_EMULATOR", "false") == "true"

# 全域變數，用來保存連線 (Warm Start 優化)
_db_conn = None


def get_db_connection():
    """從本地或 GCS 取得資料庫連線 (實作智慧快取)"""
    global _db_conn

    # 1. 如果連線已存在且有效，直接回傳 (連線池優化)
    if _db_conn:
        try:
            _db_conn.execute("SELECT 1")
            return _db_conn
        except Exception:
            _db_conn = None

    # 2. 如果在本地模擬器且根目錄有 DB，優先使用 (開發用)
    if IS_EMULATOR and os.path.exists(PROJECT_ROOT_DB):
        print(f"Emulator: Using local database from root: {PROJECT_ROOT_DB}")
        _db_conn = sqlite3.connect(PROJECT_ROOT_DB)
        _db_conn.row_factory = sqlite3.Row
        return _db_conn

    # 3. 智慧快取同步邏輯
    try:
        client = gcs_storage.Client()
        bucket = client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(DB_FILENAME)

        should_download = True

        # 檢查本地檔案是否存在且與雲端同步
        if os.path.exists(LOCAL_DB_PATH):
            try:
                # 取得雲端檔案的最新更新時間 (Metadata)
                blob.reload()
                remote_mtime = blob.updated.timestamp()
                local_mtime = os.path.getmtime(LOCAL_DB_PATH)

                # 如果本地檔案比較新或一樣，就不需要再下載
                if local_mtime >= remote_mtime:
                    print(
                        f"Cloud: Using cached database (Local: {local_mtime}, Remote: {remote_mtime})"
                    )
                    should_download = False
            except Exception as meta_err:
                print(
                    f"Cloud: Metadata check failed, falling back to cached file if exists: {meta_err}"
                )
                should_download = not os.path.exists(LOCAL_DB_PATH)

        if should_download:
            print(f"Cloud: Syncing {DB_FILENAME} from GCS bucket: {GCS_BUCKET_NAME}...")
            blob.download_to_filename(LOCAL_DB_PATH)

            # 對齊時間戳記以便下次比對
            try:
                blob.reload()
                remote_mtime = blob.updated.timestamp()
                os.utime(LOCAL_DB_PATH, (remote_mtime, remote_mtime))
            except Exception:
                pass

        _db_conn = sqlite3.connect(LOCAL_DB_PATH)
        _db_conn.row_factory = sqlite3.Row
        return _db_conn
    except Exception as e:
        print(f"GCS Sync Error: {e}")
        # 如果下載失敗，嘗試使用現有的快取
        if os.path.exists(LOCAL_DB_PATH):
            _db_conn = sqlite3.connect(LOCAL_DB_PATH)
            _db_conn.row_factory = sqlite3.Row
            return _db_conn
        raise e


@https_fn.on_request(
    cors=options.CorsOptions(cors_origins="*", cors_methods=["get", "post"]), memory=512
)
def api(req: https_fn.Request) -> https_fn.Response:
    """處理 /api/search 與 /api/file 請求"""
    path = req.path.strip("/")

    # 處理檔案代理請求 (僅限本地開發使用)
    if "file" in path:
        if not IS_EMULATOR:
            return https_fn.Response(
                "File proxy only available in emulator", status=403
            )

        filename = req.args.get("filename")
        source = req.args.get("source", "association")
        # ... (其餘讀取本地檔案邏輯保持不變)
        data_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "data")
        )
        file_path = os.path.join(data_dir, source, filename)
        if not os.path.exists(file_path) and source == "association":
            file_path = os.path.join(data_dir, filename)

        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                content = f.read()
            ext = os.path.splitext(filename)[1].lower()

            # 設定正確的 MIME 類型 (Content-Type)
            if ext == ".pdf":
                mimetype = "application/pdf"
            elif ext == ".docx":
                mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            else:
                mimetype = "application/octet-stream"

            return https_fn.Response(content, mimetype=mimetype)
        return https_fn.Response("File Not Found", status=404)

    if "search" not in path:
        return https_fn.Response("Not Found", status=404)

    query_str = req.args.get("q")
    source = req.args.get("source", "association")

    if not query_str:
        return https_fn.Response({"error": "Missing query parameter 'q'"}, status=400)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 搜尋邏輯 (混合 FTS5 與 LIKE 模糊搜尋，增加中文命中率)
        search_query = """
            SELECT title, category, content, filename, path
            FROM docs
            WHERE (docs MATCH ? OR title LIKE ? OR content LIKE ?) AND (source = ? OR source IS NULL)
            ORDER BY rank
        """
        term_like = f"%{query_str}%"

        try:
            cursor.execute(search_query, (query_str, term_like, term_like, source))
        except sqlite3.OperationalError:
            # 如果 FTS5 報錯，回退到純模糊搜尋
            search_query = """
                SELECT title, category, content, filename, path
                FROM docs
                WHERE (title LIKE ? OR content LIKE ?) AND (source = ? OR source IS NULL)
            """
            cursor.execute(search_query, (term_like, term_like, source))

        results = cursor.fetchall()

        output = []
        for row in results:
            content = row["content"]
            match_pos = content.lower().find(query_str.lower())
            if match_pos == -1:
                match_pos = 0
            start = max(0, match_pos - 30)
            end = min(len(content), match_pos + 50)
            preview = content[start:end].replace("\n", " ").replace("\r", "")

            # 建立網址：本地用代理，雲端直連 GCS
            if IS_EMULATOR:
                file_url = f"/api/file?source={source}&filename={row['filename']}"
            else:
                target_bucket = (
                    GCS_BUCKET_NAME
                    if source == "association"
                    else GCS_INTERNAL_BUCKET_NAME
                )
                file_url = (
                    f"https://storage.googleapis.com/{target_bucket}/{row['filename']}"
                )

            output.append(
                {
                    "title": row["title"],
                    "category": row["category"],
                    "preview": f"...{preview}...",
                    "filename": row["filename"],
                    "url": file_url,
                    "keyword": query_str,
                }
            )

        conn.close()
        import json

        return https_fn.Response(
            json.dumps(output, ensure_ascii=False), mimetype="application/json"
        )
    except Exception as e:
        print(f"API Error: {str(e)}")
        return https_fn.Response(f"Internal Error: {str(e)}", status=500)
