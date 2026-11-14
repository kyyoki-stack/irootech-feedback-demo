/* 由 demo/build.js 生成 */
const CATS = [
  ['硬件故障', /故障|坏了|报警|报错|不亮|没电|电池|传感器|雷达|电机|异响|漏油|死机|重启|断电|烧|松动|卡死/],
  ['定位感知', /定位|偏了|偏移|误差|识别不|识别错|建图|地图|丢失|漂|库位|托盘.*(识别|找)|找不到托盘|看不到|毫米|厘米|cm|mm/i],
  ['交付卡点', /交付|部署|调试|标定|调参|上线|工期|验收|实施|进场|建完图|标点/],
  ['易用性', /难用|麻烦|不会用|步骤|复杂|界面|找不到|不好用|看不懂|太慢|繁琐|培训|学不会|操作/],
  ['成本', /太贵|成本|价格|报价|预算|便宜|回本/],
  ['新需求', /希望|能不能|想要|建议|增加|支持|最好能|需要一个|可不可以|加一个/],
];
const MODS = [
  ['导航定位', /定位|建图|地图|路径|导航|漂|绕路|停车/],
  ['取放货', /取货|放货|托盘|货叉|叉取|库位|堆垛|取放|对不准/],
  ['调度系统', /调度|任务|派单|排队|堵|交通管制|多车/],
  ['人机交互', /界面|平板|语音|按钮|屏幕|提示|操作|app|小程序/i],
  ['整车硬件', /电池|电机|雷达|传感器|轮|刹车|灯|充电|液压|漏油/],
  ['安全', /碰|撞|急停|避障|安全|有人/],
];
function ruleAnalyze({ text, site, media }) {
  const t = (text || '').trim();
  const n = { image: 0, video: 0, audio: 0 };
  (media || []).forEach(m => { if (n[m.kind] != null) n[m.kind]++; });
  const att = [n.audio && `${n.audio} 段语音`, n.image && `${n.image} 张照片`, n.video && `${n.video} 段视频`].filter(Boolean).join('、');
  if (!t) {
    return { summary: `收到${att || '内容'}，没有文字。产品经理听完看完后再归类。`, category: '待归类', module: '待判断', by: 'rule', needHuman: true };
  }
  const category = (CATS.find(([, re]) => re.test(t)) || ['待归类'])[0];
  const module = (MODS.find(([, re]) => re.test(t)) || ['待判断'])[0];
  let first = t.split(/[。！？!?\n]/)[0].trim();
  if (first.length > 46) first = first.slice(0, 46) + '…';
  const summary = `${site ? site + '：' : ''}${first}${att ? `（附${att}）` : ''}`;
  return { summary, category, module, by: 'rule' };
}

