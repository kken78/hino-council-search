// proceedings.mjs — 1日分の発言列から審議の場面（一般質問・議案質疑・委員長報告・討論・提案説明・採決）を切り出す。
// 議長の決まり文句（「各案に対する質疑に入ります」「次に、N番、X君。」「よって、…と決しました」など）で場面を切り替える状態機械。
// 入力 speeches: [{ i, sid, role, name, text }]（その日の発言順。i は sid 末尾の連番）
// 出力 segments: proceedings.json の segments 要素（README §4 参照）。
import { toHalf } from "./speech.mjs";

const isChair = (role) => /議長$/.test(role || "");
const isSeat = (role) => /^[0-9０-９]+番$/.test(role || "");
const squash = (s) => String(s || "").replace(/[\s　]/g, "");

// ── 議案番号の展開 ─────────────────────────────────────────
// 「議第100号から議第104号まで」「議第105号…を除く議第100号から議第121号まで」「議第95号、議第96号および議第97号」
const PFX = "決議案|議案|請願|発議|陳情|議|報|選|諮";
const REF = new RegExp(`(${PFX})第(\\d+)号(?:から(?:(?:${PFX})?第)?(\\d+)号まで)?`, "g");
function refsIn(s) {
  const out = [];
  for (const m of s.matchAll(REF)) {
    const from = +m[2], to = m[3] ? +m[3] : from;
    if (to < from || to - from > 60) { out.push(`${m[1]}第${from}号`); continue; }
    for (let n = from; n <= to; n++) out.push(`${m[1]}第${n}号`);
  }
  return out;
}
export function expandBills(str) {
  const s = toHalf(squash(str)).replace(/日程第\d+/g, ""); // 「議第95号から日程第29議第121号まで」
  const k = s.lastIndexOf("を除く");
  if (k >= 0) {
    // 「…を除く議第100号から…」は除外。後ろに番号が無い「議第71号の修正議決をした部分を除く部分」は除外ではない
    const excl = new Set(refsIn(s.slice(0, k))), incl = refsIn(s.slice(k));
    if (incl.length) return [...new Set(incl.filter((b) => !excl.has(b)))];
  }
  return [...new Set(refsIn(s))];
}

// 件名照合（番号を言わず件名だけで触れる討論など）。短すぎる件名は誤照合するので対象外。
function billsByTitle(text, agenda, head = 500) {
  const t = squash(text).slice(0, head);
  return agenda.filter((a) => a.title && a.title.length >= 10 && t.includes(squash(a.title))).map((a) => a.no);
}

// ── 採決結果 ─────────────────────────────────────────────
function normResult(r) {
  if (/不採択/.test(r)) return "不採択";
  if (/採択/.test(r)) return "採択";
  if (/否決/.test(r)) return "否決";
  if (/不認定/.test(r)) return "不認定";
  if (/認定/.test(r)) return "認定";
  if (/不同意/.test(r)) return "不同意";
  if (/同意/.test(r)) return "同意";
  if (/不承認/.test(r)) return "不承認";
  if (/承認/.test(r)) return "承認";
  if (/修正可決/.test(r)) return "修正可決";
  if (/可決/.test(r)) return "原案可決";
  if (/適任/.test(r)) return "適任";
  if (/継続審査|継続調査/.test(r)) return "継続審査";
  if (/当選/.test(r)) return "当選";
  if (/選任/.test(r)) return "選任";
  if (/原案のとおり/.test(r)) return "原案可決"; // 「委員長報告のとおり、原案のとおり決しました」
  return null;
}
const METHOD = [[/起立全員|全員起立/, "起立全員"], [/起立多数/, "起立多数"], [/起立少数/, "起立少数"], [/異議なし|異議がない/, "異議なし"]];
// 議長発言中の「よって、〈案件〉は、〈結果〉と決しました」を全件拾う。案件が「本案」等なら直前の文脈の議案を使う。
function votesIn(text, ctxBills) {
  const out = [];
  const t = squash(text);
  // 2つ目の選択肢は選挙（「よって、議長に14番、X君が当選されました」）。番号を言わないので日程の選第を使う。
  // 「ご異議なしと認め、名簿表のとおり選任することに決しました」のように「よって」が無い言い方もある
  const re = /(?:よって|と認め(?:ます)?)[、。]?(?:(?:(.{1,600}?)(?:については|につきましては|は)、?)?(.{1,60}?)(?:と|に)?(?:決しました|決定(?:いたし|し)ました)|(.{1,120}?)当選されました)/g;
  let m, last = 0;
  while ((m = re.exec(t))) {
    const elect = m[3] != null;
    const subj = (elect ? m[3] : m[1]) || "";
    let result = elect ? "当選" : normResult(m[2]);
    if (!elect && /撤回/.test(subj) && /許可/.test(m[2])) result = "撤回";
    else if (result === "原案可決" && /修正議決/.test(subj)) result = "修正可決";
    if (!result) { last = re.lastIndex; continue; }
    let bills = elect ? [] : expandBills(subj);
    if (!bills.length && /本案|本件|本請願|本決議|本意見書|各案|以上|本議案|本陳情/.test(subj)) bills = ctxBills;
    if (!bills.length && (result === "当選" || result === "選任")) bills = ctxBills.filter((b) => /^選第/.test(b));
    if (!bills.length) { last = re.lastIndex; continue; }
    const before = t.slice(last, m.index + m[0].length);
    const method = (METHOD.find(([r]) => r.test(before)) || [])[1] || null;
    out.push({ bills, result, method, basis: /委員長報告のとおり/.test(m[2] || "") ? "委員長報告のとおり" : null });
    last = re.lastIndex;
  }
  return out;
}

