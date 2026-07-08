import os, sys, json, shutil, threading, re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyzer

ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOADS = os.path.join(ROOT, 'uploads')
CACHE = os.path.join(UPLOADS, 'data.json')
LAST_GPX = os.path.join(UPLOADS, 'last.gpx')
os.makedirs(UPLOADS, exist_ok=True)

status = {'busy': False, 'progress': '', 'error': None}
status_lock = threading.Lock()

config = {'min_dist_m': 1200, 'min_deniv_m': 100}
CONFIG_PATH = os.path.join(UPLOADS, 'config.json')

def load_config():
    global config
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                config.update(json.load(f))
        except Exception:
            pass

def save_config():
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f)

load_config()

def recompute(path, min_dist_m=None, min_deniv_m=None):
    global config
    if min_dist_m is not None:
        config['min_dist_m'] = min_dist_m
    if min_deniv_m is not None:
        config['min_deniv_m'] = min_deniv_m
    save_config()
    with status_lock:
        status['busy'] = True
        status['progress'] = 'Analyse en cours...'
        status['error'] = None
    try:
        data = analyzer.analyze_gpx(path, config['min_dist_m'], config['min_deniv_m'])
        with open(CACHE, 'w') as f:
            json.dump(data, f)
        shutil.copy(path, LAST_GPX)
    finally:
        with status_lock:
            status['busy'] = False
            status['progress'] = ''

class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/api/data':
            if os.path.exists(CACHE):
                with open(CACHE) as f:
                    self._send(200, f.read())
            else:
                self._send(200, json.dumps({'course': None, 'sections': []}))
            return
        if u.path == '/api/status':
            with status_lock:
                self._send(200, json.dumps(dict(status)))
            return
        if u.path == '/api/config':
            self._send(200, json.dumps(dict(config)))
            return
        # static files
        fname = u.path.lstrip('/')
        if fname == '':
            fname = 'index.html'
        fpath = os.path.join(ROOT, fname)
        if os.path.isfile(fpath) and fname not in ('analyzer.py', 'server.py'):
            with open(fpath, 'rb') as f:
                ext = os.path.splitext(fpath)[1].lower()
                ct = {'.html': 'text/html', '.js': 'application/javascript',
                      '.css': 'text/css', '.json': 'application/json'}.get(ext, 'application/octet-stream')
                self._send(200, f.read(), ct)
        else:
            self._send(404, 'Not found')

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == '/api/upload':
            ctype = self.headers.get('Content-Type', '')
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b''
            fname = None
            data = b''
            if 'multipart/form-data' in ctype:
                m = re.search(r'boundary=(.*)', ctype)
                if m:
                    boundary = m.group(1).strip().encode()
                    parts = body.split(b'--' + boundary)
                    for part in parts:
                        if b'filename=' in part and b'Content-Type:' in part:
                            hm = re.search(r'filename="([^"]+)"', part.decode('utf-8', 'ignore'))
                            if hm:
                                fname = hm.group(1)
                            # data after the double CRLF
                            idx = part.find(b'\r\n\r\n')
                            if idx != -1:
                                data = part[idx+4:]
                                if data.endswith(b'\r\n'):
                                    data = data[:-2]
                if fname and data:
                    tmp = os.path.join(UPLOADS, 'upload.gpx')
                    with open(tmp, 'wb') as o:
                        o.write(data)
                    md = int(parse_qs(urlparse(self.path).query).get('min_dist', [config['min_dist_m']])[0])
                    mv = int(parse_qs(urlparse(self.path).query).get('min_deniv', [config['min_deniv_m']])[0])
                    t = threading.Thread(target=recompute, args=(tmp, md, mv), daemon=True)
                    t.start()
                    self._send(200, json.dumps({'accepted': True}))
                    return
            self._send(400, json.dumps({'error': 'no file'}))
            return
        if u.path == '/api/recompute':
            md = int(parse_qs(u.query).get('min_dist', [config['min_dist_m']])[0])
            mv = int(parse_qs(u.query).get('min_deniv', [config['min_deniv_m']])[0])
            src = LAST_GPX if os.path.exists(LAST_GPX) else None
            if src is None:
                self._send(400, json.dumps({'error': 'aucun GPX en cache'}))
                return
            t = threading.Thread(target=recompute, args=(src, md, mv), daemon=True)
            t.start()
            self._send(200, json.dumps({'accepted': True}))
            return
        self._send(404, 'Not found')

    def log_message(self, *a):
        pass

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8765'))
    print(f"Serveur sur http://localhost:{port}")
    HTTPServer(('0.0.0.0', port), H).serve_forever()
