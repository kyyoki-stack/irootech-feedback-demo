// 演示版：没有后端，所有 /api 请求在浏览器里完成（依赖 lib/rules.js、lib/pool.js 先加载）。
// 反馈存 localStorage，照片 / 视频 / 录音存 IndexedDB，只在这台设备上。
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

  /* ---------- 示例数据 ---------- */
  const mk = (db, min, uid, role, site, level, text, extra) => {
    const it = { id: ++db.seq, uid, role, site, name: '', level, text, media: [], ai: null, aiConfirmed: true,
      status: 'received', reply: '', version: '', createdAt: ago(min), updatedAt: ago(min), history: [], demo: true, ...(extra || {}) };
    it.ai = Rules.ruleAnalyze(it);
    push(it, 'received', '已进入需求池，等待产品经理查看', 'system', ago(min));
    db.items.push(it); return it;
  };
  // 需求池里其他人提的问题：让产品经理端一打开就有一池子真实感的数据
  function seedPool(db) {
    if (db.pooled) return; db.pooled = true;
    const S = (min, uid, role, site, lv, text) => mk(db, min, uid, role, site, lv, text);
    S(40, 'd-a', '现场运维', '长沙 18 号厂房', 'stop', '3 号车在 B 区通道急停后起不来，报错 E203，整条线停了 20 分钟');
    const b = S(1500, 'd-b', '调试实施', '长沙 18 号厂房', 'heavy', '4 号库位取货时货叉偏了 2 厘米，一天要人工接管 5 次');
    S(300, 'd-c', '调试实施', '株洲 3 号仓', 'heavy', '取货时货叉偏了大概 2 厘米，托盘插不进去要人工接管');
    S(900, 'd-d', '售后', '昆山 2 号厂', 'some', '雷达在强光门口经常误报障碍物，车停下来等很久');
    S(200, 'd-e', '客户', '昆山 2 号厂', 'heavy', '下午阳光照进卸货口，雷达误报，车一直停着不走');
    S(4300, 'd-f', '调试实施', '株洲 3 号仓', 'heavy', '每个新现场建图标点要两三周，库位一个个手动标太慢了，交付卡在这里');
    S(2800, 'd-g', '方案', '', 'idea', '希望平板上能一键导出当天的任务完成率，给客户汇报用');
    const i = S(6000, 'd-i', '销售', '', 'some', '客户问能不能和他们的 WMS 系统对接，现在要人工下发任务');
    S(700, 'd-j', '生产制造', '长沙总装', 'some', '下线测试时充电口对不准，要人工推一下');
    S(120, 'd-k', '现场运维', '长沙 18 号厂房', 'heavy', '两台车在窄通道会车时互相等，谁也不走，堵了 10 分钟');
    S(25, 'd-l', '客户', '长沙 18 号厂房', 'stop', '车在坡道上溜车了一小段，差点碰到人，太危险');
    push(b, 'reviewing', '已看到，和定位组一起看日志', 'pm', ago(1400));
    push(i, 'deferred', '先暂缓：今年先保证单现场交付，WMS 对接放到明年产品化里统一做', 'pm', ago(5000)); i.reply = '先暂缓：今年先保证单现场交付，WMS 对接放到明年产品化里统一做';
  }
  // 体验者自己"我的问题"里的 3 条示例，展示完整处理流程
  function seedMine(db, uid) {
    if (db.items.some(i => i.uid === uid)) return;
    let a = mk(db, 2880, uid, '调试实施', '长沙 18 号厂房', 'heavy', '【示例】3 号库位取货时货叉偏了大概 2 厘米，今天连续 3 次要人工接管');
    push(a, 'reviewing', '已看到，和定位组一起看日志', 'pm', ago(2700));
    push(a, 'accepted', '是取货前二次定位的问题，排进 V1.3', 'pm', ago(2400)); a.reply = '是取货前二次定位的问题，排进 V1.3'; a.version = 'V1.3';
    push(a, 'dev', '研发已开始修改', 'pm', ago(1500));
    let b = mk(db, 600, uid, '现场运维', '长沙 18 号厂房', 'stop', '【示例】2 号车在充电桩前报错停住，重启也不行');
    push(b, 'need_info', '屏幕上的报错代码是多少？方便的话拍一张', 'pm', ago(560)); b.reply = '屏幕上的报错代码是多少？方便的话拍一张';
    let c = mk(db, 10080, uid, '客户', '株洲 3 号仓', 'minor', '【示例】平板上任务按钮太小，戴手套点不准');
    push(c, 'reviewing', '', 'pm', ago(9800)); push(c, 'accepted', '放大按钮，加手套模式', 'pm', ago(9000));
    push(c, 'dev', '', 'pm', ago(7000)); push(c, 'test', '', 'pm', ago(4000));
    push(c, 'released', '已在 V1.2 上线手套模式，按钮放大一倍', 'pm', ago(300)); c.reply = '已在 V1.2 上线手套模式，按钮放大一倍'; c.version = 'V1.2';
  }
  // 体验者自己提的问题：产品经理没动过的话，自动模拟推进，让手机端能看到变化
  function autoAdvance(db) {
    for (const it of db.items) {
      if (it.demo || it.history.some(h => h.by === 'pm')) continue;
      const age = (Date.now() - new Date(it.createdAt)) / 1000;
      if (it.status === 'received' && age > 20) push(it, 'reviewing', '（演示）产品经理已看到，正在评估', 'auto');
      if (it.status === 'reviewing' && age > 60 && !it.history.some(h => h.by === 'user')) {
        const r = '（演示）已接受，排进下个版本'; push(it, 'accepted', r, 'auto'); it.reply = r; it.version = 'V1.4';
      }
    }
  }

  /* ---------- 路由 ---------- */
  const J = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json' } });
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  async function route(path, method, body) {
    const db = load(); const u = new URL(path, location.href); const p = u.pathname;
    seedPool(db);
    if (method === 'GET' && p === '/api/my') {
      const uid = u.searchParams.get('uid') || '';
      seedMine(db, uid); autoAdvance(db); save(db);
      return J(200, { items: await Promise.all(db.items.filter(i => i.uid === uid).sort((a, b) => b.id - a.id).map(withUrls)) });
    }
    if (method === 'POST' && p === '/api/feedback') {
      const text = str(body.text, 4000), media = (body.media || []).slice(0, 12);
      if (!body.uid) return J(400, { error: '缺少 uid' });
      if (!text && !media.length) return J(400, { error: '说点什么，或者拍一张再提交' });
      const it = { id: ++db.seq, uid: body.uid, role: str(body.role, 20) || '未填', site: str(body.site, 40), name: str(body.name, 20),
        level: str(body.level, 10), text, media: media.map(m => ({ file: m.file, kind: m.kind, size: m.size, dur: m.dur || 0 })),
        ai: null, aiConfirmed: null, status: 'received', reply: '', version: '', createdAt: now(), updatedAt: now(), history: [] };
      it.ai = Rules.ruleAnalyze(it);
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
    // 产品经理端
    if (p === '/api/admin/check') { save(db); return J(200, { ok: true }); }
    if (method === 'GET' && p === '/api/admin/items') {
      autoAdvance(db); save(db);
      return J(200, { items: await Promise.all(Pool.enrich(db.items).map(withUrls)) });
    }
    const a = /^\/api\/admin\/feedback\/(\d+)$/.exec(p);
    if (a) {
      const it = db.items.find(i => i.id === +a[1]);
      if (!it) return J(404, { error: '没有这条' });
      if (method === 'DELETE') { db.items = db.items.filter(i => i.id !== it.id); save(db); return J(200, { ok: true }); }
      const r = Pool.apply(it, body.action, body, db.items);
      if (r.error) return J(400, { error: r.error });
      save(db); return J(200, { item: Pool.enrich(db.items).find(i => i.id === it.id) });
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
