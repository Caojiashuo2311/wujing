import pymysql
import bcrypt
from config import DB_CONFIG

def get_db():
    return pymysql.connect(**DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)

def init_database():
    conn = pymysql.connect(host=DB_CONFIG['host'], port=DB_CONFIG['port'],
                           user=DB_CONFIG['user'], password=DB_CONFIG['password'],
                           charset='utf8mb4')
    cur = conn.cursor()
    cur.execute("CREATE DATABASE IF NOT EXISTS wujing_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    conn.close()

    db = get_db()
    cur = db.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin','user') DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            uploaded_by INT,
            seat_name VARCHAR(100),
            doc_title VARCHAR(255),
            status ENUM('pending','received') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Insert default admin
    hashed = bcrypt.hashpw('WJLPSZHD'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    cur.execute("SELECT id FROM users WHERE username='WJLPSZHD'")
    if not cur.fetchone():
        cur.execute("INSERT INTO users (username, password, role) VALUES (%s, %s, 'admin')",
                    ('WJLPSZHD', hashed))
    db.commit()
    db.close()
    print("Database initialized.")

if __name__ == '__main__':
    init_database()
