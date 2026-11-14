// AI 理解（关键词规则版）：一句话摘要 + 类别 + 模块。
// 没配大模型时用它；配了大模型时作为兜底。后端和演示版共用。
(function (root) {
  // 按顺序匹配，排在前面的优先：安全 > 交付卡点 > 硬件故障 > 定位感知 > 效率 > 易用性 > 成本 > 新需求
  const CATS = [
    ['安全', /溜车|碰到人|撞到人|差点|危险|险些|伤到|碰撞|撞了|压到/],
    ['交付卡点', /交付|部署|工期|验收|实施|进场|标点|手动标|建图.*(慢|久|周|天)|调参|标定|上线不了|卡在/],
    ['硬件故障', /故障|坏了|报警|报错|E\d{2,}|不亮|没电|电池|传感器|电机|异响|漏油|死机|重启|断电|烧|松动|卡死|起不来|急停/i],
    ['定位感知', /定位|偏了|偏移|误差|识别不|识别错|误报|误识别|建图|地图|丢失|漂|托盘.*(识别|找)|找不到托盘|看不到|对不准|插不进|毫米|厘米|cm|mm/i],
    ['效率', /堵|会车|互相等|等很久|效率|节拍|空跑|太慢|跑得慢|绕路|排队/],
    ['易用性', /难用|麻烦|不会用|步骤|复杂|界面|不好用|看不懂|繁琐|培训|学不会|太小|点不准|手套|看不清/],
    ['成本', /太贵|成本|价格|报价|预算|便宜|回本/],
    ['新需求', /希望|能不能|想要|建议|增加|支持|最好能|需要一个|可不可以|加一个|对接|导出/],
  ];
  const MODS = [
    ['安全', /碰|撞|急停|避障|安全|有人|溜车|坡道|危险/],
    ['导航定位', /定位|建图|地图|路径|导航|漂|绕路|标点/],
    ['取放货', /取货|放货|托盘|货叉|叉取|库位|堆垛|取放/],
    ['调度系统', /调度|任务|派单|排队|堵|会车|交通管制|多车|WMS|对接/i],
    ['人机交互', /界面|平板|语音|按钮|屏幕|提示|app|小程序|导出/i],
    ['整车硬件', /电池|电机|雷达|传感器|轮|刹车|灯|充电|液压|漏油/],
  ];
  function ruleAnalyze({ text, site, media }) {
    const t = (text || '').trim();
    const n = { image: 0, video: 0, audio: 0 };
    (media || []).forEach(m => { if (n[m.kind] != null) n[m.kind]++; });
    const att = [n.audio && `${n.audio} 段语音`, n.image && `${n.image} 张照片`, n.video && `${n.video} 段视频`].filter(Boolean).join('、');
    if (!t) return { summary: `收到${att || '内容'}，没有文字。产品经理听完看完后再归类。`, category: '待归类', module: '待判断', by: 'rule', needHuman: true };
    const category = (CATS.find(([, re]) => re.test(t)) || ['待归类'])[0];
    const module = (MODS.find(([, re]) => re.test(t)) || ['待判断'])[0];
    let first = t.split(/[。！？!?\n]/)[0].trim();
    if (first.length > 46) first = first.slice(0, 46) + '…';
    return { summary: `${site ? site + '：' : ''}${first}${att ? `（附${att}）` : ''}`, category, module, by: 'rule' };
  }
  const Rules = { CATS: CATS.map(c => c[0]), MODS: MODS.map(m => m[0]), ruleAnalyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules; else root.Rules = Rules;
})(typeof window !== 'undefined' ? window : globalThis);
