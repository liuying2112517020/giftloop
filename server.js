const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env.local') });

const app = express();
const port = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
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

  const { friend, occasion, budget, extraNote = '' } = req.body || {};
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
- 与用户的关系
- 送礼原因
- 预算
- 历史礼物
- 用户补充说明

用户补充说明中可能包含“本次最在意”“礼物形式偏好”“明确排除”“其他排除”“其他必须考虑”：
- “明确排除”和“其他排除”是硬约束，推荐中不得出现被排除的方向
- “礼物形式偏好”应优先满足；未提供时再自由判断
- “本次最在意”用于比较候选方案并解释推荐理由
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

允许推荐真实存在的品牌，但不要编造不存在的品牌、产品、实时价格或促销。

每个 reason 必须结合朋友的具体信息解释为什么适合 TA。必须引用用户提供的具体信息进行判断，不允许使用“未知信息”“信息不足”或类似表述；没有历史礼物时，按“暂无”处理。

避免普通礼盒、马克杯、普通香薰、鲜花、保温杯、零食、玩偶等泛化推荐，除非和朋友信息高度相关。

只返回合法 JSON，不要使用 Markdown 代码块，也不要添加 JSON 之外的文字。返回结构必须严格为：
{
  "summary": "一句简短的推荐思路",
  "recommendations": [
    {
      "title": "礼物名称",
      "category": "给用户看的礼物方向，例如居家生活、纪念定制、兴趣体验",
      "imageKey": "home|drink|memory|plant|fashion|tech|art|sport|hobby|experience 之一",
      "reason": "一句话核心理由，控制在55个中文字符以内",
      "details": ["结合朋友具体资料的理由1", "理由2", "理由3"],
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
      giftHistory: normalizeGiftHistory(friend.giftHistory)
    },
    occasion: String(occasion).trim(),
    budget: String(budget).trim(),
    extraNote: String(extraNote).trim().slice(0, 1000)
  };

  const userPrompt = `请严格基于下面这位朋友的具体资料推荐礼物：

朋友：${userPayload.friend.name}
关系：${userPayload.friend.relationship || '未填写'}
性格：${formatList(userPayload.friend.personality, '未填写')}
兴趣：${formatList(userPayload.friend.interests, '未填写')}
最近发生：${formatList(userPayload.friend.recentMemories, '暂无')}
过去送过：${formatGiftHistory(userPayload.friend.giftHistory)}
送礼原因：${userPayload.occasion}
预算：${userPayload.budget}
补充：${userPayload.extraNote || '无'}

推荐理由必须明确关联以上资料中的具体信息。不要说“未知信息”或用通用礼物清单敷衍。请返回 3 个彼此不同的方向，并严格使用 system prompt 指定的 JSON 结构。`;

  if (process.env.NODE_ENV !== 'production') {
    console.info('Gift recommendation context', userPayload);
  }

  try {
    const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const providerRequestId = response.headers.get('x-request-id');
      console.error('DashScope request failed', {
        status: response.status,
        requestId: providerRequestId || undefined
      });
      return res.status(502).json({
        error: 'AI_PROVIDER_ERROR',
        message: '礼物推荐服务暂时不可用，请稍后重试。'
      });
    }

    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    const result = parseModelJson(content);

    if (!isValidRecommendationResult(result)) {
      throw new Error('Model returned an unexpected JSON structure');
    }

    return res.json({
      summary: result.summary,
      recommendations: result.recommendations.slice(0, 3).map(item => ({
        title: String(item.title),
        category: String(item.category),
        imageKey: normalizeImageKey(item.imageKey),
        reason: String(item.reason),
        details: asStringArray(item.details).slice(0, 4),
        budget: String(item.budget),
        tags: asStringArray(item.tags).slice(0, 3)
      }))
    });
  } catch (error) {
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

function formatList(value, emptyText) {
  return value.length ? value.join('、') : emptyText;
}

function formatGiftHistory(value) {
  return value.length ? value.join('；') : '暂无';
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
