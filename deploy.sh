#!/bin/bash
# ============================================
# 武警六盘水支队联合战斗作战筹划平台 - 部署脚本
# 服务器: 阿里云 Ubuntu 22.04 / 2核4G
# ============================================

set -e

echo "===== 1. 安装系统依赖 ====="
apt update
apt install -y python3 python3-pip python3-venv mysql-server nginx

echo "===== 2. 配置 MySQL ====="
systemctl start mysql
systemctl enable mysql

# 创建数据库和用户（与 config.py 中的配置一致）
mysql -u root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';
CREATE DATABASE IF NOT EXISTS wujing_platform DEFAULT CHARACTER SET utf8mb4;
FLUSH PRIVILEGES;
EOF

echo "===== 3. 部署项目文件 ====="
PROJECT_DIR="/opt/wujing-platform"
mkdir -p $PROJECT_DIR
echo "请将项目文件上传到 $PROJECT_DIR"
echo "可使用: scp -r ./* root@服务器IP:$PROJECT_DIR/"

echo "===== 4. 创建 Python 虚拟环境 ====="
cd $PROJECT_DIR
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn

echo "===== 5. 创建 systemd 服务 ====="
cat > /etc/systemd/system/wujing.service <<EOF
[Unit]
Description=Wujing Platform
After=network.target mysql.service

[Service]
User=root
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin"
ExecStart=$PROJECT_DIR/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 --timeout 120 app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wujing
systemctl start wujing

echo "===== 6. 配置 Nginx 反向代理 ====="
cat > /etc/nginx/sites-available/wujing <<EOF
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 300s;
    }

    location /static/ {
        alias $PROJECT_DIR/static/;
        expires 7d;
    }
}
EOF

ln -sf /etc/nginx/sites-available/wujing /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "===== 7. 开放防火墙端口 ====="
ufw allow 80/tcp
ufw allow 443/tcp

echo ""
echo "============================================"
echo "  部署完成！"
echo "  访问地址: http://8.130.140.231"
echo "============================================"
