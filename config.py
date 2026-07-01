import os

SECRET_KEY = 'wujing_lps_zhd_2024_secret_key'

DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': 'root',
    'database': 'wujing_platform',
    'charset': 'utf8mb4',
}

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
