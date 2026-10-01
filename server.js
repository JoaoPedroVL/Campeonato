// Servidor local do Torneio de Robôs — sem dependências externas
// Uso: node server.js  →  http://localhost:8000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
// Senha do painel admin (mude aqui ou use a var de ambiente ADMIN_SENHA)
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'robotica123';
// Token de sessão derivado da senha (não expõe a senha no cookie)
const TOKEN = crypto.createHash('sha256').update('torneio:' + ADMIN_SENHA).digest('hex');

function isAdmin(req) {
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim());
  return cookies.includes('admin_auth=' + TOKEN);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// Valida nome da categoria (apenas letras, números, - e _)
const catOk = (c) => /^[a-zA-Z0-9_-]{1,40}$/.test(c);

const estadoInicial = () => ({ competidores: [], lutas: {}, atualizadoEm: null });

function lerEstado(cat) {
  const file = path.join(DATA_DIR, cat + '.json');
  if (!fs.existsSync(file)) return estadoInicial();
  try {
    return { ...estadoInicial(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return estadoInicial();
  }
}

function salvarEstado(cat, estado) {
  estado.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(DATA_DIR, cat + '.json'), JSON.stringify(estado, null, 2));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // ---- API ----
  const m = pathname.match(/^\/api\/torneio\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const cat = m[1];
    if (!catOk(cat)) { res.writeHead(400); return res.end('{"error":"categoria invalida"}'); }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(lerEstado(cat)));
    }
    if (req.method === 'PUT') {
      // Escrita (admin) exige sessão logada (cookie) ou header com senha
      if (!isAdmin(req) && req.headers['x-admin-senha'] !== ADMIN_SENHA) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end('{"error":"acesso restrito"}');
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const estado = JSON.parse(body);
          salvarEstado(cat, { competidores: estado.competidores || [], lutas: estado.lutas || {} });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(400); res.end('{"error":"json invalido"}');
        }
      });
      return;
    }
  }

  if (pathname === '/api/categorias' && req.method === 'GET') {
    const cats = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(cats));
  }

  // ---- Login de admin ----
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let senha;
      try { senha = JSON.parse(body).senha; } catch {}
      if (senha === ADMIN_SENHA) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `admin_auth=${TOKEN}; Path=/; HttpOnly; SameSite=Lax`
        });
        res.end('{"ok":true}');
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end('{"error":"senha incorreta"}');
      }
    });
    return;
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ admin: isAdmin(req) }));
  }

  if (pathname === '/api/logout') {
    res.writeHead(302, {
      'Set-Cookie': 'admin_auth=; Path=/; HttpOnly; Max-Age=0',
      'Location': '/home.html'
    });
    return res.end();
  }

  // ---- Página protegida: admin.html exige login (redireciona p/ tela de login) ----
  if (pathname === '/admin.html' && !isAdmin(req)) {
    const next = encodeURIComponent(pathname + url.search);
    res.writeHead(302, { Location: `/login.html?next=${next}` });
    return res.end();
  }

  // ---- Estáticos ----
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  let filePath = path.join(ROOT, pathname === '/' ? 'home.html' : pathname);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nao encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('=== TORNEIO DE ROBOS (servidor local) ===');
  console.log(`Home:     http://localhost:${PORT}`);
  console.log(`Categorias: http://localhost:${PORT}/api/categorias`);
});
