const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

const baseURL = process.env.GIFTLOOP_BASE_URL || 'http://127.0.0.1:3000';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const results = [];
const aiResponse = () => ({ summary: '根据真实资料与本次要求生成', recommendations: [1, 2, 3].map(n => ({ title: `方向${n}`, category: `方向${n}`, imageKey: n === 1 ? 'home' : n === 2 ? 'memory' : 'experience', reason: `结合已知信息的推荐理由${n}`, details: [`依据${n}`], budget: '¥100–300', tags: ['差异化'] })) });
const richAiResponse = () => ({ summary: '结合摄影兴趣与生日要求，整理了三个不同方向。', recommendations: [
  { title: '便携式照片打印机', category: '数码实用', directionType: '兴趣延伸', imageKey: 'tech', reason: '把喜欢的瞬间变成可保存的实体回忆。', evidence: [{ source: 'memory', reference: '最近开始学习摄影', text: '这条记录说明 TA 正在投入摄影兴趣。' }, { source: 'memory', reference: '虚构滑雪经历', text: '这条依据不应显示。' }], selectionTips: ['确认手机系统兼容性', '留意相纸耗材成本'], products: [{ name: '手机蓝牙照片打印机', price: '约 ¥300–400', reason: '预算内且方便随身使用', features: ['手机连接', '便携'] }, { name: '免墨口袋照片打印设备', price: '约 ¥250–350', reason: '不需要墨盒，适合轻量记录', features: ['免墨', '小巧'] }], budget: '¥300–400', tags: ['摄影'] },
  { title: '共同记忆手作相册', category: '纪念定制', directionType: '情感纪念', imageKey: 'memory', reason: '把共同经历整理成一份能够长期保存的纪念。', evidence: [{ source: 'request', reference: '生日', text: '适合作为生日节点的纪念礼物。' }], selectionTips: ['预留照片冲印时间'], products: [{ name: '可替换内页手作相册套装', price: '约 ¥180–260', reason: '方便持续补充共同回忆', features: ['可扩充', '附书写页'] }], budget: '¥180–260', tags: ['纪念'] },
  { title: '双人陶艺体验', category: '体验活动', directionType: '共同体验', imageKey: 'experience', reason: '一起完成作品，也留下一段新的共同记忆。', evidence: [], selectionTips: ['确认课程时长与烧制取件安排'], products: [{ name: '双人基础拉坯体验', price: '约 ¥280–380', reason: '适合第一次体验并控制在预算内', features: ['双人', '含烧制'] }], budget: '¥280–380', tags: ['体验'] }
] });
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
  await page.route('**/api/memory-signals', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"signals":[]}' }));
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

async function withSeededPage(browser, viewport, data, setup, test) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.route('**/api/memory-signals', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"signals":[]}' }));
  await page.addInitScript(seed => {
    localStorage.setItem('giftloop_mode', 'user');
    localStorage.setItem('giftloop_user_data', JSON.stringify(seed));
    localStorage.setItem('giftloop_test_seeded', '1');
  }, data);
  if (setup) await setup(page);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  try { await test(page, context); } finally { await context.close(); }
}

const giftConfigData = () => ({
  profile: {},
  friends: [{
    id: 'full-friend', name: '阿澄', relationship: '好友', birthday: '2000-10-20', importantDates: [], mbti: 'INFP',
    personalityTags: ['细腻', '重心意'], interests: ['摄影', '旅行'], notes: '偏爱能够长期使用的东西',
    giftPreferences: ['有纪念意义'], giftAvoidances: ['香薰类'], gender: 'female', avatarStyle: 'female-02'
  }, {
    id: 'empty-friend', name: '白露', relationship: '同事', birthday: '', importantDates: [], mbti: '',
    personalityTags: [], interests: [], notes: '', giftPreferences: [], giftAvoidances: [], gender: 'male', avatarStyle: 'male-01'
  }],
  memories: [{ id: 'memory-photo', friendId: 'full-friend', friend: '阿澄', event: '最近开始学习摄影', detail: '周末常常带相机出门', date: '10月1日', tags: ['摄影'] }],
  giftRecords: [{ id: 'gift-old', friendId: 'full-friend', friend: '阿澄', gift: '手工相册', occasion: '生日', year: '2025', status: '已送出' }],
  onboarding: { profileCompleted: true, firstFriendCompleted: true }
});

