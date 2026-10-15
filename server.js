const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env.local') });

const app = express();
const port = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');
const allowedFrontendOrigins = new Set([
  'https://liuying2112517020.github.io',
  'https://giftloop-web.vercel.app'
]);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

app.use(['/api/gift-recommend', '/api/memory-signals'], (req, res, next) => {
  const origin = req.get('origin');
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const requestOrigin = `${forwardedProto}://${req.get('host')}`;

  if (!origin || origin === requestOrigin) {
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }

  if (!allowedFrontendOrigins.has(origin)) {
    return res.status(403).json({
      error: 'CORS_ORIGIN_DENIED',
      message: '该来源不允许调用 GiftLoop 推荐服务。'
    });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.vary('Origin');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/memory-signals', async (req, res) => {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.DASHSCOPE_BASE_URL;
  const model = process.env.QWEN_MODEL;

  if (!apiKey || !baseUrl || !model) {
    return res.status(503).json({
      error: 'AI_SERVICE_NOT_CONFIGURED',
      message: '记录理解服务尚未配置完整。'
    });
  }

  const friendName = String(req.body?.friend?.name || '').trim().slice(0, 80);
  const title = String(req.body?.record?.title || '').trim().slice(0, 300);
  const detail = String(req.body?.record?.detail || '').trim().slice(0, 1500);
  const tags = asStringArray(req.body?.record?.tags).slice(0, 8);

  if (!friendName || (!title && !detail)) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: '请提供朋友和记录内容。'
    });
  }

  const systemPrompt = `你是 GiftLoop 的日常记录理解助手。分析一条关于朋友的日常记录，只提取未来可能影响理解朋友或送礼决策的信息。

只允许以下三类：
- interest_preference：明确表达的兴趣或偏好
- recent_need：明确提到的近期需求、计划或变化
- dislike：明确表达的避雷或不喜欢

规则：
- 不提取普通流水账
- 不推测没有明确表达的信息
- 不把记录标题机械改写成信号
- 最多返回 3 条，内容简短、自然、可独立理解
- 没有值得保存的信息时返回空数组
- 只返回合法 JSON，不使用 Markdown 代码块

返回结构：
{"signals":[{"type":"interest_preference|recent_need|dislike","content":"简短信号"}]}`;

  const userPrompt = `朋友：${friendName}\n记录标题：${title || '无'}\n记录内容：${detail || '无'}\n记录标签：${formatList(tags, '无')}\n\n请严格按指定 JSON 结构返回。`;

  try {
    const result = await requestDashScopeJson({
      apiKey,
      baseUrl,
      model,
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      timeoutMs: 90000
    });
    return res.json({ signals: normalizeRecentSignals(result?.signals) });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'AI_PROVIDER_TIMEOUT',
        message: '记录已保存，AI 暂时没有完成理解。'
      });
    }
    console.error('Memory signal extraction failed', { message: error.message });
    return res.status(502).json({
      error: 'MEMORY_SIGNAL_ERROR',
      message: '记录已保存，AI 暂时没有完成理解。'
    });
  }
});

