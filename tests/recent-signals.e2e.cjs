const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');

const baseURL = process.env.GIFTLOOP_BASE_URL || 'http://127.0.0.1:3124';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const makeData = () => ({
  profile: {},
  friends: [{
    id: 'friend-xiaoyu', name: '小雨', relationship: '好友', mbti: 'INFP',
    personalityTags: ['重视体验'], interests: ['摄影'], importantDates: [],
    giftPreferences: [], giftAvoidances: [], gender: 'female', avatarStyle: 'female-01'
  }],
  memories: [], giftRecords: [], recentSignals: [],
  onboarding: { profileCompleted: true, firstFriendCompleted: true }
});

async function pageWithData(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(seed => {
    if (localStorage.getItem('giftloop_recent_signals_seeded') === '1') return;
    localStorage.setItem('giftloop_mode', 'user');
    localStorage.setItem('giftloop_user_data', JSON.stringify(seed));
    localStorage.setItem('giftloop_recent_signals_seeded', '1');
  }, makeData());
  return { context, page };
}

async function openRecords(page) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('.screen.active .nav [data-go="records"]').click();
}

async function run(name, test) {
  try { await test(); console.log('PASS', name); }
  catch (error) { console.error('FAIL', name, error); process.exitCode = 1; }
}

(async () => {
  let server;
  let mockProvider;
  let providerPayload;
  if (!process.env.GIFTLOOP_BASE_URL) {
    mockProvider = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        providerPayload = JSON.parse(body || '{}');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const isGiftRequest = providerPayload.messages?.[0]?.content?.includes('送礼决策助手');
        const content = isGiftRequest ? {
          summary: '结合近期信号',
          recommendations: [1, 2, 3].map(index => ({ title: `方向${index}`, category: '兴趣体验', imageKey: 'experience', reason: '结合胶片摄影', budget: '¥300–500', tags: ['摄影'] }))
        } : { signals: [
          { type: 'interest_preference', content: '胶片摄影' },
          { type: 'recent_need', content: '最近想布置房间' }
        ] };
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
      });
    });
    await new Promise(resolve => mockProvider.listen(3125, '127.0.0.1', resolve));
    server = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: '3124', DASHSCOPE_API_KEY: 'test-key', DASHSCOPE_BASE_URL: 'http://127.0.0.1:3125', QWEN_MODEL: 'test-model' }, stdio: 'ignore' });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try { const response = await fetch(baseURL); if (response.ok) break; }
      catch (error) { if (attempt === 39) throw error; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  const browser = await chromium.launch({ headless: true, executablePath });

  await run('后端复用千问调用并按三类白名单返回信号', async () => {
    const response = await fetch(`${baseURL}/api/memory-signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://liuying2112517020.github.io' },
      body: JSON.stringify({ friend: { name: '小雨' }, record: { title: '最近开始喜欢胶片摄影', detail: '还想重新布置房间' } })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://liuying2112517020.github.io');
    const result = await response.json();
    assert.deepEqual(result.signals.map(signal => signal.type), ['interest_preference', 'recent_need']);
    assert.equal(providerPayload.model, 'test-model');
    assert.match(providerPayload.messages[0].content, /interest_preference/);
    assert.match(providerPayload.messages[0].content, /最多返回 3 条/);
  });

  await run('后端礼物 Prompt 明确读取 Recent Signals', async () => {
    const response = await fetch(`${baseURL}/api/gift-recommend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        friend: { name: '小雨', personality: ['INFP'], interests: ['摄影'], recentSignals: [{ type: 'interest_preference', content: '胶片摄影' }] },
        occasion: '生日', budget: '¥300–500'
      })
    });
    assert.equal(response.status, 200);
    assert.match(providerPayload.messages[1].content, /Recent Signals：interest_preference：胶片摄影/);
    assert.match(providerPayload.messages[1].content, /生日/);
    assert.match(providerPayload.messages[1].content, /¥300–500/);
  });

  await run('记录立即保存，AI 信号异步提取并独立持久化', async () => {
    const { context, page } = await pageWithData(browser);
    try {
      await page.route('**/api/memory-signals', async route => {
        await new Promise(resolve => setTimeout(resolve, 450));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signals: [
          { type: 'interest_preference', content: '胶片摄影' },
          { type: 'recent_need', content: '最近想布置房间' }
        ] }) });
      });
      await openRecords(page);
      await page.locator('[data-open-note]').click();
      await page.locator('#noteEvent').fill('小雨最近开始喜欢胶片摄影');
      await page.locator('#noteExtra').fill('还说想重新布置一下房间。');
      await page.locator('[data-save-note]').click();

      await page.locator('.memory-ai-understanding.is-loading').waitFor();
      const immediate = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
      assert.equal(immediate.memories.length, 1);
      assert.deepEqual(immediate.recentSignals, []);

      await page.locator('.memory-ai-understanding:not(.is-loading)').waitFor();
      const label = await page.locator('.memory-ai-understanding').textContent();
      assert.match(label, /胶片摄影/);
      assert.match(label, /最近想布置房间/);

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
      assert.equal(saved.recentSignals.length, 2);
      assert.equal(saved.recentSignals[0].friendId, 'friend-xiaoyu');
      assert.equal(saved.recentSignals[0].sourceRecordId, saved.memories[0].id);
      assert.ok(saved.recentSignals.every(signal => signal.createdAt));

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.screen.active .nav [data-go="records"]').click();
      await page.locator('.memory-ai-understanding:not(.is-loading)').waitFor();
      assert.match(await page.locator('.memory-ai-understanding').textContent(), /胶片摄影/);
    } finally { await context.close(); }
  });

  await run('Recent Signals 真实进入礼物推荐请求并可作为依据', async () => {
    const { context, page } = await pageWithData(browser);
    let giftPayload;
    try {
      await page.route('**/api/gift-recommend', async route => {
        giftPayload = route.request().postDataJSON();
        const recommendations = [1, 2, 3].map(index => ({
          title: `方向${index}`, category: index === 1 ? '纪念定制' : '兴趣体验', directionType: `方向${index}`,
          imageKey: index === 1 ? 'memory' : 'experience', reason: '结合胶片摄影与本次生日需求。', details: [],
          evidence: [{ source: 'memory', reference: '胶片摄影', text: '近期兴趣线索' }],
          selectionTips: [], products: [], budget: '¥300–500', tags: ['摄影']
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: '结合近期线索', recommendations }) });
      });
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('giftloop_user_data'));
        data.recentSignals = [
          { id: 'signal-1', friendId: 'friend-xiaoyu', type: 'interest_preference', content: '胶片摄影', sourceRecordId: 'memory-1', createdAt: '2026-10-14T10:00:00.000Z' },
          { id: 'signal-2', friendId: 'friend-xiaoyu', type: 'recent_need', content: '最近想布置房间', sourceRecordId: 'memory-1', createdAt: '2026-10-14T10:00:00.000Z' }
        ];
        localStorage.setItem('giftloop_user_data', JSON.stringify(data));
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.giftLoopOpenFlow('friend-xiaoyu', '生日'));
      const success = await page.evaluate(() => window.giftLoopGenerateGiftIdeas());
      assert.equal(success, true);
      assert.deepEqual(giftPayload.friend.recentSignals.map(signal => signal.content), ['胶片摄影', '最近想布置房间']);
      assert.match(giftPayload.extraNote, /Recent Signals：胶片摄影、最近想布置房间/);
      await page.locator('[data-screen="results"].active').waitFor();
    } finally { await context.close(); }
  });

  await run('AI 分析失败不影响原始记录保存且不显示错误区域', async () => {
    const { context, page } = await pageWithData(browser);
    try {
      await page.route('**/api/memory-signals', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'temporary failure' }) }));
      await openRecords(page);
      await page.locator('[data-open-note]').click();
      await page.locator('#noteEvent').fill('一起散步');
      await page.locator('[data-save-note]').click();
      await page.waitForFunction(() => !document.querySelector('.memory-ai-understanding.is-loading'));
      assert.equal(await page.locator('.memory-card').count(), 1);
      assert.equal(await page.locator('.memory-ai-understanding').count(), 0);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
      assert.equal(saved.memories.length, 1);
      assert.deepEqual(saved.recentSignals, []);
    } finally { await context.close(); }
  });

  await browser.close();
  server?.kill();
  mockProvider?.close();
  if (process.exitCode) process.exit(process.exitCode);
})();
