import os
import jwt
import bcrypt
import pymysql
import uuid
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, render_template, redirect, url_for, make_response, send_from_directory
from config import SECRET_KEY, DB_CONFIG, UPLOAD_FOLDER
from models import get_db, init_database
from flask_sock import Sock

app = Flask(__name__)
sock = Sock(app)
app.config['SECRET_KEY'] = SECRET_KEY
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ===== Auth Helpers =====
def get_current_user():
    token = request.cookies.get('auth_token')
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': '未登录'}), 401
            return redirect('/login')
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user or user.get('role') != 'admin':
            return jsonify({'error': '无权限'}), 403
        return f(*args, **kwargs)
    return decorated

# ===== Page Routes =====
@app.route('/')
def index():
    return redirect('/login')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/boot')
@login_required
def boot_page():
    return render_template('boot.html')

@app.route('/dashboard')
@login_required
def dashboard_page():
    return render_template('dashboard.html')


@app.route('/situation')
@login_required
def situation_page():
    return render_template('situation.html')

@app.route('/admin')
@login_required
@admin_required
def admin_page():
    return render_template('admin.html')

# ===== API Routes =====
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    username = data.get('username', '')
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': '请输入账号和密码'}), 400

    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("SELECT id, username, password, role FROM users WHERE username=%s", (username,))
        user = cur.fetchone()
    finally:
        db.close()

    if not user:
        return jsonify({'error': '账号或密码错误'}), 401
    if not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        return jsonify({'error': '账号或密码错误'}), 401

    token = jwt.encode({
        'id': user['id'],
        'username': user['username'],
        'role': user['role'],
        'exp': datetime.utcnow() + timedelta(hours=24)
    }, SECRET_KEY, algorithm='HS256')

    resp = make_response(jsonify({'success': True, 'user': {'id': user['id'], 'username': user['username'], 'role': user['role']}}))
    resp.set_cookie('auth_token', token, httponly=True, max_age=86400, path='/')
    return resp

@app.route('/api/logout', methods=['POST'])
def api_logout():
    resp = make_response(jsonify({'success': True}))
    resp.delete_cookie('auth_token', path='/')
    return resp

@app.route('/api/me')
def api_me():
    user = get_current_user()
    if not user:
        return jsonify({'error': '未登录'}), 401
    return jsonify({'user': {'id': user['id'], 'username': user['username'], 'role': user['role']}})

@app.route('/api/users', methods=['GET'])
@admin_required
def api_get_users():
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
        users = cur.fetchall()
    finally:
        db.close()
    for u in users:
        if u.get('created_at'):
            u['created_at'] = u['created_at'].isoformat()
    return jsonify({'users': users})

@app.route('/api/users', methods=['POST'])
@admin_required
def api_create_user():
    data = request.get_json()
    username = data.get('username', '').upper()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': '请输入账号和密码'}), 400
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("INSERT INTO users (username, password, role) VALUES (%s, %s, 'user')", (username, hashed))
        db.commit()
    except pymysql.err.IntegrityError:
        return jsonify({'error': '用户名已存在'}), 400
    finally:
        db.close()
    return jsonify({'success': True})

@app.route('/api/users', methods=['DELETE'])
@admin_required
def api_delete_user():
    uid = request.args.get('id')
    if not uid:
        return jsonify({'error': '缺少用户ID'}), 400
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("SELECT role FROM users WHERE id=%s", (uid,))
        row = cur.fetchone()
        if row and row['role'] == 'admin':
            return jsonify({'error': '不能删除管理员账号'}), 400
        cur.execute("DELETE FROM users WHERE id=%s", (uid,))
        db.commit()
    finally:
        db.close()
    return jsonify({'success': True})

@app.route('/api/upload', methods=['POST'])
@login_required
def api_upload():
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify({'error': '没有文件'}), 400
    ext = os.path.splitext(f.filename)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    f.save(filepath)

    user = get_current_user()
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("INSERT INTO files (filename, original_name, file_path, uploaded_by, seat_name, doc_title) VALUES (%s,%s,%s,%s,%s,%s)",
                    (filename, f.filename, filepath, user['id'], request.form.get('seat',''), request.form.get('title','')))
        db.commit()
    finally:
        db.close()
    return jsonify({'success': True, 'filename': filename})