// 演示版：没有后端，所有 /api 请求在浏览器里完成。
// 反馈存 localStorage，照片 / 视频 / 录音存 IndexedDB，只在这台手机上。
(function () {
  const KEY = 'fp_demo_db';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { seq: 0, items: [] }; } catch { return { seq: 0, items: [] }; } };
  const save = db => localStorage.setItem(KEY, JSON.stringify(db));
  const now = () => new Date().toISOString();
  const ago = min => new Date(Date.now() - min * 60000).toISOString();
  const push = (it, status, note, by, t) => { it.status = status; it.updatedAt = t || now(); it.history.push({ t: it.updatedAt, status, note: note || '', by: by || 'system' }); };

  /* ---------- 媒体文件：IndexedDB ---------- */
  let dbp;
  const idb = () => dbp || (dbp = new Promise((ok, bad) => {
    const r = indexedDB.open('fp_demo_files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('f');
    r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
  }));
  const tx = async (mode, fn) => { const d = await idb(); return new Promise((ok, bad) => { const t = d.transaction('f', mode); const q = fn(t.objectStore('f')); t.oncomplete = () => ok(q && q.result); t.onerror = () => bad(t.error); }); };
  const putFile = (k, blob) => tx('readwrite', s => s.put(blob, k));
  const getFile = k => tx('readonly', s => s.get(k));
  const urls = {};
  async function withUrls(it) {
    const c = JSON.parse(JSON.stringify(it));
    for (const m of c.media) {
      if (!m.file) continue;
      if (!urls[m.file]) { const b = await getFile(m.file).catch(() => null); if (b) urls[m.file] = URL.createObjectURL(b); }
      m.url = urls[m.file] || '';
    }
    return c;
  }

  /* ---------- 示例数据：让第一次打开的人看到完整流程 ---------- */
  function seed(db, uid) {
    if (db.items.some(i => i.uid === uid)) return;
    const mk = (min, role, site, level, text, ai) => {
      const it = { id: ++db.seq, uid, role, site, name: '', level, text: '【示例】' + text, media: [], ai: { ...ai, by: 'rule' }, aiConfirmed: true,
        status: 'received', reply: '', version: '', createdAt: ago(min), updatedAt: ago(min), history: [], demo: true };
      push(it, 'received', '已进入需求池，等待产品经理查看', 'system', ago(min));
      db.items.push(it); return it;
    };
    let a = mk(2880, '调试实施', '长沙 18 号厂房', 'heavy', '3 号库位取货时货叉偏了大概 2 厘米，今天连续 3 次要人工接管',
      { summary: '长沙 18 号厂房：3 号库位取货偏 2 厘米，连续 3 次人工接管', category: '定位感知', module: '取放货' });
    push(a, 'reviewing', '已看到，和定位组一起看日志', 'pm', ago(2700));
    push(a, 'accepted', '是取货前二次定位的问题，排进 V1.3', 'pm', ago(2400)); a.reply = '是取货前二次定位的问题，排进 V1.3'; a.version = 'V1.3';
    push(a, 'dev', '研发已开始修改', 'pm', ago(1500));
    let b = mk(600, '现场运维', '长沙 18 号厂房', 'stop', '2 号车在充电桩前报错停住，重启也不行',
      { summary: '长沙 18 号厂房：2 号车充电桩前报错停车，重启无效', category: '硬件故障', module: '整车硬件' });
    push(b, 'need_info', '屏幕上的报错代码是多少？方便的话拍一张', 'pm', ago(560)); b.reply = '屏幕上的报错代码是多少？方便的话拍一张';
    let c = mk(10080, '客户', '株洲 3 号仓', 'minor', '平板上任务按钮太小，戴手套点不准',
      { summary: '株洲 3 号仓：平板任务按钮太小，戴手套点不准', category: '易用性', module: '人机交互' });
    push(c, 'reviewing', '', 'pm', ago(9800)); push(c, 'accepted', '放大按钮，加手套模式', 'pm', ago(9000));
    push(c, 'dev', '', 'pm', ago(7000)); push(c, 'test', '', 'pm', ago(4000));
    push(c, 'released', '已在 V1.2 上线手套模式，按钮放大一倍', 'pm', ago(300)); c.reply = '已在 V1.2 上线手套模式，按钮放大一倍'; c.version = 'V1.2';
  }

  /* ---------- 演示：自动模拟产品经理推进你自己提的问题 ---------- */
  function autoAdvance(db) {
    let changed = false;
    for (const it of db.items) {
      if (it.demo) continue;
      const age = (Date.now() - new Date(it.createdAt)) / 1000;
      if (it.status === 'received' && age > 20) { push(it, 'reviewing', '（演示）产品经理已看到，正在评估', 'pm'); changed = true; }
      if (it.status === 'reviewing' && age > 60 && !it.history.some(h => h.by === 'user')) {
        const r = '（演示）已接受，排进下个版本'; push(it, 'accepted', r, 'pm'); it.reply = r; it.version = 'V1.4'; changed = true;
      }
    }
    return changed;
  }

  /* ---------- 路由 ---------- */
  const J = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json' } });
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  async function route(path, method, body) {
    const db = load(); const u = new URL(path, location.href); const p = u.pathname;
    if (method === 'GET' && p === '/api/my') {
      const uid = u.searchParams.get('uid') || '';
      seed(db, uid); autoAdvance(db); save(db);
      const list = db.items.filter(i => i.uid === uid).sort((a, b) => b.id - a.id);
      return J(200, { items: await Promise.all(list.map(withUrls)) });
    }
    if (method === 'POST' && p === '/api/feedback') {
      const text = str(body.text, 4000), media = (body.media || []).slice(0, 12);
      if (!body.uid) return J(400, { error: '缺少 uid' });
      if (!text && !media.length) return J(400, { error: '说点什么，或者拍一张再提交' });
      const it = { id: ++db.seq, uid: body.uid, role: str(body.role, 20) || '未填', site: str(body.site, 40), name: str(body.name, 20),
        level: str(body.level, 10), text, media: media.map(m => ({ file: m.file, kind: m.kind, size: m.size, dur: m.dur || 0 })),
        ai: null, aiConfirmed: null, status: 'received', reply: '', version: '', createdAt: now(), updatedAt: now(), history: [] };
      it.ai = ruleAnalyze(it);
      push(it, 'received', '已进入需求池，等待产品经理查看');
      db.items.push(it); save(db);
      return J(200, { item: await withUrls(it) });
    }
    const m = /^\/api\/feedback\/(\d+)\/(understanding|confirm|supplement)$/.exec(p);
    if (m && method === 'POST') {
      const it = db.items.find(i => i.id === +m[1]);
      if (!it || it.uid !== body.uid) return J(404, { error: '没有这条' });
      if (m[2] === 'understanding') { if (body.summary) it.ai = { ...it.ai, summary: str(body.summary, 200), by: 'user', needHuman: false }; it.aiConfirmed = true; }
      if (m[2] === 'confirm') {
        if (it.status !== 'released') return J(409, { error: '当前状态不能确认' });
        body.solved ? push(it, 'solved', '提交人确认：已解决', 'user') : push(it, 'reopened', '提交人反馈：还没解决' + (body.text ? '。' + str(body.text, 500) : ''), 'user');
      }
      if (m[2] === 'supplement') {
        const t = str(body.text, 2000); if (!t) return J(400, { error: '补充内容是空的' });
        it.text += '\n【补充】' + t; push(it, 'reviewing', '提交人已补充：' + t, 'user');
      }
      save(db); return J(200, { item: await withUrls(it) });
    }
    return J(404, { error: 'not found' });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!new URL(url, location.href).pathname.startsWith('/api/')) return realFetch(input, init);
    let body = {}; try { body = init.body ? JSON.parse(init.body) : {}; } catch {}
    return route(url, (init.method || 'GET').toUpperCase(), body);
  };

  // 上传：页面用 XMLHttpRequest 发文件，这里换成存进 IndexedDB，并模拟进度
  const RealXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const real = new RealXHR(); let fake = false, type = '';
    const x = {
      upload: {}, status: 0, responseText: '',
      open(m, url) { fake = /\/api\/upload$/.test(url); if (!fake) real.open(m, url); },
      setRequestHeader(k, v) { if (fake) { if (/content-type/i.test(k)) type = v; } else real.setRequestHeader(k, v); },
      async send(blob) {
        if (!fake) { ['onload', 'onerror'].forEach(e => real[e] = () => { x.status = real.status; x.responseText = real.responseText; x[e] && x[e](); }); return real.send(blob); }
        try {
          if (blob.size > 95 * 1024 * 1024) { x.status = 413; x.responseText = JSON.stringify({ error: '文件超过 95MB，拍短一点' }); return x.onload && x.onload(); }
          const file = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
          for (const f of [0.3, 0.7]) { await new Promise(r => setTimeout(r, 120)); x.upload.onprogress && x.upload.onprogress({ lengthComputable: true, loaded: blob.size * f, total: blob.size }); }
          await putFile(file, blob);
          x.status = 200; x.responseText = JSON.stringify({ file, url: '', kind: (type || blob.type || 'image/').split('/')[0], size: blob.size });
          x.onload && x.onload();
        } catch (e) { x.onerror && x.onerror(); }
      },
    };
    return x;
  };
})();