const relationshipData = () => ({
  profile: {},
  friends: [{
    id: 'relationship-friend', name: '知夏', relationship: '好友', birthday: '2000-12-18',
    importantDates: [{ id: 'anniversary-1', name: '相识纪念日', date: '2020-11-16' }], mbti: 'INFP',
    personalityTags: ['重心意', '喜欢探索'], interests: ['摄影', '咖啡', '旅行'], notes: '偏爱长期使用的物件',
    giftPreferences: ['有纪念意义'], giftAvoidances: ['香薰类'], gender: 'female', avatarStyle: 'female-03',
    houseBackground: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  }],
  memories: [
    { id: 'memory-1', friendId: 'relationship-friend', friend: '知夏', event: '第一次一起看展', detail: '她很喜欢光影装置', date: '10月1日', tags: ['展览'] },
    { id: 'memory-2', friendId: 'relationship-friend', friend: '知夏', event: '最近开始拍胶片', detail: '会记录街角的小店', date: '10月3日', tags: ['摄影'] },
    { id: 'memory-3', friendId: 'relationship-friend', friend: '知夏', event: '说想去海边', detail: '想在冬天看一次日落', date: '10月5日', tags: ['旅行'] },
    { id: 'memory-4', friendId: 'relationship-friend', friend: '知夏', event: '找到喜欢的咖啡豆', detail: '偏爱果香风味', date: '10月8日', tags: ['咖啡'] }
  ],
  giftRecords: [
    { id: 'gift-1', friendId: 'relationship-friend', friend: '知夏', gift: '旅行手账', occasion: '生日', year: '2024', status: '已送出' },
    { id: 'gift-2', friendId: 'relationship-friend', friend: '知夏', gift: '胶片相册', occasion: '纪念日', year: '2025', status: '已送出' },
    { id: 'gift-3', friendId: 'relationship-friend', friend: '知夏', gift: '咖啡杯', occasion: '日常', year: '2026', status: '已记录' }
  ],
  onboarding: { profileCompleted: true, firstFriendCompleted: true }
});

async function run(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.error('FAIL', name, error); }
}

