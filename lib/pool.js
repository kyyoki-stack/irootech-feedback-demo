// 需求池规则：AI 优先级打分、相似问题识别、处理动作、回复草稿。
// 后端（server.js）和演示版（浏览器里）共用这一份，保证两边结果一致。
(function (root) {
  const LEVELS = { stop: ['😫', '停线了', 46], heavy: ['😣', '很影响', 28], some: ['😐', '有点影响', 16], minor: ['🙂', '小问题', 8], idea: ['🤩', '有个建议', 4] };
  const CAT_W = { '安全': 24, '交付卡点': 20, '硬件故障': 10, '定位感知': 10, '效率': 8, '易用性': 6, '成本': 5, '新需求': 0, '待归类': 4 };
  const OPEN = ['received', 'reviewing', 'need_info', 'reopened'];       // 等产品经理处理
  const DOING = ['accepted', 'dev', 'test', 'released'];                  // 在做
  const CLOSED = ['merged', 'deferred', 'rejected', 'answered', 'solved']; // 已有结论
  const DAY = 86400000;

  /* ---------- 相似问题：按字的两两组合比重合度 ---------- */
  const clean = s => String(s || '').toLowerCase().replace(/【[^】]*】/g, '').replace(/[\s，。,.！!？?、：:；;（）()“”"'…\-—]/g, '');
  const grams = s => { const t = clean(s), g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
  function sim(a, b) {
    const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(x => B.has(x) && n++); return n / (A.size + B.size - n);
  }
  const body = it => it.text || (it.ai && it.ai.summary) || '';
  function similarOf(it, all) {
    const out = [];
    for (const o of all) {
      if (o.id === it.id || o.mergedInto || it.mergedInto === o.id || o.mergedInto === it.id) continue;
      if (['rejected'].includes(o.status)) continue;
      let s = sim(body(it), body(o));
      if (it.ai && o.ai && it.ai.category === o.ai.category && it.ai.category !== '待归类') s += 0.08;
      if (it.ai && o.ai && it.ai.module === o.ai.module && it.ai.module !== '待判断') s += 0.07;
      if (s >= 0.32) out.push({ id: o.id, score: Math.round(Math.min(1, s) * 100), summary: o.ai ? o.ai.summary : o.text, status: o.status });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /* ---------- AI 优先级：分数 + 说得出的理由 ---------- */
  function priority(it, all) {
    const reasons = []; let s = 0;
    const lv = LEVELS[it.level];
    s += lv ? lv[2] : 12; reasons.push(lv ? `提交人选了"${lv[1]}"` : '提交人没选严重程度');
    const cat = it.ai ? it.ai.category : '待归类', mod = it.ai ? it.ai.module : '';
    s += CAT_W[cat] ?? 4;
    if (cat === '安全') reasons.push('安全问题，最先处理');
    else if (cat === '交付卡点') reasons.push('卡住交付，直接吃交付人天');
    else if (cat === '效率') reasons.push('拖慢作业效率');
    else if (cat === '硬件故障' || cat === '定位感知') reasons.push(`${cat}，影响作业成功率`);
    if (mod === '安全' && cat !== '安全') { s += 14; reasons.push('涉及安全模块'); }
    const kids = all.filter(o => o.mergedInto === it.id);
    const sims = it.mergedInto ? [] : similarOf(it, all).filter(x => OPEN.includes(x.status) || DOING.includes(x.status));
    const group = [it, ...kids, ...sims.map(x => all.find(o => o.id === x.id)).filter(Boolean)];
    const people = new Set(group.map(o => o.uid)).size, sites = new Set(group.map(o => o.site).filter(Boolean)).size;
    if (people > 1) { s += Math.min(24, (people - 1) * 8); reasons.push(`${people} 个人提过同类问题` + (sites > 1 ? `，涉及 ${sites} 个现场` : '')); }
    if (it.role === '客户') { s += 6; reasons.push('客户直接反馈'); }
    if (it.status === 'reopened') { s += 12; reasons.push('上线后提交人说没解决'); }
    const days = Math.floor((Date.now() - new Date(it.createdAt)) / DAY);
    if (OPEN.includes(it.status) && days >= 1) { s += Math.min(10, days); reasons.push(`已等 ${days} 天`); }
    const score = Math.max(0, Math.min(100, Math.round(s)));
    const p = score >= 70 ? 'P0' : score >= 48 ? 'P1' : score >= 28 ? 'P2' : 'P3';
    return { score, p, reasons, people, sites };
  }

  /* ---------- 处理动作 ---------- */
  const ACTIONS = {
    review:    { to: 'reviewing', label: '开始评审', need: false },
    accept:    { to: 'accepted',  label: '接受',     need: false },
    merge:     { to: 'merged',    label: '合并',     need: false },
    defer:     { to: 'deferred',  label: '暂缓',     need: true },
    reject:    { to: 'rejected',  label: '不做',     need: true },
    need_info: { to: 'need_info', label: '打回补充', need: true },
    answer:    { to: 'answered',  label: '直接答复', need: true },
    dev:       { to: 'dev',       label: '开始开发', need: false },
    test:      { to: 'test',      label: '进入测试', need: false },
    release:   { to: 'released',  label: '已上线',   need: false },
  };
  // 回复草稿：产品经理可以直接用，也可以改
  function draft(action, it, o) {
    o = o || {};
    const v = o.version || it.version || '下个版本';
    return {
      review: '已看到，正在评估。',
      accept: `已接受，计划在 ${v} 解决。`,
      merge: o.mergeInto ? `和 #${o.mergeInto} 是同一个问题，已合并一起跟进，进度会同步给你。` : '已和同类问题合并一起跟进。',
      defer: '这个问题先暂缓：当前版本优先处理影响交付和安全的问题。如果现场频率变高，我们会重新评估。',
      reject: '这次先不做：原因是……（请写明，提交人会看到）',
      need_info: '需要你补充一下：具体是哪台车、什么时间、屏幕上有没有报错代码？方便的话拍张照。',
      answer: '这个不需要改产品，处理方法是：……',
      dev: '研发已开始修改。',
      test: '已修改完，正在测试。',
      release: `已在 ${v} 上线，请到现场确认问题是否解决。`,
    }[action] || '';
  }
  function push(it, status, note, by, t) {
    it.status = status; it.updatedAt = t || new Date().toISOString();
    it.history.push({ t: it.updatedAt, status, note: note || '', by: by || 'pm' });
  }
  // 执行一个处理动作。返回所有被改动的问题（合并、同步进度会改到别的问题）。
  function apply(it, action, o, all) {
    const A = ACTIONS[action]; o = o || {};
    if (action === 'edit') {
      it.ai = Object.assign({}, it.ai, {
        category: o.category || it.ai.category, module: o.module || it.ai.module,
        summary: o.summary || it.ai.summary, by: it.ai.by === 'user' ? 'user' : 'pm' });
      if (o.level && LEVELS[o.level]) it.level = o.level;
      it.updatedAt = new Date().toISOString();
      return { changed: [it] };
    }
    if (!A) return { error: '不认识的处理动作' };
    let reply = String(o.reply == null ? '' : o.reply).trim().slice(0, 1000);
    if (!reply && action === 'merge') reply = draft('merge', it, o);
    if (A.need && !reply) return { error: `"${A.label}"需要写一句原因，提交人会看到` };
    if (['dev', 'test', 'release'].includes(action) && !DOING.includes(it.status) && it.status !== 'reopened') return { error: '先"接受"这个问题，才能推进开发、测试、上线' };
    const changed = [it];
    if (action === 'merge') {
      const parent = all.find(x => x.id === +o.mergeInto);
      if (!parent || parent.id === it.id) return { error: '找不到要合并到的问题' };
      if (parent.mergedInto) return { error: `#${parent.id} 自己已经合并到别处了，请合并到 #${parent.mergedInto}` };
      it.mergedInto = parent.id;
      for (const k of all.filter(x => x.mergedInto === it.id)) { k.mergedInto = parent.id; changed.push(k); }
      push(parent, parent.status, `合并了 #${it.id}（${it.site || it.role}）`, 'pm'); changed.push(parent);
    }
    if (o.version != null && String(o.version).trim()) it.version = String(o.version).trim().slice(0, 40);
    if (reply) it.reply = reply;
    push(it, A.to, reply || A.label, 'pm');
    // 主问题推进时，合并进来的问题跟着走，提的人也能看到进度、上线后也能确认
    if (['accept', 'dev', 'test', 'release'].includes(action)) {
      for (const k of all.filter(x => x.mergedInto === it.id && !['solved'].includes(x.status))) {
        if (it.version) k.version = it.version;
        k.reply = `（随 #${it.id} 一起处理）` + (reply || A.label);
        push(k, A.to, k.reply, 'pm'); changed.push(k);
      }
    }
    return { changed };
  }

  // 给产品经理看的完整视图：加上优先级、相似问题、合并进来的问题
  function enrich(all) {
    return all.map(it => Object.assign({}, it, {
      prio: priority(it, all),
      similar: it.mergedInto ? [] : similarOf(it, all),
      children: all.filter(o => o.mergedInto === it.id).map(o => o.id),
    }));
  }


  /* ---------- AI 痛点：把一条条反馈归纳成几个痛点 ---------- */
  // 叉车现场常见痛点。命中关键词就归到这个痛点；都没命中的，按相似度和类别自动成组。
  const THEMES = [
    { key: 'safety',   title: '安全隐患：溜车、碰撞、险些伤人', re: /溜车|碰到人|撞到人|差点|危险|险些|碰撞|撞了|撞到|压到/, fix: '立即排查：先限速或加防护，再查根因；同步给安全负责人' },
    { key: 'pick',     title: '取货对不准，频繁人工接管',       re: /偏了|偏移|对不准|插不进|托盘.*(识别|找|插)|货叉.*(偏|歪)|取货.*(偏|失败)/, fix: '优化取货前的二次定位，按"人工接管次数"验收' },
    { key: 'falsestop',title: '感知误报，车无故停下',           re: /误报|误识别|强光|阳光|反光|障碍物.*(没有|误)|无故停/, fix: '收集误报现场的视频和时间段，针对强光等场景调感知参数' },
    { key: 'deploy',   title: '新现场部署慢，卡交付',           re: /建图|标点|手动标|部署|交付|调参|标定|进场|上线不了/, fix: '把建图标点做成自动化 / 向导式工具，目标：单台交付人天减半' },
    { key: 'fault',    title: '故障停机，恢复难',               re: /报错|E\d{2,}|急停.*起不来|起不来|死机|重启|断电|没电/i, fix: '统计报错代码 TOP3，补现场一键恢复指引和远程诊断' },
    { key: 'traffic',  title: '多车调度拥堵，效率下降',         re: /会车|互相等|堵|排队|交通管制|多车/, fix: '优化窄通道会车规则，加调度优先级，按"每小时搬运量"验收' },
    { key: 'integrate',title: '系统对接与数据报表',             re: /WMS|MES|对接|导出|报表|完成率|数据/i, fix: '整理客户系统清单，评估标准对接接口，放进产品化路线图' },
    { key: 'ui',       title: '操作界面不好用',                 re: /按钮|平板|手套|界面|看不清|看不懂|不会用|太小/, fix: '做一轮现场可用性测试：大按钮 / 手套模式 / 关键操作两步内完成' },
    { key: 'charge',   title: '充电对位不准',                   re: /充电/, fix: '检查充电桩对位精度，和取货精度问题一起看定位' },
  ];
  const LIVE = s => OPEN.includes(s) || DOING.includes(s);
  function insights(all) {
    const pool = all.filter(i => LIVE(i.status) || (i.mergedInto && LIVE((all.find(p => p.id === i.mergedInto) || {}).status)));
    const groups = new Map();
    const add = (k, meta, it) => { if (!groups.has(k)) groups.set(k, { ...meta, items: [] }); groups.get(k).items.push(it); };
    const rest = [];
    for (const it of pool) {
      const txt = it.text || (it.ai && it.ai.summary) || '';
      const th = THEMES.find(t => t.re.test(txt));
      if (th) add(th.key, { key: th.key, title: th.title, fix: th.fix }, it); else rest.push(it);
    }
    // 没命中预设痛点的：相似的放一起，否则按"类别 · 模块"成组
    for (const it of rest) {
      const g = [...groups.values()].find(g => g.auto && g.items.some(o => sim(o.text || '', it.text || '') >= 0.3));
      if (g) { g.items.push(it); continue; }
      const c = it.ai ? it.ai.category : '待归类', m = it.ai ? it.ai.module : '待判断';
      add('auto:' + c + m, { key: 'auto:' + c + m, title: (c === '待归类' ? '其他问题' : c) + (m && m !== '待判断' ? ' · ' + m : ''), fix: '先看原话，判断是否需要单独立项', auto: true }, it);
    }
    const week = Date.now() - 7 * 86400000;
    const cards = [...groups.values()].map(g => {
      const its = g.items, P = it => it.prio || priority(it, all);
      const lv = { stop: 0, heavy: 0, some: 0, minor: 0, idea: 0 }; its.forEach(i => { if (lv[i.level] != null) lv[i.level]++; });
      const people = new Set(its.map(i => i.uid)).size, sites = new Set(its.map(i => (i.site || '').replace(/\s+/g, '')).filter(Boolean)).size;
      const fresh = its.filter(i => new Date(i.createdAt) > week).length;
      const cats = new Set(its.map(i => i.ai && i.ai.category)), mods = new Set(its.map(i => i.ai && i.ai.module));
      const tags = [];
      if (g.key === 'safety' || cats.has('安全')) tags.push('安全');
      if (g.key === 'deploy' || cats.has('交付卡点')) tags.push('卡交付');
      if (lv.stop) tags.push('有停线');
      if (g.key === 'traffic' || g.key === 'pick' || g.key === 'falsestop' || cats.has('效率')) tags.push('影响效率');
      if (its.some(i => i.role === '客户')) tags.push('客户提过');
      const top = its.slice().sort((a, b) => P(b).score - P(a).score)[0];
      const maxScore = P(top).score;
      const score = Math.min(100, Math.round(maxScore + Math.min(18, Math.max(0, people - 1) * 6) + Math.min(10, Math.max(0, sites - 1) * 5) + Math.min(8, fresh * 2)));
      // 重点 / 观察 / 不建议
      let verdict, why;
      if (tags.includes('安全')) { verdict = 'focus'; why = '涉及人员和设备安全，必须先处理'; }
      else if (tags.includes('卡交付')) { verdict = 'focus'; why = '直接拖慢交付，每个新现场都要付出这个成本'; }
      else if (lv.stop) { verdict = 'focus'; why = '已经导致停线'; }
      else if (!g.auto && people >= 2 && (sites >= 2 || lv.heavy >= 2)) { verdict = 'focus'; why = `${people} 个人在 ${sites || 1} 个现场反复遇到，不是个例`; }
      else if (score >= 60) { verdict = 'focus'; why = '影响大、优先级高'; }
      else if (its.every(i => ['idea', 'minor'].includes(i.level)) && people === 1 && [...cats].every(c => ['新需求', '成本', '易用性', '待归类'].includes(c))) {
        verdict = 'skip'; why = '只有 1 个人提、不影响干活，可以先不做（要不要做由你决定，记得回复原因）';
      } else { verdict = 'watch'; why = people === 1 ? '目前只有 1 个人提，先观察，再有人提会自动升级' : '有影响但不紧急，排在重点之后'; }
      const quote = (top.text || (top.ai && top.ai.summary) || '').replace(/^【[^】]*】/, '').split(/\n/)[0].slice(0, 70);
      return { key: g.key, title: g.title, fix: g.fix, verdict, why, score, tags, levels: lv, count: its.length, people, sites, fresh,
        quote, quoteFrom: [top.role, top.site].filter(Boolean).join(' · '), topId: top.id, ids: its.map(i => i.id) };
    });
    const order = { focus: 0, watch: 1, skip: 2 };
    cards.sort((a, b) => order[a.verdict] - order[b.verdict] || b.tags.includes('安全') - a.tags.includes('安全') || b.score - a.score);
    // 重点控制在 3 张以内，多出来的降为"先观察"，避免什么都是重点
    cards.filter(c => c.verdict === 'focus').slice(3).forEach(c => { c.verdict = 'watch'; c.why = '影响也不小，但这周先集中解决前 3 个'; });
    cards.sort((a, b) => order[a.verdict] - order[b.verdict] || b.tags.includes('安全') - a.tags.includes('安全') || b.score - a.score);
    const focus = cards.filter(c => c.verdict === 'focus');
    const summary = !pool.length ? '现在没有未关闭的反馈。'
      : `现在有 ${pool.length} 条未关闭的反馈，归纳成 ${cards.length} 个痛点。`
        + (focus.length ? `建议这周重点解决 ${focus.length} 个：` + focus.map(c => `「${c.title.split(/[：，]/)[0]}」（${c.count} 条${c.sites > 1 ? `、${c.sites} 个现场` : ''}）`).join('、') + '。' : '暂时没有必须马上解决的痛点。')
        + (cards.length > focus.length ? `其余 ${cards.length - focus.length} 个先观察或暂不做。` : '');
    return { at: new Date().toISOString(), total: pool.length, cards, summary };
  }

  const Pool = { LEVELS, OPEN, DOING, CLOSED, ACTIONS, THEMES, sim, similarOf, priority, draft, apply, enrich, insights };
  if (typeof module !== 'undefined' && module.exports) module.exports = Pool; else root.Pool = Pool;
})(typeof window !== 'undefined' ? window : globalThis);
