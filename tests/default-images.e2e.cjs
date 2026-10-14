const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const baseURL = process.env.GIFTLOOP_BASE_URL || 'http://127.0.0.1:3123';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const defaultHouse = 'assets/default-house-window.png';
const defaultMemory = 'assets/default-memory-image.png';

const makeData = () => ({
  profile: {},
  friends: [
    { id: 'friend-a', name: '青禾', relationship: '好友', interests: [], personalityTags: [], importantDates: [], gender: 'female', avatarStyle: 'female-01' },
    { id: 'friend-b', name: '云岚', relationship: '好友', interests: [], personalityTags: [], importantDates: [], gender: 'male', avatarStyle: 'male-01' }
  ],
  memories: [
    { id: 'plain-a', friendId: 'friend-a', friend: '青禾', event: '没有照片的记录', detail: '固定占位图', date: '10月14日', tags: ['日常'] },
    { id: 'plain-b', friendId: 'friend-b', friend: '云岚', event: '另一条没有照片的记录', detail: '仍是同一张图', date: '10月13日', tags: ['日常'] }
  ],
  giftRecords: [],
  onboarding: { profileCompleted: true, firstFriendCompleted: true }
});

async function pageWithData(browser, viewport, data = makeData()) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.route('**/api/memory-signals', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"signals":[]}' }));
  await page.addInitScript(seed => {
    if (localStorage.getItem('giftloop_default_images_seeded') === '1') return;
    localStorage.setItem('giftloop_mode', 'user');
    localStorage.setItem('giftloop_user_data', JSON.stringify(seed));
    localStorage.setItem('giftloop_default_images_seeded', '1');
  }, data);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function run(name, test) {
  try { await test(); console.log('PASS', name); }
  catch (error) { console.error('FAIL', name, error); process.exitCode = 1; }
}

(async () => {
  let server;
  if (!process.env.GIFTLOOP_BASE_URL) {
    server = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: '3123' }, stdio: 'ignore' });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try { const response = await fetch(baseURL); if (response.ok) break; }
      catch (error) { if (attempt === 39) throw error; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  const browser = await chromium.launch({ headless: true, executablePath });

  await run('不同朋友共享同一默认窗景，且不写入朋友数据', async () => {
    const { context, page } = await pageWithData(browser, { width: 390, height: 844 });
    try {
      const assets = await page.evaluate(() => window.giftLoopDefaultAssets);
      assert.equal(assets.houseWindow, defaultHouse);
      await page.evaluate(() => window.giftLoop.openFriend('青禾'));
      const first = await page.locator('#friendHouse .room-window img').getAttribute('src');
      await page.evaluate(() => window.giftLoop.openFriend('云岚'));
      const second = await page.locator('#friendHouse .room-window img').getAttribute('src');
      assert.equal(first, defaultHouse);
      assert.equal(second, defaultHouse);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
      assert.equal(saved.friends.every(friend => !friend.houseBackground && !friend.avatarConfig?.houseBackground), true);
    } finally { await context.close(); }
  });

  await run('自定义窗景优先，删除后恢复默认窗景', async () => {
    const data = makeData();
    const { context, page } = await pageWithData(browser, { width: 390, height: 844 }, data);
    try {
      await page.evaluate(() => window.giftLoop.openFriend('青禾'));
      assert.equal(await page.locator('#friendHouse .room-window img').getAttribute('src'), defaultHouse);
      await page.locator('[data-edit-friend]').click();
      await page.locator('#editFriendHouseUpload').setInputFiles({ name: 'house.png', mimeType: 'image/png', buffer: onePixelPng });
      await page.locator('.edit-house-background img').waitFor();
      await page.locator('[data-save-friend]').first().click();
      await page.locator('[data-screen="friend-house"].active').waitFor();
      assert.match(await page.locator('#friendHouse .room-window img').getAttribute('src'), /^data:image\/jpeg/);
      await page.locator('[data-edit-friend]').click();
      await page.locator('[data-remove-edit-house-background]').click();
      await page.locator('[data-save-friend]').first().click();
      await page.locator('[data-screen="friend-house"].active').waitFor();
      assert.equal(await page.locator('#friendHouse .room-window img').getAttribute('src'), defaultHouse);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
      assert.equal(saved.friends[0].houseBackground, '');
    } finally { await context.close(); }
  });

  await run('所有无照片记录共享固定礼物插画，详情页一致', async () => {
    const { context, page } = await pageWithData(browser, { width: 390, height: 844 });
    try {
      await page.locator('.screen.active .nav [data-go="records"]').click();
      const sources = await page.locator('.memory-card .memory-polaroid img').evaluateAll(images => images.map(image => image.getAttribute('src')));
      assert.equal(sources.length, 2);
      assert.deepEqual([...new Set(sources)], [defaultMemory]);
      await page.locator('.memory-card').first().click();
      assert.equal(await page.locator('#memoryDetailContent img').getAttribute('src'), defaultMemory);
    } finally { await context.close(); }
  });

  await run('上传记录照片持久化，删除后恢复固定礼物插画', async () => {
    const data = makeData();
    data.memories = [];
    const { context, page } = await pageWithData(browser, { width: 390, height: 844 }, data);
    try {
      await page.locator('.screen.active .nav [data-go="records"]').click();
      await page.locator('[data-open-note]').click();
      await page.locator('#noteEvent').fill('上传了一张照片');
      await page.locator('#notePhoto').setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: onePixelPng });
      await page.locator('[data-save-note]').click();
      await page.locator('.memory-card .memory-polaroid img').waitFor();
      assert.match(await page.locator('.memory-card .memory-polaroid img').getAttribute('src'), /^blob:/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.screen.active .nav [data-go="records"]').click();
      await page.locator('.memory-card .memory-polaroid img').waitFor();
      await page.waitForFunction(() => document.querySelector('.memory-card .memory-polaroid img')?.src.startsWith('blob:'));
      await page.locator('[data-memory-menu]').first().click();
      await page.locator('[data-memory-action="edit"]').click();
      await page.locator('[data-remove-note-photo]').click();
      await page.locator('[data-save-note]').click();
      await page.waitForFunction(expected => document.querySelector('.memory-card .memory-polaroid img')?.getAttribute('src') === expected, defaultMemory);
      assert.equal(await page.locator('.memory-card .memory-polaroid img').getAttribute('src'), defaultMemory);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('giftloop_user_data')));
      assert.equal(saved.memories[0].photoId, '');
      assert.equal(saved.memories[0].photo, '');
    } finally { await context.close(); }
  });

  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await run(`图片比例与圆角适配 ${viewport.width}x${viewport.height}`, async () => {
      const { context, page } = await pageWithData(browser, viewport);
      try {
        await page.evaluate(() => window.giftLoop.openFriend('青禾'));
        const house = await page.locator('#friendHouse .room-window img').evaluate(image => ({ fit: getComputedStyle(image).objectFit, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, radius: getComputedStyle(image.parentElement).borderRadius }));
        assert.equal(house.fit, 'cover');
        assert.ok(house.width > 0 && house.height > 0);
        assert.notEqual(house.radius, '0px');
        await page.evaluate(() => document.querySelector('.screen.active .nav [data-go="records"]')?.click());
        const memory = await page.locator('.memory-card .memory-polaroid img').first().evaluate(image => ({ fit: getComputedStyle(image).objectFit, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }));
        assert.equal(memory.fit, 'cover');
        assert.ok(memory.width > 0 && memory.height > 0);
      } finally { await context.close(); }
    });
  }

  await browser.close();
  server?.kill();
  if (process.exitCode) process.exit(process.exitCode);
})();