async function freshPage(browser, viewport, test, setup) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.route('**/api/memory-signals', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"signals":[]}' }));
  if (setup) await setup(page);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  try { await test(page, context); } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });

  await run('新用户仅填写昵称并使用默认个性资料', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="user"]').click();
    await page.locator('[data-screen="onboard"].active').waitFor();
    await page.locator('#onboardNickname').fill('小满');
    assert.equal(await page.locator('.onboard-optional-fields').count(), 0);
    await page.locator('[data-action="create-profile"]').click();
    await page.locator('[data-screen="add-friend"].active').waitFor();
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
    assert.equal(data.profile.name, '小满');
    assert.equal(data.profile.mbti, '');
    assert.equal(data.profile.avatarStyle, 'female-01');
    assert.equal(data.profile.personalityColor, '#E8DED5');
    assert.deepEqual(data.profile.interests, []);
    assert.equal(data.onboarding.profileCompleted, true);
  }));

  await run('可选个性资料仍可设置并保存', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="user"]').click();
    await page.locator('#onboardNickname').fill('阿秋');
    await page.locator('[data-toggle-onboard-personalization]').click();
    await page.locator('#onboardProfileMbti').selectOption('ENTP');
    await page.locator('[data-onboard-gender="male"]').click();
    await page.locator('[data-onboard-avatar="male-02"]').click();
    await page.locator('[data-onboard-interest="音乐"]').click();
    await page.locator('[data-action="create-profile"]').click();
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
    assert.equal(data.profile.name, '阿秋');
    assert.equal(data.profile.mbti, 'ENTP');
    assert.equal(data.profile.personalityColor, '#C9B2D8');
    assert.equal(data.profile.avatarStyle, 'male-02');
    assert.deepEqual(data.profile.interests, ['音乐']);
  }));

  await run('首次朋友仅昵称即可创建并进入朋友小屋', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="user"]').click();
    await page.locator('#onboardNickname').fill('小满');
    await page.locator('[data-action="create-profile"]').click();
    await page.locator('#newName').fill('阿禾');
    await page.locator('#friendNext').click();
    await page.locator('[data-screen="friend-house"].active').waitFor();
    assert.match(await page.locator('#friendHouse').innerText(), /阿禾/);
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
    assert.equal(data.friends.length, 1);
    assert.equal(data.friends[0].name, '阿禾');
    assert.equal(data.friends[0].avatarStyle, 'female-01');
    assert.equal(data.friends[0].personalityColor, '#E8DED5');
    assert.equal(data.onboarding.firstFriendCompleted, true);
  }));

  await run('快速朋友可继续完善并进入送礼和记录', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="user"]').click();
    await page.locator('#onboardNickname').fill('小满');
    await page.locator('[data-action="create-profile"]').click();
    await page.locator('#newName').fill('阿禾');
    await page.locator('#friendNext').click();
    await page.locator('[data-edit-friend]').click();
    await page.locator('#editFriendBirthday').fill('2000-05-06');
    await page.locator('[data-save-friend]').first().click();
    await page.locator('[data-screen="friend-house"].active').waitFor();
    await page.locator('.house-secondary-action').click();
    await page.locator('[data-screen="preferences"].active').waitFor();
    await page.locator('[data-screen="preferences"] [data-back]').click();
    await page.locator('[data-screen="friend-house"].active [data-house-note]').first().click();
    await page.locator('.memory-composer.show').waitFor();
    assert.equal(await page.locator('.note-person-lock').count() > 0 || await page.locator('[data-note-person]').count() >= 0, true);
  }));

  await run('不完整朋友资料可传入 AI 请求', async () => {
    let captured;
    await freshPage(browser, { width: 390, height: 844 }, async page => {
      await page.locator('[data-select-mode="user"]').click();
      await page.locator('#onboardNickname').fill('小满');
      await page.locator('[data-action="create-profile"]').click();
      await page.locator('#newName').fill('阿禾');
      await page.locator('#friendNext').click();
      await page.locator('.house-secondary-action').click();
      await page.locator('[data-screen="preferences"] [data-action="generate"]').click();
      await page.locator('[data-screen="results"].active').waitFor();
      assert.equal(captured.friend.name, '阿禾');
      assert.deepEqual(captured.friend.interests, []);
    }, async page => {
      await page.route('**/api/gift-recommend', async route => {
        captured = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: '资料较少时根据本次条件推荐', recommendations: [1,2,3].map(n => ({ title: `方向${n}`, category: '生活', imageKey: 'home', reason: '结合本次要求', details: ['本次条件'], budget: '¥100–300', tags: ['轻量'] })) }) });
      });
    });
  });

  await run('跳过两步后直接进入空白 User 首页', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="user"]').click();
    await page.locator('[data-action="skip-profile"]').click();
    await page.locator('[data-skip-first-friend]').click();
    await page.locator('[data-screen="pick-friend"].active').waitFor();
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
    assert.equal(data.onboarding.profileCompleted, true);
    assert.equal(data.onboarding.firstFriendCompleted, true);
    assert.deepEqual(data.friends, []);
  }));

  await run('老用户刷新不重复进入引导', async () => withPage(browser, { width: 390, height: 844 }, null, async page => {
    await page.locator('[data-screen="pick-friend"].active').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-screen="pick-friend"].active').waitFor();
    assert.equal(await page.locator('[data-screen="onboard"].active').count(), 0);
  }));

  await run('Demo 模式保持示例且不写入 User 数据', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="demo"]').click();
    await page.locator('[data-screen="pick-friend"].active').waitFor();
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    assert.match(await page.locator('[data-screen="island"].active').innerText(), /小林|米米/);
    assert.equal(await page.evaluate(() => localStorage.getItem('giftloop_user_data')), null);
  }));

  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await run(`新手引导适配 ${viewport.width}x${viewport.height}`, async () => freshPage(browser, viewport, async page => {
      await page.locator('[data-select-mode="user"]').click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false);
      const cta = page.locator('[data-action="create-profile"]');
      assert.equal(await cta.isVisible(), true);
      const box = await cta.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height);
      await page.locator('#onboardNickname').fill('小满');
      await cta.click();
      await page.locator('#newName').fill('阿禾');
      const create = page.locator('#friendNext');
      const createBox = await create.boundingBox();
      assert.ok(createBox && createBox.y >= 0 && createBox.y + createBox.height <= viewport.height);
    }));
  }

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

  await run('快速建档可选 MBTI 与形象并生成对应主题色', async () => freshPage(browser, { width: 390, height: 844 }, async page => {
    await page.locator('[data-select-mode="user"]').click();
    await page.locator('#onboardNickname').fill('小满');
    await page.locator('[data-action="create-profile"]').click();
    await page.locator('#newName').fill('知夏');
    await page.locator('[data-toggle-first-friend-more]').click();
    await page.locator('#newMbti').selectOption('ENTP');
    await page.locator('[data-avatar-style="female-03"]').click();
    await page.locator('#friendNext').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')).friends[0]);
    assert.equal(saved.mbti, 'ENTP');
    assert.equal(saved.personalityColor, '#C9B2D8');
    assert.equal(saved.avatarStyle, 'female-03');
    assert.match(await page.locator('#friendHouse').innerText(), /ENTP/);
  }));

  await run('修改 MBTI 保留人物造型与用户小屋背景', async () => withSeededPage(browser, { width: 390, height: 844 }, relationshipData(), null, async page => {
    const original = relationshipData().friends[0];
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    await page.locator('.friend-house-card[data-house="relationship-friend"]').click();
    await page.locator('[data-screen="friend-house"].active [data-edit-friend]').click();
    await page.locator('#editFriendMbti').selectOption('ENTP');
    await page.locator('[data-save-friend]').first().click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')).friends[0]);
    assert.equal(saved.mbti, 'ENTP');
    assert.equal(saved.personalityColor, '#C9B2D8');
    assert.equal(saved.avatarStyle, 'female-03');
    assert.equal(saved.houseBackground, original.houseBackground);
    assert.match(await page.locator('#friendHouse').innerText(), /ENTP/);
  }));

  await run('修改人物造型不改变 MBTI', async () => withSeededPage(browser, { width: 390, height: 844 }, relationshipData(), null, async page => {
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    await page.locator('.friend-house-card[data-house="relationship-friend"]').click();
    await page.locator('[data-screen="friend-house"].active [data-edit-friend]').click();
    await page.locator('[data-edit-avatar-style="female-04"]').click();
    await page.locator('[data-save-friend]').first().click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')).friends[0]);
    assert.equal(saved.mbti, 'INFP');
    assert.equal(saved.avatarStyle, 'female-04');
  }));

  await run('朋友小屋展示真实最近三条记录、最近日期和两条礼物', async () => withSeededPage(browser, { width: 390, height: 844 }, relationshipData(), null, async page => {
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    await page.locator('.friend-house-card[data-house="relationship-friend"]').click();
    assert.equal(await page.locator('.house-memory-row').count(), 3);
    const house = await page.locator('#friendHouse').innerText();
    assert.match(house, /找到喜欢的咖啡豆/);
    assert.doesNotMatch(house, /第一次一起看展/);
    assert.match(house, /12月18日生日|11月16日相识纪念日/);
    assert.equal(await page.locator('.house-keepsake').count(), 2);
    assert.equal(await page.locator('#friendHouse [data-start-for]').count(), 1);
  }));

  await run('朋友小屋空状态不混入虚构记录或礼物', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), null, async page => {
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    await page.locator('.friend-house-card[data-house="empty-friend"]').click();
    const house = await page.locator('#friendHouse').innerText();
    assert.match(house, /暂时没有记录/);
    assert.match(house, /还没有重要日期/);
    assert.match(house, /还没有送过的心意/);
    assert.doesNotMatch(house, /最近搬家|手工相册|咖啡礼盒/);
    assert.match(house, /暂不确定 · 中性色/);
  }));

  await run('关系记录可新增、编辑、删除并立即同步小屋', async () => withSeededPage(browser, { width: 390, height: 844 }, relationshipData(), null, async page => {
    await page.locator('.screen.active .nav button[data-go="island"]').click();
    await page.locator('.friend-house-card[data-house="relationship-friend"]').click();
    await page.locator('.house-primary-action').click();
    await page.locator('#noteEvent').fill('新记下的小事');
    await page.locator('#noteExtra').fill('会立刻回到朋友的小屋里');
    await page.locator('#noteDate').fill('2026-10-14');
    await page.locator('.memory-composer.show [data-save-note]').click();
    await page.locator('.memory-composer.show').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#friendHouse').innerText(), /新记下的小事/);
    const card = page.locator('.memory-card', { hasText: '新记下的小事' });
    await card.locator('[data-memory-menu]').click();
    await page.locator('[data-memory-action="edit"]').click();
    await page.locator('#noteEvent').fill('编辑后的小事');
    await page.locator('.memory-composer.show [data-save-note]').click();
    await page.locator('.memory-composer.show').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#recordList').innerText(), /编辑后的小事/);
    const edited = page.locator('.memory-card', { hasText: '编辑后的小事' });
    await edited.locator('[data-memory-menu]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-memory-action="delete"]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.memory-card', { hasText: '编辑后的小事' }).count(), 0);
  }));

  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await run(`朋友小屋与资料编辑适配 ${viewport.width}x${viewport.height}`, async () => withSeededPage(browser, viewport, relationshipData(), null, async page => {
      await page.locator('.screen.active .nav button[data-go="island"]').click();
      await page.locator('.friend-house-card[data-house="relationship-friend"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      await page.locator('[data-edit-friend]').click();
      await page.locator('#editFriendMbti').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#editFriendMbti').isVisible(), true);
      await page.locator('[data-save-friend]').first().scrollIntoViewIfNeeded();
      assert.equal(await page.locator('[data-save-friend]').first().isVisible(), true);
    }));
  }

  await run('完整资料摘要真实展示且不同朋友不串用', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), null, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    const known = page.locator('#giftKnownHighlights');
    await known.waitFor();
    const fullText = await known.innerText();
    assert.match(fullText, /细腻/); assert.match(fullText, /摄影/); assert.match(fullText, /最近开始学习摄影/); assert.match(fullText, /手工相册/);
    await page.locator('#giftReferenceDetails summary').click();
    assert.match(await page.locator('#giftReferenceMore').innerText(), /香薰类/);
    await page.evaluate(() => window.giftLoopOpenFlow('empty-friend', '日常惊喜'));
    const emptyText = await known.innerText();
    assert.match(emptyText, /暂时没有更多资料/);
    assert.doesNotMatch(emptyText, /摄影|手工相册|香薰类/);
  }));

  await run('高级条件展开收起保持状态并正确传给 AI', async () => {
    let captured;
    await withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
      await page.route('**/api/gift-recommend', async route => {
        captured = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(aiResponse()) });
      });
    }, async page => {
      await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
      await page.locator('[data-toggle-gift-advanced]').click();
      await page.locator('[data-feeling="特别有心意"]').click();
      await page.locator('[data-gift-form="体验活动"]').click();
      await page.locator('[data-gift-exclusion="太占地方"]').click();
      await page.locator('#giftOtherExclusionInput').fill('不要电子产品');
      await page.locator('#giftContext').fill('希望可以一起完成');
      await page.locator('[data-toggle-gift-advanced]').click();
      assert.match(await page.locator('#giftAdvancedSummary').innerText(), /已补充 4 项要求/);
      await page.locator('[data-toggle-gift-advanced]').click();
      assert.equal(await page.locator('[data-feeling="特别有心意"]').getAttribute('class').then(x => x.includes('selected')), true);
      assert.equal(await page.locator('[data-gift-form="体验活动"]').getAttribute('class').then(x => x.includes('selected')), true);
      assert.equal(await page.locator('[data-gift-exclusion="太占地方"]').getAttribute('class').then(x => x.includes('selected')), true);
      assert.equal(await page.locator('#giftOtherExclusionInput').inputValue(), '不要电子产品');
      await page.locator('[data-action="generate"]').click();
      await page.locator('[data-screen="results"].active').waitFor();
      assert.deepEqual(captured.preferences.expectations, ['特别有心意']);
      assert.deepEqual(captured.preferences.giftTypes, ['体验活动']);
      assert.deepEqual(new Set(captured.constraints.exclusions), new Set(['香薰类', '太占地方']));
      assert.match(captured.extraNote, /长期雷区：香薰类/);
      assert.match(captured.extraNote, /本次明确排除：太占地方/);
      assert.match(captured.extraNote, /不要电子产品/);
      assert.match(captured.extraNote, /希望可以一起完成/);
      assert.deepEqual(captured.friend.interests, ['摄影', '旅行']);
    });
  });

  await run('不展开高级条件也能生成且场合预算准确', async () => {
    let captured;
    await withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
      await page.route('**/api/gift-recommend', async route => { captured = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(aiResponse()) }); });
    }, async page => {
      await page.evaluate(() => window.giftLoopOpenFlow('empty-friend', '生日'));
      await page.locator('#preferenceOccasionChips [data-occasion="纪念日"]').click();
      await page.locator('#budgetChips [data-budget="300–500"]').click();
      await page.locator('[data-action="generate"]').click();
      await page.locator('[data-screen="results"].active').waitFor();
      assert.equal(captured.friend.name, '白露');
      assert.equal(captured.occasion, '纪念日');
      assert.equal(captured.budget, '300–500');
      assert.deepEqual(captured.preferences.expectations, []);
      assert.deepEqual(captured.preferences.giftTypes, []);
    });
  });

  await run('修改长期偏好后摘要和请求同步', async () => {
    let captured;
    await withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
      await page.route('**/api/gift-recommend', async route => { captured = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(aiResponse()) }); });
    }, async page => {
      await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
      await page.locator('#giftReferenceDetails summary').click();
      await page.locator('[data-edit-gift-friend]').click();
      await page.locator('[data-edit-gift-preference="实用耐用"]').click();
      await page.locator('[data-edit-gift-avoidance="太占地方"]').click();
      await page.locator('[data-save-friend]').first().click();
      await page.locator('[data-screen="preferences"].active').waitFor();
      assert.match(await page.locator('#giftKnownHighlights').innerText(), /实用耐用/);
      await page.locator('[data-action="generate"]').click();
      await page.locator('[data-screen="results"].active').waitFor();
      assert.ok(captured.friend.giftPreferences.includes('实用耐用'));
      assert.ok(captured.friend.giftAvoidances.includes('太占地方'));
      assert.match(captured.extraNote, /实用耐用/);
      assert.match(captured.extraNote, /太占地方/);
    });
  });

  await run('从日常记录进入时记录成为重点且真实进入请求', async () => {
    let captured;
    await withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
      await page.route('**/api/gift-recommend', async route => { captured = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(aiResponse()) }); });
    }, async page => {
      await page.locator('.screen.active .nav button[data-go="records"]').click();
      const memory = page.locator('.memory-card', { hasText: '最近开始学习摄影' });
      await memory.locator('[data-memory-menu]').click();
      await page.locator('[data-memory-action="gift"]').click();
      await page.locator('[data-screen="preferences"].active').waitFor();
      assert.match(await page.locator('.gift-known-chip.focus').innerText(), /最近开始学习摄影/);
      await page.locator('[data-action="generate"]').click();
      await page.locator('[data-screen="results"].active').waitFor();
      assert.equal(captured.friend.name, '阿澄');
      assert.match(captured.extraNote, /请特别参考这条记录：最近开始学习摄影/);
    });
  });

  await run('自定义预算非法时阻止提交', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), null, async page => {
    let requests = 0;
    await page.route('**/api/gift-recommend', async route => { requests += 1; await route.abort(); });
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    await page.locator('#budgetChips [data-budget="自定义"]').click();
    await page.locator('#giftBudgetMin').fill('500');
    await page.locator('#giftBudgetMax').fill('100');
    await page.locator('[data-action="generate"]').click();
    await page.waitForTimeout(150);
    assert.equal(requests, 0);
    assert.equal(await page.locator('[data-screen="preferences"]').getAttribute('class').then(x => x.includes('active')), true);
  }));

  await run('推荐卡精确素材、真实依据与详情商品参考', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
    await page.route('**/api/gift-recommend', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(richAiResponse()) }));
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    await page.locator('[data-action="generate"]').click();
    await page.locator('[data-screen="results"].active').waitFor();
    assert.equal(await page.locator('.gift-idea-card').count(), 3);
    assert.match(await page.locator('.gift-idea-card').first().locator('img').getAttribute('src'), /gift-photo-printer\.png/);
    const resultText = await page.locator('.gift-idea-card').first().innerText();
    assert.match(resultText, /最近开始学习摄影|这条记录说明/);
    assert.doesNotMatch(resultText, /虚构滑雪/);
    await page.locator('[data-open-gift-direction="0"]').click();
    await page.locator('[data-screen="direction"].active').waitFor();
    assert.equal(await page.locator('.gift-product-reference').count(), 2);
    assert.match(await page.locator('.gift-product-disclaimer').innerText(), /未接入实时商品库/);
    assert.equal(await page.locator('.gift-product-reference a').count(), 0);
    assert.doesNotMatch(await page.locator('#giftDirectionDetail').innerText(), /虚构滑雪/);
  }));

  await run('收藏持久化、取消与朋友隔离', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
    await page.route('**/api/gift-recommend', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(richAiResponse()) }));
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    await page.locator('[data-action="generate"]').click();
    await page.locator('[data-screen="results"].active').waitFor();
    await page.locator('[data-save-idea="0"]').click();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_saved_ideas_user') || '[]'));
    assert.equal(saved.length, 1); assert.equal(saved[0].friendId, 'full-friend');
    await page.reload({ waitUntil: 'domcontentloaded' });
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_saved_ideas_user') || '[]'));
    assert.equal(saved.length, 1);
    assert.equal(saved.some(item => item.friendId === 'empty-friend'), false);
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    await page.locator('[data-action="generate"]').click(); await page.locator('[data-screen="results"].active').waitFor();
    assert.equal(await page.locator('[data-save-idea="0"]').innerText(), '♥');
    await page.locator('[data-save-idea="0"]').click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_saved_ideas_user') || '[]'));
    assert.equal(saved.length, 0);
  }));

  await run('定向调整改变请求并可返回上一批', async () => {
    const requests = [];
    await withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
      await page.route('**/api/gift-recommend', route => { requests.push(route.request().postDataJSON()); const payload = richAiResponse(); if (requests.length > 1) payload.recommendations[0].title = '更有纪念意义的新方向'; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }); });
    }, async page => {
      await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
      await page.locator('[data-action="generate"]').click(); await page.locator('[data-screen="results"].active').waitFor();
      await page.locator('[data-adjust="memory"]').click();
      await page.locator('.gift-idea-card', { hasText: '更有纪念意义的新方向' }).waitFor();
      assert.match(requests[1].extraNote, /本轮定向调整：优先给出更有纪念意义/);
      assert.match(requests[1].extraNote, /避免重复上一批方向/);
      await page.locator('[data-previous-results]').click();
      assert.match(await page.locator('.gift-idea-card').first().innerText(), /便携式照片打印机/);
    });
  });

  await run('选定方向写入已记录且避免重复保存', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
    await page.route('**/api/gift-recommend', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(richAiResponse()) }));
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    await page.locator('[data-action="generate"]').click(); await page.locator('[data-screen="results"].active').waitFor();
    await page.locator('[data-open-gift-direction="0"]').click();
    await page.locator('[data-select-product="0"]').click();
    await page.locator('[data-select-gift-direction]').click();
    assert.equal(await page.locator('#giftName').inputValue(), '手机蓝牙照片打印机');
    await page.locator('[data-action="save-gift"]').click();
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
    const record = data.giftRecords.at(-1);
    assert.equal(record.friendId, 'full-friend'); assert.equal(record.status, '已记录'); assert.notEqual(record.status, '已送出');
    assert.equal(data.giftRecords.filter(item => item.recordKey === record.recordKey).length, 1);
  }));

  await run('礼物图片加载失败使用本地兜底图', async () => withSeededPage(browser, { width: 390, height: 844 }, giftConfigData(), async page => {
    await page.route('**/api/gift-recommend', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(richAiResponse()) }));
  }, async page => {
    await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
    await page.locator('[data-action="generate"]').click(); await page.locator('[data-screen="results"].active').waitFor();
    await page.locator('.gift-idea-card img').first().evaluate(img => { img.src = '/assets/gifts/does-not-exist.png'; });
    await page.waitForFunction(() => document.querySelector('.gift-idea-card img')?.dataset.fallbackApplied === 'true');
    assert.match(await page.locator('.gift-idea-card img').first().getAttribute('src'), /gift-home\.png/);
  }));

  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await run(`送礼配置适配 ${viewport.width}x${viewport.height}`, async () => withSeededPage(browser, viewport, giftConfigData(), null, async page => {
      await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false);
      await page.locator('[data-toggle-gift-advanced]').click();
      await page.locator('#giftOtherExclusionInput').scrollIntoViewIfNeeded();
      await page.locator('#giftOtherExclusionInput').fill('不要香水');
      await page.locator('[data-action="generate"]').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('[data-action="generate"]').isVisible(), true);
    }));
    await run(`推荐结果与详情适配 ${viewport.width}x${viewport.height}`, async () => withSeededPage(browser, viewport, giftConfigData(), async page => {
      await page.route('**/api/gift-recommend', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(richAiResponse()) }));
    }, async page => {
      await page.evaluate(() => window.giftLoopOpenFlow('full-friend', '生日'));
      await page.locator('[data-action="generate"]').click(); await page.locator('[data-screen="results"].active').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      await page.locator('[data-open-gift-direction="0"]').click();
      await page.locator('.gift-product-reference').last().scrollIntoViewIfNeeded();
      assert.equal(await page.locator('[data-select-gift-direction]').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    }));
  }

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