app.post('/api/gift-recommend', async (req, res) => {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.DASHSCOPE_BASE_URL;
  const model = process.env.QWEN_MODEL;

  if (!apiKey || !baseUrl || !model) {
    return res.status(503).json({
      error: 'AI_SERVICE_NOT_CONFIGURED',
      message: '礼物推荐服务尚未配置完整。'
    });
  }

  const { friend, occasion, budget, preferences = {}, constraints = {}, extraNote = '' } = req.body || {};
  if (!friend || typeof friend !== 'object' || !friend.name || !occasion || !budget) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: '请提供 friend、occasion 和 budget。'
    });
  }

  const systemPrompt = `你是 GiftLoop 的送礼决策助手，不是关键词匹配器。

推荐礼物时必须综合：
- 朋友性格
- 兴趣爱好
- 最近记录
- 从最近记录提取的 Recent Signals
- 与用户的关系
- 送礼原因
- 预算
- 历史礼物
- 用户补充说明

请求中会提供偏好条件和硬性约束：
- constraints 中的预算上限、明确排除、过敏禁忌和自由补充是硬约束，必须严格遵守
- Recent Signals 中 type=dislike 的明确避雷同样是硬约束
- preferences 中的送礼期待和礼物类型是推荐优先级，不是强制限制；未提供时自由判断
- extraNote 中的“其他必须考虑”也要参与判断，其中明确禁忌按硬约束处理
- 不要重复推荐历史礼物或高度相似的替代品

禁止简单把兴趣直接变成“XX礼盒”。

例如：
喜欢咖啡 ≠ 咖啡礼盒
喜欢植物 ≠ 植物礼盒
喜欢烘焙 ≠ 烘焙礼盒

推荐前先在内部比较多个候选方向，再筛选最值得推荐的 3 个。不要在输出中展示内部思考过程。

优先推荐：
- 小众、有设计感的物品
- 能延伸兴趣的礼物
- 有故事或纪念意义的礼物
- 平时不会主动买，但收到会开心的东西
- 体验类礼物
- 设计师品牌或特色生活方式产品

三个推荐需要明显不同：
1. 一个偏实用但特别
2. 一个偏纪念意义
3. 一个偏体验或兴趣延伸

当前没有接入实时商品数据库。除非输入中已经提供了可核验的商品资料，否则不要输出品牌、型号、购买链接、库存、评分或实时价格。具体商品参考应写成可购买的类型/规格建议，并明确是参考价格。

每个 reason 必须结合朋友的具体信息解释为什么适合 TA。必须引用用户提供的具体信息进行判断，不允许使用“未知信息”“信息不足”或类似表述；没有历史礼物时，按“暂无”处理。

避免普通礼盒、马克杯、普通香薰、鲜花、保温杯、零食、玩偶等泛化推荐，除非和朋友信息高度相关。

只返回合法 JSON，不要使用 Markdown 代码块，也不要添加 JSON 之外的文字。返回结构必须严格为：
{
  "summary": "一句简短的推荐思路",
  "recommendations": [
    {
      "title": "礼物名称",
      "category": "给用户看的礼物方向，例如居家生活、纪念定制、兴趣体验",
      "directionType": "具体方向类型，例如兴趣延伸、情感纪念、共同体验",
      "imageKey": "home|drink|memory|plant|fashion|tech|art|sport|hobby|experience 之一",
      "reason": "一句话核心理由，控制在55个中文字符以内",
      "details": ["结合朋友具体资料的简短理由"],
      "evidence": [{"source":"profile|memory|history|request", "reference":"请求里实际出现的原文片段", "text":"这条资料如何影响推荐"}],
      "selectionTips": ["具体、可执行的挑选建议"],
      "products": [{"name":"具体商品类型或规格建议", "price":"参考价格区间", "reason":"为什么符合本次条件", "features":["核心特点"], "verified":false}],
      "budget": "价格区间",
      "tags": ["标签1", "标签2", "标签3"]
    }
  ]
}`;

  const userPayload = {
    friend: {
      name: String(friend.name).trim(),
      relationship: String(friend.relationship || '').trim(),
      personality: asStringArray(friend.personality),
      interests: asStringArray(friend.interests),
      recentMemories: asStringArray(friend.recentMemories),
      recentSignals: normalizeInputSignals(friend.recentSignals),
      giftHistory: normalizeGiftHistory(friend.giftHistory),
      giftPreferences: asStringArray(friend.giftPreferences),
      giftAvoidances: asStringArray(friend.giftAvoidances),
      notes: String(friend.notes || '').trim().slice(0, 500)
    },
    occasion: String(occasion).trim(),
    budget: String(budget).trim(),
    preferences: {
      expectations: asStringArray(preferences.expectations),
      giftTypes: asStringArray(preferences.giftTypes)
    },
    constraints: {
      budgetMin: constraints.budgetMin !== null && constraints.budgetMin !== '' && Number.isFinite(Number(constraints.budgetMin)) ? Number(constraints.budgetMin) : null,
      budgetMax: constraints.budgetMax !== null && constraints.budgetMax !== '' && Number.isFinite(Number(constraints.budgetMax)) ? Number(constraints.budgetMax) : null,
      exclusions: asStringArray(constraints.exclusions),
      freeText: String(constraints.freeText || '').trim().slice(0, 500)
    },
    extraNote: String(extraNote).trim().slice(0, 1000)
  };

  const userPrompt = `请严格基于下面这位朋友的具体资料推荐礼物：

朋友：${userPayload.friend.name}
关系：${userPayload.friend.relationship || '未填写'}
性格：${formatList(userPayload.friend.personality, '未填写')}
兴趣：${formatList(userPayload.friend.interests, '未填写')}
最近发生：${formatList(userPayload.friend.recentMemories, '暂无')}
Recent Signals：${formatRecentSignals(userPayload.friend.recentSignals)}
过去送过：${formatGiftHistory(userPayload.friend.giftHistory)}
长期送礼偏好：${formatList(userPayload.friend.giftPreferences, '未填写')}
长期避雷：${formatList(userPayload.friend.giftAvoidances, '无')}
其他长期信息：${userPayload.friend.notes || '无'}
送礼原因：${userPayload.occasion}
预算：${userPayload.budget}
送礼期待（优先满足）：${formatList(userPayload.preferences.expectations, '未选择，由你判断')}
偏好礼物类型（优先满足）：${formatList(userPayload.preferences.giftTypes, '未选择，不限制类别')}
硬性排除：${formatList(userPayload.constraints.exclusions, '无')}
其他硬性禁忌：${userPayload.constraints.freeText || '无'}
补充：${userPayload.extraNote || '无'}

必须先淘汰违反预算上下限、明确排除、长期避雷、Recent Signals 中 dislike、过敏禁忌或历史重复的候选；所有 budget 和参考价格都要落在给定预算范围内。再按送礼期待和礼物类型偏好排序。Recent Signals 是从近期日常记录中提取的明确线索，应与长期资料和本次要求共同使用；相关时可以自然引用，但不要让全部推荐机械围绕同一条线索。推荐理由必须明确关联以上资料中的具体信息。evidence.reference 必须逐字摘自上面真实提供的资料或本次要求，不得编造；Recent Signals 的依据来源使用 memory；没有可靠依据时 evidence 返回空数组。每个方向只给出 1 个不带虚构品牌的具体商品类型/规格参考和 1–2 条实用挑选建议，避免冗余输出。按顺序返回 3 个明显不同的方向：实用但特别、纪念意义、体验或兴趣延伸。不要用两个相似的体验方向凑数，严格使用 system prompt 指定的 JSON 结构。`;

  if (process.env.NODE_ENV !== 'production') {
    console.info('Gift recommendation request', {
      occasion: userPayload.occasion,
      interestCount: userPayload.friend.interests.length,
      memoryCount: userPayload.friend.recentMemories.length,
      signalCount: userPayload.friend.recentSignals.length,
      exclusionCount: userPayload.constraints.exclusions.length
    });
  }

  try {
    const result = await requestDashScopeJson({
      apiKey,
      baseUrl,
      model,
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      timeoutMs: 90000
    });

    if (!isValidRecommendationResult(result)) {
      console.error('Gift recommendation schema mismatch', {
        summaryType: typeof result?.summary,
        recommendationCount: Array.isArray(result?.recommendations) ? result.recommendations.length : null,
        itemFields: Array.isArray(result?.recommendations) ? result.recommendations.map(item => ({ title: typeof item?.title, category: typeof item?.category, reason: typeof item?.reason, budget: typeof item?.budget, tags: Array.isArray(item?.tags) })) : []
      });
      throw new Error('Model returned an unexpected JSON structure');
    }

    return res.json({
      summary: result.summary,
      recommendations: result.recommendations.slice(0, 3).map(item => ({
        title: String(item.title),
        category: String(item.category),
        imageKey: normalizeImageKey(item.imageKey),
        directionType: String(item.directionType || item.category || ''),
        reason: String(item.reason),
        details: asStringArray(item.details).slice(0, 4),
        evidence: normalizeEvidence(item.evidence).slice(0, 4),
        selectionTips: asStringArray(item.selectionTips).slice(0, 4),
        products: normalizeProductExamples(item.products).slice(0, 3),
        budget: String(item.budget),
        tags: asStringArray(item.tags).slice(0, 3)
      }))
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'AI_PROVIDER_TIMEOUT',
        message: 'AI 服务响应时间较长，请重新生成。'
      });
    }
    console.error('Gift recommendation failed', { message: error.message });
    return res.status(502).json({
      error: 'INVALID_AI_RESPONSE',
      message: '暂时没能整理出有效的礼物推荐，请重试。'
    });
  }
});

