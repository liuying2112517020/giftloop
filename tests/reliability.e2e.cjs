const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

const baseURL = process.env.GIFTLOOP_BASE_URL || 'http://127.0.0.1:3000';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const results = [];
const userData = () => ({
  profile: {},
  friends: [{
    id: 'user-friend-1', name: '阿澄', relationship: '好友', birthday: '2026-10-12', importantDates: [], mbti: 'INFP',
    personalityTags: ['细腻'], interests: ['阅读', '旅行'], notes: '', giftPreferences: [], giftAvoidances: [], gender: 'female', avatarStyle: 'female-02'
  }, {
    id: 'user-friend-2', name: '南星', relationship: '家人', birthday: '', importantDates: [], mbti: 'ENTP',
    personalityTags: ['有趣'], interests: ['音乐'], notes: '', giftPreferences: [], giftAvoidances: [], gender: 'male', avatarStyle: 'male-03'
  }],
  memories: [], giftRecords: [], onboarding: { profileCompleted: true, firstFriendCompleted: true }
});

async function withPage(browser, viewport, setup, test) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(data => {
    if (localStorage.getItem('giftloop_test_seeded') === '1') return;
    localStorage.setItem('giftloop_mode', 'user');
    localStorage.setItem('giftloop_user_data', JSON.stringify(data));
    localStorage.setItem('giftloop_test_seeded', '1');
  }, userData());
  if (setup) await setup(page);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  try { await test(page, context); } finally { await context.close(); }
}