# ===== Speech Recognition =====
def _find_model_dir():
    """Locate the vosk model directory, trying common locations."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(base_dir, 'vosk-model-small-cn-0.22'),
        os.path.join(base_dir, 'vosk-model'),
        r'C:\vosk-model',
    ):
        if os.path.exists(candidate):
            return candidate
    return None


def _is_ascii(s):
    try:
        s.encode('ascii')
        return True
    except UnicodeEncodeError:
        return False


def _ascii_safe_model_path(model_path):
    """Vosk (Kaldi C++) cannot open a model whose path contains non-ASCII
    characters on Windows. When that happens, copy the model once into an
    ASCII-only cache directory and return that path instead."""
    if _is_ascii(model_path):
        return model_path
    import tempfile, shutil
    base = tempfile.gettempdir()
    if not _is_ascii(base):
        base = os.path.join(os.environ.get('SystemDrive', 'C:') + os.sep, 'Temp')
    cache_dir = os.path.join(base, 'wujing_vosk_model', os.path.basename(model_path))
    marker = os.path.join(cache_dir, 'conf', 'model.conf')
    if not os.path.exists(marker):
        os.makedirs(os.path.dirname(cache_dir), exist_ok=True)
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir, ignore_errors=True)
        shutil.copytree(model_path, cache_dir)
    return cache_dir


@app.route('/api/speech', methods=['POST'])
@login_required
def speech_recognize():
    if 'audio' not in request.files:
        return jsonify({'error': '没有音频文件'}), 400
    audio_file = request.files['audio']
    import tempfile, json
    temp_id = uuid.uuid4().hex
    wav_path = os.path.join(tempfile.gettempdir(), f'speech_{temp_id}.wav')
    audio_file.save(wav_path)
    try:
        from vosk import Model, KaldiRecognizer
        import wave
        model_path = _find_model_dir()
        if not model_path:
            return jsonify({'error': '语音模型未安装，请下载 vosk-model-small-cn-0.22 并放到项目目录'}), 500
        model = Model(_ascii_safe_model_path(model_path))
        wf = wave.open(wav_path, 'rb')
        rec = KaldiRecognizer(model, wf.getframerate())
        rec.SetWords(True)
        text = ''
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                text += result.get('text', '')
        final = json.loads(rec.FinalResult())
        text += final.get('text', '')
        wf.close()
        return jsonify({'success': True, 'text': text})
    except ImportError as e:
        return jsonify({'error': f'缺少依赖库: {e}。请运行: pip install vosk'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

# ===== WebSocket Streaming Speech =====
_vosk_model = None
def get_vosk_model():
    global _vosk_model
    if _vosk_model is None:
        from vosk import Model
        model_path = _find_model_dir()
        if model_path:
            _vosk_model = Model(_ascii_safe_model_path(model_path))
    return _vosk_model

@sock.route('/ws/speech')
def ws_speech(ws):
    import json as _json
    from vosk import KaldiRecognizer
    try:
        model = get_vosk_model()
    except Exception as e:
        print(f'[Speech] Model load failed: {e}')
        try:
            ws.send(_json.dumps({'error': f'语音模型加载失败: {e}'}))
        except Exception:
            pass
        return
    if not model:
        ws.send(_json.dumps({'error': '语音模型未安装，请将 vosk-model-small-cn-0.22 放到项目目录'}))
        return
    rec = KaldiRecognizer(model, 16000)
    rec.SetWords(True)
    print('[Speech] WebSocket connected, model ready')
    try:
        while True:
            try:
                data = ws.receive(timeout=60)
            except Exception:
                break
            if data is None:
                break
            if isinstance(data, str):
                if data == 'EOF':
                    final = _json.loads(rec.FinalResult())
                    text = final.get('text', '')
                    if text:
                        ws.send(_json.dumps({'final': True, 'text': text}))
                    print(f'[Speech] EOF, final: {text}')
                    break
                continue
            # data is raw PCM int16 bytes
            if len(data) == 0:
                continue
            if rec.AcceptWaveform(data):
                result = _json.loads(rec.Result())
                text = result.get('text', '')
                if text:
                    ws.send(_json.dumps({'final': False, 'text': text}))
                    print(f'[Speech] Confirmed: {text}')
            else:
                partial = _json.loads(rec.PartialResult())
                ptext = partial.get('partial', '')
                if ptext:
                    ws.send(_json.dumps({'partial': True, 'text': ptext}))
    except Exception as e:
        print(f'[Speech] Error: {e}')
        try:
            ws.send(_json.dumps({'error': str(e)}))
        except:
            pass
    print('[Speech] WebSocket closed')

# ===== Init DB on startup =====
if __name__ == '__main__':
    init_database()
    # Auto-enable HTTPS if self-signed cert exists (needed for getUserMedia on remote access)
    ssl_ctx = None
    cert_path = '/etc/nginx/ssl/selfsigned.crt'
    key_path = '/etc/nginx/ssl/selfsigned.key'
    if os.path.exists(cert_path) and os.path.exists(key_path):
        ssl_ctx = (cert_path, key_path)
        print('[SSL] Serving HTTPS with self-signed cert')
    app.run(host='0.0.0.0', port=5000, debug=True, ssl_context=ssl_ctx)