// ── 一般質問の補助 ───────────────────────────────────────
function styleOf(text) {
  const t = squash(text);
  if (/一問一答/.test(t)) return "一問一答";
  if (/分割(方式|質問|で)/.test(t)) return "分割";
  if (/一括(方式|質問|で)/.test(t)) return "一括";
  return null;
}
// 新しい問いに入ったか（一問一答で「次に、２問目」など）。最初の質問は常に新規。
const NEWQ = /([0-9０-９一二三四五六七八九]+)(問目|つ目の質問|番目の質問|点目の質問)|次の質問|大きな.{0,3}([0-9０-９一二三四五]+)(問目|点目)|次に.{0,15}について.{0,10}(質問|伺)/;
// 答弁冒頭の「ただいま、〇〇についてご質問を頂きました」から質問項目を取る。
const TOPIC = /^(?:[^。]{0,40}?(?:ただいま|今|まず|先ほど)[、,]?)?(?:[^。]{0,20}?議員(?:さん)?(?:の方|のほう)?から[、,]?)?(.{2,60}?)(?:について|に関して|につきまして|の件で|のことで)[、,]?(?:の)?(?:ご質問|ご質疑|お尋ね|質問|ご提言|ご提案)/;
function topicOf(answer) {
  const head = squash(answer).slice(0, 160).replace(/^(おはようございます|こんにちは|こんばんは|改めまして)[。、]?/g, "");
  const m = head.match(TOPIC);
  if (!m) return null;
  let t = m[1].replace(/^(まず|最初に|それでは|では|はい|続きまして|次に)[、,]?/, "").replace(/^[、,「]+|[」、,]+$/g, "");
  t = t.replace(/^.*?(?:から|より)[、,]/, ""); // 「谷口議員から、」等の残り
  t = t.split("。").pop().replace(/^(ただいまは?|今|現在|まず|本日は?)[、,]?/, ""); // 挨拶・前置きの文を落とす
  t = t.replace(/^.*?議員(?:さん)?(?:より|から)[、,]?/, "").replace(/^は[、,]?/, ""); // 「後藤議員より」「（まず）は、」
  if (t.length < 2 || /^(その|この|今の|ただいまの|先ほどの)/.test(t) || /再質問|再々質問/.test(t)) return null;
  return t.slice(0, 50);
}