async function run(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.error('FAIL', name, error); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });

  await run('User/Demo 数据隔离', async () => withPage(browser, { width: 390, height: 844 }, null, async page => {
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    const text = await page.locator('[data-screen="island"].active').innerText();
    assert.match(text, /阿澄/); assert.match(text, /南星/); assert.doesNotMatch(text, /小林|米米/);
  }));

  await run('AI 成功、当前朋友信息与防重复请求', async () => withPage(browser, { width: 390, height: 844 }, async page => {
    let requests = 0;
    await page.route('**/api/gift-recommend', async route => {
      requests += 1;
      await new Promise(resolve => setTimeout(resolve, 180));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        summary: '结合阅读和旅行，给出三个不同方向。',
        recommendations: [
          { title: '便携阅读灯', category: '实用生活', imageKey: 'home', reason: '适合喜欢阅读的阿澄。', details: ['喜欢阅读'], budget: '¥100–300', tags: ['阅读', '实用'] },
          { title: '旅行纪念册', category: '纪念定制', imageKey: 'memory', reason: '把旅途片段整理成专属回忆。', details: ['喜欢旅行'], budget: '¥100–300', tags: ['旅行', '纪念'] },
          { title: '城市书店漫游', category: '兴趣体验', imageKey: 'experience', reason: '把阅读兴趣变成共同体验。', details: ['阅读与旅行'], budget: '¥100–300', tags: ['体验', '陪伴'] }
        ]
      }) });
    });
    page.__requestCount = () => requests;
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('user-friend-1', '生日'));
    const generate = page.locator('[data-screen="preferences"].active [data-action="generate"]');
    await generate.click(); await generate.click({ force: true }).catch(() => {});
    await page.locator('[data-screen="results"].active').waitFor();
    assert.equal(page.__requestCount(), 1);
    assert.equal(await page.locator('.gift-idea-card').count(), 3);
    assert.match(await page.locator('.mock-result-head h1').innerText(), /阿澄/);
    assert.doesNotMatch(await page.locator('[data-screen="results"]').innerText(), /小林|咖啡 · 猫|最近搬家/);
  }));

  await run('AI 失败、重试与保留条件', async () => withPage(browser, { width: 390, height: 844 }, async page => {
    let attempt = 0;
    await page.route('**/api/gift-recommend', route => {
      attempt += 1;
      if (attempt === 1) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: '模拟服务异常' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: '重试成功', recommendations: [1,2,3].map((n) => ({ title: `方向${n}`, category: `类别${n}`, imageKey: 'home', reason: `理由${n}`, details: [`细节${n}`], budget: '¥100–300', tags: ['标签'] })) }) });
    });
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('user-friend-1', '生日'));
    await page.locator('#giftContext').fill('必须轻便');
    await page.locator('[data-screen="preferences"] [data-action="generate"]').click();
    await page.locator('#generationError:not([hidden])').waitFor();
    assert.match(await page.locator('#generationErrorMessage').innerText(), /模拟服务异常/);
    await page.locator('[data-retry-gift]').click();
    await page.locator('[data-screen="results"].active').waitFor();
    await page.locator('[data-screen="results"] [data-back]').click();
    assert.equal(await page.locator('#giftContext').inputValue(), '必须轻便');
  }));

  await run('AI 超时有明确出口', async () => withPage(browser, { width: 390, height: 844 }, async page => {
    await page.addInitScript(() => { window.__giftLoopRequestTimeoutMs = 120; });
    await page.route('**/api/gift-recommend', async () => { await new Promise(() => {}); });
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('user-friend-1', '生日'));
    await page.locator('[data-screen="preferences"] [data-action="generate"]').click();
    await page.locator('#generationError:not([hidden])').waitFor({ timeout: 3000 });
    assert.match(await page.locator('#generationErrorMessage').innerText(), /等待时间超过/);
    assert.equal(await page.locator('[data-retry-gift]').isVisible(), true);
    assert.equal(await page.locator('[data-return-preferences]').isVisible(), true);
  }));

  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await run(`记录保存可点击 ${viewport.width}x${viewport.height}`, async () => withPage(browser, viewport, null, async page => {
      await page.locator('.screen.active .nav button[data-go="records"]').click();
      await page.locator('[data-screen="records"].active [data-open-note]').click();
      await page.locator('#noteEvent').fill(`视口 ${viewport.width}`);
      const save = page.locator('.memory-composer.show [data-save-note]');
      await save.scrollIntoViewIfNeeded();
      const box = await save.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height);
      await save.click();
      await page.locator('.memory-composer.show').waitFor({ state: 'hidden' });
      assert.match(await page.locator('#recordList').innerText(), new RegExp(`视口 ${viewport.width}`));
    }));
  }

  await run('文字与照片刷新后持久化', async () => withPage(browser, { width: 390, height: 844 }, null, async page => {
    await page.locator('.screen.active .nav button[data-go="records"]').click();
    await page.locator('[data-screen="records"].active [data-open-note]').click();
    await page.locator('#noteEvent').fill('带照片的长久记录');
    await page.locator('#notePhoto').setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: onePixelPng });
    await page.locator('[data-save-note]').click();
    await page.locator('.memory-composer.show').waitFor({ state: 'hidden' });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
    assert.equal(stored.memories[0].event, '带照片的长久记录');
    assert.ok(stored.memories[0].photoId); assert.ok(!String(stored.memories[0].photo || '').startsWith('blob:'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.screen.active .nav button[data-go="records"]').click();
    await page.locator('#recordList h3', { hasText: '带照片的长久记录' }).waitFor();
    const src = await page.locator('.memory-card').first().locator('.memory-polaroid img').getAttribute('src');
    assert.ok(src && src.startsWith('blob:'));
  }));

  await run('朋友编辑保存后一次返回朋友列表', async () => withPage(browser, { width: 390, height: 844 }, null, async page => {
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    await page.locator('.friend-house-card[data-house="user-friend-1"]').click();
    await page.locator('[data-screen="friend-house"].active [data-edit-friend]').click();
    await page.locator('#editFriendName').fill('阿澄已编辑');
    await page.locator('[data-screen="friend-edit"].active [data-save-friend]').click();
    await page.locator('[data-screen="friend-house"].active').waitFor();
    await page.locator('[data-screen="friend-house"].active [data-back]').click();
    await page.locator('[data-screen="island"].active').waitFor();
    assert.match(await page.locator('[data-screen="island"].active').innerText(), /阿澄已编辑/);
  }));

  await run('主要图片均可加载', async () => withPage(browser, { width: 390, height: 844 }, null, async page => {
    await page.waitForTimeout(500);
    const broken = await page.locator('img:visible').evaluateAll(images => images.filter(img => img.complete && img.naturalWidth === 0).map(img => img.getAttribute('src')));
    assert.deepEqual(broken, []);
  }));

  await browser.close();
  console.log('\nRESULTS');
  for (const result of results) console.log(result.ok ? '✓' : '✗', result.name, result.error || '');
  if (results.some(result => !result.ok)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