app.use(express.static(distDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(distDir, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: '接口不存在。' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'INVALID_JSON', message: '请求 JSON 格式不正确。' });
  }
  console.error('Unexpected server error', { message: error.message });
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: '服务暂时不可用。' });
});

app.listen(port, () => {
  console.log(`GiftLoop is running at http://localhost:${port}`);
});

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[、,，/]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeGiftHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') return item.trim();
    if (!item || typeof item !== 'object') return '';
    return [item.gift || item.title, item.occasion, item.year || item.date]
      .filter(Boolean)
      .map(part => String(part).trim())
      .join(' · ');
  }).filter(Boolean);
}

function normalizeInputSignals(value) {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set(['interest_preference', 'recent_need', 'dislike']);
  return value.map(item => {
    if (!item || typeof item !== 'object') return null;
    const type = String(item.type || '').trim();
    const content = String(item.content || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!allowedTypes.has(type) || !content) return null;
    return { type, content };
  }).filter(Boolean).slice(0, 8);
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  const allowedSources = new Set(['profile', 'memory', 'history', 'request']);
  return value.map(item => {
    if (!item || typeof item !== 'object') return null;
    const source = String(item.source || '').trim().toLowerCase();
    const reference = String(item.reference || '').trim().slice(0, 160);
    const text = String(item.text || '').trim().slice(0, 220);
    if (!allowedSources.has(source) || !reference || !text) return null;
    return { source, reference, text };
  }).filter(Boolean);
}

function normalizeProductExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (!item || typeof item !== 'object') return null;
    const name = String(item.name || '').trim().slice(0, 100);
    const price = String(item.price || '').trim().slice(0, 60);
    const reason = String(item.reason || '').trim().slice(0, 220);
    if (!name || !reason) return null;
    return {
      name,
      price,
      reason,
      features: asStringArray(item.features).slice(0, 4),
      verified: item.verified === true
    };
  }).filter(Boolean);
}

function formatList(value, emptyText) {
  return value.length ? value.join('、') : emptyText;
}

function formatGiftHistory(value) {
  return value.length ? value.join('；') : '暂无';
}

function formatRecentSignals(value) {
  return value.length ? value.map(item => `${item.type}：${item.content}`).join('；') : '暂无';
}

function normalizeImageKey(value) {
  const allowed = new Set(['home', 'drink', 'memory', 'plant', 'fashion', 'tech', 'art', 'sport', 'hobby', 'experience']);
  const key = String(value || '').trim().toLowerCase();
  return allowed.has(key) ? key : 'home';
}

function parseModelJson(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Model returned empty content');
  }

  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(withoutFence);
  }
}

async function requestDashScopeJson({ apiKey, baseUrl, model, systemPrompt, userPrompt, temperature, timeoutMs }) {
  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const providerController = new AbortController();
  const providerTimeout = setTimeout(() => providerController.abort(), timeoutMs);
  const startedAt = Date.now();
  let headersAt = 0;
  let phase = 'response-headers';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: providerController.signal,
      body: JSON.stringify({
        model,
        ...(model === 'qwen3.8-flash' ? { enable_thinking: false } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        response_format: { type: 'json_object' }
      })
    });
    headersAt = Date.now();
    phase = 'response-body';
    if (!response.ok) {
      console.error('DashScope request failed', {
        status: response.status,
        requestId: response.headers.get('x-request-id') || undefined,
        elapsedMs: Date.now() - startedAt
      });
      throw new Error(`DashScope request failed with status ${response.status}`);
    }
    const completion = await response.json();
    const bodyAt = Date.now();
    phase = 'parse-model';
    const result = parseModelJson(completion?.choices?.[0]?.message?.content);
    console.info('DashScope request completed', {
      model,
      headersMs: headersAt - startedAt,
      bodyMs: bodyAt - headersAt,
      elapsedMs: Date.now() - startedAt,
      outputTokens: completion?.usage?.completion_tokens
    });
    return result;
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.error('DashScope request timed out', { phase, elapsedMs: Date.now() - startedAt });
    }
    throw error;
  } finally {
    clearTimeout(providerTimeout);
  }
}

function normalizeRecentSignals(value) {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set(['interest_preference', 'recent_need', 'dislike']);
  const seen = new Set();
  return value.map(item => {
    if (!item || typeof item !== 'object') return null;
    const type = String(item.type || '').trim();
    const content = String(item.content || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const fingerprint = `${type}|${content}`.toLowerCase();
    if (!allowedTypes.has(type) || content.length < 2 || seen.has(fingerprint)) return null;
    seen.add(fingerprint);
    return { type, content };
  }).filter(Boolean).slice(0, 3);
}

function isValidRecommendationResult(value) {
  return Boolean(
    value &&
    typeof value.summary === 'string' &&
    Array.isArray(value.recommendations) &&
    value.recommendations.length >= 3 &&
    value.recommendations.every(item =>
      item &&
      typeof item.title === 'string' &&
      typeof item.category === 'string' &&
      typeof item.reason === 'string' &&
      typeof item.budget === 'string' &&
      Array.isArray(item.tags)
    )
  );
}
