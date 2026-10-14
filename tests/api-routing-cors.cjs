const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const origins = ['https://liuying2112517020.github.io', 'https://giftloop-web.vercel.app'];
const endpoints = ['/api/gift-recommend', '/api/memory-signals'];

function selectedEndpoints(file, url) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const routing = html.match(/^\s*const usesRenderApi=.*\r?\n\s*const giftRecommendEndpoint=.*\r?\n\s*const memorySignalEndpoint=.*$/m);
  assert.ok(routing, `${file} API routing not found`);
  const location = new URL(url);
  return vm.runInNewContext(`${routing[0]}\n({giftRecommendEndpoint,memorySignalEndpoint})`, { location });
}

(async () => {
  for (const file of ['dist/index.html', 'docs/index.html']) {
    for (const url of ['https://liuying2112517020.github.io/giftloop/', 'https://giftloop-web.vercel.app/']) {
      const actual = selectedEndpoints(file, url);
      assert.equal(actual.giftRecommendEndpoint, `https://giftloop-api.onrender.com${endpoints[0]}`);
      assert.equal(actual.memorySignalEndpoint, `https://giftloop-api.onrender.com${endpoints[1]}`);
    }
    const local = selectedEndpoints(file, 'http://localhost:3000/');
    assert.equal(local.giftRecommendEndpoint, endpoints[0]);
    assert.equal(local.memorySignalEndpoint, endpoints[1]);
    console.log('PASS', file, 'GitHub Pages, Vercel and local API selection');
  }

  const provider = http.createServer((req, res) => {
    const isMemory = req.url.includes('memory');
    const result = isMemory ? { signals: [] } : {
      summary: '测试推荐',
      recommendations: [1, 2, 3].map(index => ({ title: `方向${index}`, category: '生活', imageKey: 'home', reason: '测试', budget: '¥100–300', tags: ['生活'] }))
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise(resolve => provider.listen(3135, '127.0.0.1', resolve));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: '3134', DASHSCOPE_API_KEY: 'test-key', DASHSCOPE_BASE_URL: 'http://127.0.0.1:3135', QWEN_MODEL: 'test-model' },
    stdio: 'ignore'
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try { ready = (await fetch('http://127.0.0.1:3134/api/health')).ok; if (ready) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.ok(ready, 'local server did not start');
    for (const endpoint of endpoints) {
      for (const origin of origins) {
        const url = `http://127.0.0.1:3134${endpoint}`;
        const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
        assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
        assert.match(preflight.headers.get('access-control-allow-headers'), /Content-Type/i);
        const body = endpoint.includes('memory')
          ? { friend: { name: '小雨' }, record: { title: '喜欢摄影', detail: '想布置房间' } }
          : { friend: { name: '小雨', interests: ['摄影'] }, occasion: '生日', budget: '¥100–300' };
        const post = await fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        assert.equal(post.status, 200, `${endpoint} from ${origin}: ${await post.text()}`);
        assert.equal(post.headers.get('access-control-allow-origin'), origin);
        console.log('PASS', endpoint, origin, 'OPTIONS and POST');
      }
      const denied = await fetch(`http://127.0.0.1:3134${endpoint}`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
      console.log('PASS', endpoint, 'untrusted origin denied');
    }
  } finally {
    server.kill();
    provider.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
