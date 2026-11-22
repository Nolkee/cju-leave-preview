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
    if (url.pathname === '/stats') {
      const visitors = parseInt((await env.COUNTER.get('total:visitors')) || '0', 10) || 0;
      const bonus = parseInt((await env.COUNTER.get('total:bonus')) || '0', 10) || 0;
      return json({ visitors, bonus });
    }
    const kind = url.pathname === '/visit' ? 'visitors' : url.pathname === '/bonus' ? 'bonus' : null;
    if (!kind) return json({ error: 'not found' }, 404);
    const vid = url.searchParams.get('vid') || '';
    if (!/^[A-Za-z0-9-]{8,64}$/.test(vid)) return json({ error: 'bad vid' }, 400);
    // 本次调用的计数：第一次来才 +1，seen 的值就是这个浏览器当时的排名
    const isNew = await countOnce(env.COUNTER, kind, vid);
    // 每次访问都累计该浏览器的访问次数（两站共用一个 vid 就共用这个数）
    let myVisits = 0;
    if (kind === 'visitors') {
      myVisits = await countVisits(env.COUNTER, vid);
    } else {
      myVisits = parseInt((await env.COUNTER.get(`visits:${vid}`)) || '0', 10) || 0;
    }
    const visitors = parseInt((await env.COUNTER.get('total:visitors')) || '0', 10) || 0;
    const bonus = parseInt((await env.COUNTER.get('total:bonus')) || '0', 10) || 0;
    return json({
      visitors,
      bonus,
      isNew,
      myVisitorRank: await rankOf(env.COUNTER, 'visitors', vid),
      myBonusRank: await rankOf(env.COUNTER, 'bonus', vid),
      myVisits,
    });
  },
};

// 第一次出现才 +1，并把当时的总数（即排名）记在 seen 里；返回是不是第一次
async function countOnce(store, kind, vid) {
  const seenKey = `seen:${kind}:${vid}`;
  const totalKey = `total:${kind}`;
  if (await store.get(seenKey)) return false;
  const total = (parseInt((await store.get(totalKey)) || '0', 10) || 0) + 1;
  await store.put(seenKey, String(total));
  await store.put(totalKey, String(total));
  return true;
}

// 这个浏览器在某类计数里的排名（从没计过就返回 null）
async function rankOf(store, kind, vid) {
  const n = parseInt((await store.get(`seen:${kind}:${vid}`)) || '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 该浏览器累计访问次数（每次 /visit +1，两站共用一个 vid 就共用这个数）
async function countVisits(store, vid) {
  const key = `visits:${vid}`;
  const n = (parseInt((await store.get(key)) || '0', 10) || 0) + 1;
  await store.put(key, String(n));
  return n;
}