// ── 議長発言の読み取り ───────────────────────────────────
// 場面切替の決まり文句（出現位置順に適用し、最後のものが有効）
const PHRASES = [
  [/(?<!あわせて、?|から)日程第[0-9０-９]+/g, "agenda"], // 「あわせて、日程第30…」「日程第3から日程第29まで」の後側は同じ場面の続き
  [/一般質問を(行います|許可|続行|続け)|順次発言を許可|一般質問に入ります/g, "ippan"],
  [/委員長報告に対する質疑/g, "reportqa"],
  [/質疑に入ります|質疑を行います|質疑は(ございませんか|ありませんか)|質疑ございませんか|ほかに質疑/g, "shitsugi"],
  [/(審査|調査)(の)?(結果|経過)(の)?報告を求めます|委員長(より|から)?(の)?報告を求めます|諸般の報告を行います/g, "report"],
  [/討論に入ります|討論を行います|討論は(ございませんか|ありませんか)|討論ございませんか|ほかに討論/g, "debate"],
  [/提案理由の説明を求めます|提案説明を求めます|趣旨説明を求めます|提案要旨の説明を求めます/g, "proposal"],
  [/質疑を打ち?切|質疑を終わります|質疑を終結|討論を終わります|討論を終結|一般質問は(全て|すべて)?終了|これより採決|採決いたします|散会|閉会|休会|委員会に付託|付託いたします/g, "end"],
  // 発言の訂正など、場面の途中に挟まる発言。次の議長発言で元の場面に戻す
  [/発言を求められて/g, "aside"],
];
// 末尾の指名「〈委員会〉委員長 N番、X君。」「N番、X君。」
const CALL = /(?:([^\s、。]{1,20}?)委員長[、,]?)?([0-9０-９]{1,2})番[、,]?([^、。0-9０-９]{1,10}?)君。?$/;

// 指名の前置き「予算特別委員会委員長」「産業建設常任委員長職務代理副委員長」「第４回定例会厚生常任委員長」→ 正式な委員会名
function normCommittee(x) {
  if (!x) return null;
  const c = x.replace(/^.*?(定例会議?|臨時会議?)/, "").replace(/^.*?(次に|続いて|まず)[、,]?/, "")
    .replace(/(委員長)?(職務代理)?副?$/, "").replace(/委員会$/, "");
  return c ? c + "委員会" : null;
}

const SCENE_KIND = { ippan: "ippan", shitsugi: "shitsugi", reportqa: "shitsugi", report: "report", debate: "debate", proposal: "proposal" };

