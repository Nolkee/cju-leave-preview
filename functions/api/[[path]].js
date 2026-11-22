// CJU 请假 demo 全站计数器（Pages Functions 版）：访问人数 + Bonus 点击人数（同一浏览器只算一次）
// 部署：随 Cloudflare Pages 一起部署（functions/ 目录在仓库根目录，不在 dist/ 里），
//   在 Pages 项目设置里绑一个 KV 命名空间，变量名 COUNTER（指向 cju-leave-counter）。
//   与独立 Worker 共用同一个 KV 命名空间，数据互通，总数不会丢。
// 为什么不用 Worker：workers.dev 域名在国内不开 VPN 打不开，计数就显示不出来；
//   Pages Functions 走本站同一个 pages.dev 域名，站能打开，计数就能显示。
// 接口（同域）：
//   GET /api/visit?vid=<浏览器随机ID>  -> { visitors, bonus, isNew, myVisitorRank, myBonusRank, myVisits }
//   GET /api/bonus?vid=<浏览器随机ID>  -> { visitors, bonus, isNew, myVisitorRank, myBonusRank, myVisits }
//   GET /api/stats                     -> { visitors, bonus }
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

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!env.COUNTER) return json({ error: 'KV not bound' }, 500);
  if (url.pathname === '/api/stats') {
    const visitors = parseInt((await env.COUNTER.get('total:visitors')) || '0', 10) || 0;
    const bonus = parseInt((await env.COUNTER.get('total:bonus')) || '0', 10) || 0;
    return json({ visitors, bonus });
  }
  const kind = url.pathname === '/api/visit' ? 'visitors' : url.pathname === '/api/bonus' ? 'bonus' : null;
  if (!kind) return json({ error: 'not found' }, 404);
  const vid = url.searchParams.get('vid') || '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(vid)) return json({ error: 'bad vid' }, 400);
  // 本次调用的计数：第一次来才 +1，seen 的值就是这个浏览器当时的排名
  const isNew = await countOnce(env.COUNTER, kind, vid);
  // 每次访问都累计该浏览器的访问次数（同一个 vid 就共用这个数）
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
}

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

// 该浏览器累计访问次数（每次 /api/visit +1，同一个 vid 就共用这个数）
async function countVisits(store, vid) {
  const key = `visits:${vid}`;
  const n = (parseInt((await store.get(key)) || '0', 10) || 0) + 1;
  await store.put(key, String(n));
  return n;
}
