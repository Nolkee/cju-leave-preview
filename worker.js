// CJU 请假 demo 全站计数器：访问人数 + Bonus 点击人数（同一浏览器只算一次）
// 部署：Cloudflare Worker（Git 连接），绑定一个 KV 命名空间 COUNTER。
// 接口：
//   GET /visit?vid=<浏览器随机ID>  -> { visitors, bonus, isNew }
//   GET /bonus?vid=<浏览器随机ID>  -> { visitors, bonus, isNew }
//   GET /                          -> { ok: true }
// 跨域：允许所有来源（公开计数器，无敏感数据）。
// 注意：免费版 KV 每天写入次数有上限（约 1000 次），这个小站够用。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/') return json({ ok: true, service: 'cju-leave-counter' });
    if (!env.COUNTER) return json({ error: 'KV not bound' }, 500);
    const kind = url.pathname === '/visit' ? 'visitors' : url.pathname === '/bonus' ? 'bonus' : null;
    if (!kind) return json({ error: 'not found' }, 404);
    const vid = url.searchParams.get('vid') || '';
    if (!/^[A-Za-z0-9-]{8,64}$/.test(vid)) return json({ error: 'bad vid' }, 400);
    const seenKey = `seen:${kind}:${vid}`;
    const totalKey = `total:${kind}`;
    const seen = await env.COUNTER.get(seenKey);
    let total = parseInt((await env.COUNTER.get(totalKey)) || '0', 10) || 0;
    if (!seen) {
      await env.COUNTER.put(seenKey, '1');
      total += 1;
      await env.COUNTER.put(totalKey, String(total));
    }
    const visitors = parseInt((await env.COUNTER.get('total:visitors')) || '0', 10) || 0;
    const bonus = parseInt((await env.COUNTER.get('total:bonus')) || '0', 10) || 0;
    return json({ visitors, bonus, isNew: !seen });
  },
};
