# 武警六盘水支队战斗作战筹划平台

Python Flask + 纯 HTML/CSS/JS 实现

## 环境要求

- Python 3.8+
- MySQL 5.7+

## 快速启动

```bash
# 安装依赖
pip install -r requirements.txt

# 切割敌情图片（首次运行）
python split_images.py

# 启动服务
python app.py
```

访问 http://127.0.0.1:5000

## 登录信息

- 账号：WJLPSZHD
- 密码：WJLPSZHD  
- 口令：作风优良

## 功能页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 登录 | /login | 账号/密码/口令验证 |
| 启动 | /boot | 进度条加载动画 |
| 仪表盘 | /dashboard | 导航/目标/地图/分析 |
| 分析判断 | (仪表盘内) | 敌情/我情/战场/综合 |
| 作战决心 | /decision | 打字显示+语音录入 |
| 构想方案 | /concept | 方向/目标/决心 |
| 作战计划 | /formulate | 文书表格+上传 |
| 作战推演 | /wargame | 地图+时间线 |
| 情况输入 | /situation | 情况通报编辑 |
| 系统管理 | /admin | 用户增删查 |

## 数据库

MySQL `wujing_platform` 库，启动时自动创建表和默认管理员账号。