export function parseDay(speeches, { date = null, pdf = null, agenda = [] } = {}) {
  const segs = [];
  let scene = null, cur = null, call = null, ctxBills = [], qn = 0, aside = undefined;

  const close = () => {
    if (cur && cur.turns.length) segs.push(cur);
    cur = null;
  };
  const open = (kind, sp) => {
    close();
    qn = 0;
    cur = { kind, date, pdf, member: sp.name, seat: isSeat(sp.role) ? toHalf(sp.role) : null, role: isSeat(sp.role) ? null : sp.role, fromI: sp.i, from: sp.sid, to: sp.sid, turns: [], _texts: [] };
    if (kind === "report" && call && call.committee) cur.committee = call.committee;
    if (scene === "reportqa") cur.target = "委員長報告";
    if (kind === "proposal" || kind === "report") cur.ctx = ctxBills;
  };
  const push = (sp, t) => {
    cur.turns.push([sp.i - cur.fromI, t, ...(cur.kind === "ippan" || cur.kind === "shitsugi" ? [qn] : [])]);
    cur.to = sp.sid;
    cur._texts.push({ t, text: sp.text, role: sp.role });
  };

  for (const sp of speeches) {
    if (!sp.text) continue;
    if (isChair(sp.role)) {
      const t = squash(sp.text);
      // 訂正が続けて複数人（議長が氏名だけ呼ぶ）なら挟まりを継続
      if (aside !== undefined && !/^[^。]{1,12}君。$/.test(t)) { scene = aside; aside = undefined; }
      // 採決結果（同じ発言内の文脈議案を先に更新）
      const hits = [];
      for (const [re, act] of PHRASES) for (const m of t.matchAll(re)) hits.push([m.index, act]);
      hits.sort((a, b) => a[0] - b[0]);
      for (const v of votesIn(sp.text, ctxBills)) segs.push({ kind: "vote", date, pdf, sid: sp.sid, ...v });
      // 文脈議案：日程・採決の対象として読み上げられた議案
      let k = -1;
      for (const x of t.matchAll(/(?<!あわせて、?|から)日程第/g)) k = x.index;
      const b = expandBills(k >= 0 ? t.slice(k) : t);
      if (b.length && /日程第|議題|採決|付託|提案理由/.test(t)) ctxBills = b;
      for (const [, act] of hits) {
        if (act === "aside") { close(); aside = scene; scene = null; }
        else if (act === "agenda" || act === "end") { close(); scene = null; aside = undefined; }
        else { if (act !== scene) close(); scene = act; }
      }
      const c = t.match(CALL);
      // 委員会名：指名の直前「総務常任委員長 12番、X君」か、「決算特別委員長より審査結果の報告を求めます」
      const cm = c && c[1] ? c[1] : (t.match(/([一-龥々]{2,14})委員長(?:より|から|の)/) || [])[1];
      call = c ? { seat: toHalf(c[2]) + "番", name: c[3], committee: normCommittee(cm) } : null;
      continue;
    }
    if (!scene) continue;
    const kind = SCENE_KIND[scene];
    if (isSeat(sp.role)) {
      const same = cur && cur.kind === kind && cur.member === sp.name;
      const called = call && call.name.replace(/[\s　]/g, "") === sp.name;
      if (!same || (called && kind !== "ippan" && kind !== "shitsugi")) open(kind, sp);
      if (kind === "ippan" || kind === "shitsugi") {
        const first = cur.turns.every(([, x]) => x !== "q" && x !== "rq");
        const t = squash(sp.text);
        if (first) { qn = 1; push(sp, "q"); }
        else if (/再々質問|再質問/.test(t.slice(0, 80))) push(sp, "rq");
        else if (NEWQ.test(t.slice(0, 200))) { qn++; push(sp, "q"); }
        else push(sp, "rq");
      } else push(sp, "s");
    } else if (sp.role) {
      // 当局（町長・課長など）
      if (cur && (cur.kind === "ippan" || cur.kind === "shitsugi")) push(sp, "a");
      else if (kind === "proposal") { if (!cur || cur.kind !== "proposal" || cur.member !== sp.name) open("proposal", sp); push(sp, "s"); }
    }
    call = null;
  }
  close();

  // 仕上げ：場面ごとの属性（質問方式・質問項目・対象議案・賛否）
  for (const s of segs) {
    if (s.kind === "vote") continue;
    const own = s._texts.filter((x) => x.t === "q" || x.t === "rq" || x.t === "s");
    const ownText = own.map((x) => x.text).join("");
    if (s.kind === "ippan") {
      s.style = styleOf(own.slice(0, 2).map((x) => x.text).join(""));
      const topics = [];
      for (let k = 0; k < s._texts.length; k++) {
        if (s._texts[k].t !== "q") continue;
        const ans = s._texts.slice(k + 1).find((x) => x.t === "a");
        const tp = ans && topicOf(ans.text);
        if (tp && !topics.some((x) => x.title === tp)) topics.push({ n: s.turns[k][2], title: tp, src: "minutes" });
      }
      s.topics = topics;
    }
    if (s.kind === "shitsugi") {
      const keys = new Set(agenda.map((a) => a.no));
      const inAgenda = (bs) => (keys.size ? bs.filter((b) => keys.has(b)) : bs);
      s.bills = inAgenda(expandBills(own.filter((x) => x.t === "q").map((x) => x.text).join("")));
      if (!s.bills.length) s.bills = inAgenda(expandBills(s._texts.filter((x) => x.t === "a").map((x) => x.text).join("")));
    }
    if (s.kind === "report") {
      s.bills = expandBills(ownText);
      if (!s.committee) { const m = squash(ownText).slice(0, 160).match(/([一-龥々]{1,12}(?:常任|特別)委員会|議会運営委員会)/); if (m) s.committee = normCommittee(m[1]); }
    }
    if (s.kind === "debate") {
      // 本人の立場表明（「賛成の立場で討論」「反対討論を行います」）を優先。「反対討論がございましたので」は他人の討論なので除外。
      const head = squash(ownText).slice(0, 400);
      const own = head.match(/(賛成|反対)(?:の立場|する立場|の討論|討論)(?:で|から|として|を(?:行|いた|させ|申し))/);
      const loose = head.match(/(賛成|反対)(?:の立場|する立場|討論|します|いたします)(?!が)/);
      s.stance = (own || loose || [])[1] || null;
      s.bills = [...new Set([...expandBills(ownText), ...billsByTitle(ownText, agenda)])];
    }
    if (s.kind === "proposal") s.bills = s.ctx && s.ctx.length ? s.ctx : expandBills(ownText.slice(0, 400));
    delete s._texts; delete s.fromI; delete s.ctx;
    if (s.kind !== "proposal") delete s.role;
  }
  return segs;
}
