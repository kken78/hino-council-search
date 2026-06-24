import { useEffect, useMemo, useRef, useState } from "react";
import { search, hitRanges, roleCat } from "./search.js";
import { yearToEra } from "../scripts/lib/eras.mjs";
import topics from "../dict/topics.json" with { type: "json" };

const BASE = import.meta.env.BASE_URL || "/";
const DASHBOARD_URL = "https://kken78.github.io/council-dashboard/"; // 議会だよりダッシュボード（疎結合・任意）
const PAGE = 20;
const j = (path) => fetch(`${BASE}${path}`).then((r) => (r.ok ? r.json() : null));

// よく検索される語（実データに合わせて更新可）
const FREQ = ["補正予算", "一般質問", "入札", "介護", "子育て", "給食", "道路", "通年議会"];
const TABS = [["search", "発言を検索"], ["gian", "議案・一般質問"], ["toc", "会議録一覧（目次）"]];
const RB = { 議員: ["rb-giin", "r-giin"], 当局: ["rb-tou", "r-tou"], 議長: ["rb-gicho", "r-gicho"] };

function buildSpeakers(index) {
  const mem = new Map(), off = new Map();
  for (const e of index) {
    const nm = e.name || "";
    if (!nm || nm[0] === "（") continue;
    if (/^[0-9０-９]+番$/.test(e.role || "")) { if (!mem.has(nm)) mem.set(nm, e.role); }
    else if (e.role) { if (!off.has(e.role)) off.set(e.role, nm); }
  }
  const num = (s) => parseInt(String(s).replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d)), 10) || 999;
  const members = [...mem].map(([name, role]) => ({ value: name, group: "議員", hint: role })).sort((a, b) => num(a.hint) - num(b.hint));
  const officials = [...off].map(([role, name]) => ({ value: role, group: "当局・議長", hint: name })).sort((a, b) => a.value.localeCompare(b.value, "ja"));
  return [...members, ...officials];
}

function Highlighted({ text, ranges }) {
  if (!ranges || !ranges.length) return <span>{text}</span>;
  const parts = []; let cur = 0;
  ranges.forEach(([s, e], i) => { if (s > cur) parts.push(<span key={`a${i}`}>{text.slice(cur, s)}</span>); parts.push(<mark key={`m${i}`}>{text.slice(s, e)}</mark>); cur = e; });
  parts.push(<span key="z">{text.slice(cur)}</span>);
  return <>{parts}</>;
}
function Snippet({ text, ranges }) {
  if (!ranges || !ranges.length) { const t = text.length > 200 ? text.slice(0, 200) + "…" : text; return <span>{t}</span>; }
  const first = ranges[0][0];
  const a = Math.max(0, first - 60), b = Math.min(text.length, ranges[ranges.length - 1][1] + 170);
  const parts = []; let cur = a;
  if (a > 0) parts.push(<span key="l">…</span>);
  for (const [s, e] of ranges) { if (e <= a || s >= b) continue; if (s > cur) parts.push(<span key={`t${cur}`}>{text.slice(cur, s)}</span>); parts.push(<mark key={`m${s}`}>{text.slice(Math.max(s, a), Math.min(e, b))}</mark>); cur = e; }
  if (cur < b) parts.push(<span key="e">{text.slice(cur, b)}</span>);
  if (b < text.length) parts.push(<span key="tr">…</span>);
  return <>{parts}</>;
}

function useQueryState() {
  const [params, setParams] = useState(() => new URLSearchParams(location.search));
  const update = (obj) => {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(obj)) { if (v) p.set(k, v); else p.delete(k); }
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
    setParams(new URLSearchParams(p));
  };
  return [params, update];
}
const EMPTY = { year: "", type: "", speaker: "", meeting: "", role: "" };

export default function App() {
  const [data, setData] = useState({ index: null, meetings: null, gian: null, toc: null });
  const [params, update] = useQueryState();
  const [q, setQ] = useState(params.get("q") || "");
  const [filters, setFilters] = useState({ ...EMPTY, ...Object.fromEntries([...params].filter(([k]) => k in EMPTY)) });
  const [sort, setSort] = useState("date");
  const [tab, setTab] = useState("search");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const [showTop, setShowTop] = useState(false);
  const tabRefs = useRef({});

  useEffect(() => {
    Promise.all([j("data/index.json"), j("data/meetings.json"), j("data/gian.json"), j("data/toc.json")]).then(
      ([index, meetings, gian, toc]) => setData({ index: index || [], meetings: meetings || [], gian: gian || {}, toc: toc || [] }));
  }, []);
  useEffect(() => { const h = () => setShowTop(window.scrollY > 400); window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h); }, []);
  useEffect(() => { setPage(0); setExpanded(new Set()); }, [q, filters, sort]);

  const active = !!(q.trim() || filters.speaker || filters.year || filters.type || filters.meeting || filters.role);
  const result = useMemo(() => {
    if (!data.index || !active) return null;
    const r = search(data.index, q, filters);
    const sorted = [...r.results].sort((a, b) => sort === "relevance"
      ? b._score - a._score || (b.date || "").localeCompare(a.date || "")
      : (b.date || "").localeCompare(a.date || "") || b._score - a._score);
    return { ...r, results: sorted };
  }, [data.index, q, filters, sort, active]);

  const speakers = useMemo(() => (data.index ? buildSpeakers(data.index) : []), [data.index]);
  const ixMeetings = useMemo(() => (data.toc || []).filter((t) => t.indexed), [data.toc]);
  const meetingName = useMemo(() => (data.toc || []).find((t) => t.id === filters.meeting)?.name, [data.toc, filters.meeting]);

  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const pickQuery = (v) => { setQ(v); update({ q: v }); };
  const searchMeeting = (id) => { setQ(""); setFilters({ ...EMPTY, meeting: id }); setTab("search"); };
  const resetAll = () => { setQ(""); setFilters({ ...EMPTY }); setSort("date"); update({}); };
  const toggleCard = (sid) => setExpanded((s) => { const n = new Set(s); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const onTabKey = (e) => {
    const i = TABS.findIndex(([id]) => id === tab); let ni = null;
    if (e.key === "ArrowRight") ni = (i + 1) % TABS.length; else if (e.key === "ArrowLeft") ni = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") ni = 0; else if (e.key === "End") ni = TABS.length - 1;
    if (ni !== null) { e.preventDefault(); const id = TABS[ni][0]; setTab(id); tabRefs.current[id]?.focus(); }
  };

  if (!data.index) return <div className="wrap"><div className="loading" role="status">索引を読み込み中…</div></div>;

  const ixCount = ixMeetings.length;
  const paged = result ? result.results.slice(page * PAGE, (page + 1) * PAGE) : [];
  const pages = result ? Math.ceil(result.results.length / PAGE) : 0;
  const Pager = () => pages <= 1 ? null : (
    <nav className="pager" aria-label="検索結果のページ送り">
      <button disabled={page <= 0} onClick={() => { setPage(page - 1); toTop(); }}>← 前へ</button>
      <span aria-live="polite">{page * PAGE + 1}–{Math.min(result.results.length, (page + 1) * PAGE)} / {result.results.length}件（{page + 1}/{pages}）</span>
      <button disabled={page >= pages - 1} onClick={() => { setPage(page + 1); toTop(); }}>次へ →</button>
    </nav>
  );

  return (
    <div className="wrap">
      <a href="#main" className="skip-link">本文へスキップ</a>
      <header className="mast">
        <div className="mast-inner">
          <p className="eyebrow">滋賀県日野町議会　会議録アーカイブ</p>
          <h1 className="mast-title mincho">会議録 横断検索</h1>
          <p className="mast-sub">本会議の発言を、キーワード・発言者・会議から横断的にさがす。出典：
            <a href="https://www.town.shiga-hino.lg.jp/category/32-3-6-0-0-0-0-0-0-0.html" target="_blank" rel="noreferrer">日野町「会議録」</a></p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="表示の切替" onKeyDown={onTabKey}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1} ref={(el) => (tabRefs.current[id] = el)}
            className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <main id="main">
        {tab === "search" && (
          <div role="tabpanel" id="panel-search" aria-labelledby="tab-search">
            <div className="searchwrap">
              <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); update({ q, ...filters }); }}>
                <label htmlFor="q" className="sr-only">キーワード検索</label>
                <input id="q" type="search" value={q} autoComplete="off"
                  placeholder="例：補正予算　介護　給食　道路　入札"
                  onChange={(e) => setQ(e.target.value)} />
                <button type="submit">検索</button>
              </form>
              <div className="freq">
                <span className="freq-label">よく検索される語：</span>
                {FREQ.map((t) => <button key={t} className="freqchip" onClick={() => pickQuery(t)}>{t}</button>)}
              </div>
              <p className="hint">スペースで区切ると<b>すべて含む</b>（AND）。<b>OR</b>＝いずれか・先頭<b>「-」</b>＝除外。発言本文・発言者・議案番号をまとめて検索し、元号⇔西暦・難読地名のよみ・異体字も自動対応します。</p>

              <div className="filters" aria-label="絞り込み">
                <label className="fcol">会議
                  <select value={filters.meeting} onChange={(e) => setF({ meeting: e.target.value })}>
                    <option value="">すべての会議</option>
                    {ixMeetings.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="fcol">発言者
                  <input type="text" list="spkList" value={filters.speaker} placeholder="氏名・役職"
                    onChange={(e) => setF({ speaker: e.target.value })} />
                  <datalist id="spkList">{speakers.map((s) => <option key={s.group + s.value} value={s.value}>{`${s.group}・${s.hint}`}</option>)}</datalist>
                </label>
                <label className="fcol">区分
                  <select value={filters.role} onChange={(e) => setF({ role: e.target.value })}>
                    <option value="">議員・当局すべて</option><option value="議員">議員</option><option value="当局">当局（執行部）</option><option value="議長">議長</option>
                  </select>
                </label>
                <label className="fcol">種別
                  <select value={filters.type} onChange={(e) => setF({ type: e.target.value })}>
                    <option value="">すべて</option><option value="定例会">定例会</option><option value="臨時会">臨時会</option>
                  </select>
                </label>
                <label className="fcol">並び
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="date">新しい会議順</option><option value="relevance">関連度</option>
                  </select>
                </label>
              </div>
            </div>

            {filters.meeting && (
              <div className="mbanner">この会議録のみ：<b>{meetingName || filters.meeting}</b>
                <button className="chip" onClick={() => setF({ meeting: "" })}>×全会議に戻す</button></div>
            )}

            {!active ? (
              <div className="empty-guide">
                <b>キーワードを入力</b>するか、上の「よく検索される語」・絞り込みで探せます。<br />
                収録：全文検索 {data.index.length} 発言／{ixCount} 会議　｜　目次カタログ {(data.toc || []).length} 会議
              </div>
            ) : (
              <>
                <div className="resmeta">
                  <div className="count" role="status" aria-live="polite">
                    <b>{result.results.length}</b> 件
                    <span className="small">（会議録 {result.meetingCount} 件{q.trim() ? `／ヒット ${result.hitCount}` : ""}）</span>
                  </div>
                  <button className="clearbtn" onClick={resetAll}>× 条件をクリア</button>
                </div>
                {result.results.length === 0 && <div className="empty">該当する発言がありません。条件を変えてお試しください。</div>}
                <ul className="resultlist">
                  {paged.map((e) => {
                    const ranges = q.trim() ? hitRanges(e, result.posAlts) : [];
                    const open = expanded.has(e.sid);
                    const cat = roleCat(e);
                    const [bcls, ccls] = RB[cat] || ["", ""];
                    return (
                      <li className={"card " + ccls} key={e.sid}>
                        <div className="card-top">
                          <div>
                            <button className="who" onClick={() => setF({ speaker: e.name })} title={`「${e.name}」で絞り込む`}>{e.name}</button>
                            {cat && <span className={"rolebadge " + bcls}>{cat}</span>}
                            {e.role && roleCat(e) !== "議員" && <span className="rolename">{e.role}</span>}
                            {e.role && roleCat(e) === "議員" && <span className="rolename">{e.role}</span>}
                          </div>
                          {e.agendaRef && <span className="badge">{e.agendaRef}</span>}
                        </div>
                        <p className="meta">{e.meeting}<span className="sep">|</span>{e.date || ""}<span className="sep">|</span>{e.type}</p>
                        <div className="body" id={`b-${e.sid}`}>{open ? <Highlighted text={e.text} ranges={ranges} /> : <Snippet text={e.text} ranges={ranges} />}</div>
                        <div className="card-actions">
                          <button className="more" aria-expanded={open} aria-controls={`b-${e.sid}`} onClick={() => toggleCard(e.sid)}>{open ? "閉じる" : "全文を表示"}</button>
                          {e.pdf && <a className="pdflink" href={e.pdf} target="_blank" rel="noreferrer">会議録PDFを開く</a>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Pager />
              </>
            )}
          </div>
        )}

        {tab === "gian" && (
          <div role="tabpanel" id="panel-gian" aria-labelledby="tab-gian">
            <GianView meetings={data.meetings} gian={data.gian} onSpeaker={(name) => { setTab("search"); setQ(""); setF({ speaker: name }); }} />
          </div>
        )}
        {tab === "toc" && (
          <div role="tabpanel" id="panel-toc" aria-labelledby="tab-toc">
            <TocView toc={data.toc} onSearchMeeting={searchMeeting} />
          </div>
        )}
      </main>

      <footer>本システムの検索結果は機械処理によるもので、原本と差異が生じ得ます。正確な内容は各PDF（原本）でご確認ください。<br />
        議事録検索は単体で動作します（議会だよりダッシュボードとは疎結合で連携可）。</footer>
      {showTop && <button id="toTop" type="button" aria-label="ページ先頭へ戻る" onClick={toTop}>↑</button>}
    </div>
  );
}

function TocView({ toc, onSearchMeeting }) {
  if (!toc?.length) return <div className="empty">目次データがありません。</div>;
  const byYear = {};
  for (const t of toc) (byYear[t.year] || (byYear[t.year] = [])).push(t);
  const yrs = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  return (
    <div className="toc">
      {yrs.map((y) => (
        <section key={y} aria-label={y ? `${y}年` : "年不明"}>
          <h3 className="mincho">{y ? `${y}年（${yearToEra(y)}）` : "年不明"} <span className="small">{byYear[y].length}会議</span></h3>
          {byYear[y].sort((a, b) => b.id.localeCompare(a.id)).map((t) => (
            <div className="mrow" key={t.id}>
              <span className="mname">{t.name}</span><span className="tag">{t.type}</span>
              {t.indexed ? <button className="srch" onClick={() => onSearchMeeting(t.id)}>この会議録を検索</button> : <span className="small">（本文未収録）</span>}
              <a className="small" href={t.url} target="_blank" rel="noreferrer">会議ページ↗</a>
              {t.indexed && t.pdfs?.some((p) => p.date) && (
                <div className="small" style={{ flexBasis: "100%" }}>
                  {t.pdfs.filter((p) => p.date).map((p) => <a key={p.url} className="daylink" href={p.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{p.label}</a>)}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function GianView({ meetings, gian, onSpeaker }) {
  const ms = (meetings || []).filter((m) => gian[m.id] && (gian[m.id].agenda.length || gian[m.id].ippan.length));
  if (!ms.length) return <div className="empty">議案データがありません。</div>;
  return (
    <div className="gian">
      {ms.map((m) => {
        const g = gian[m.id];
        return (
          <section className="gcard" key={m.id} aria-label={m.name}>
            <h3 className="mincho">{m.name} <span className="tag">{m.type}</span> <span className="small">{m.era || m.year}</span></h3>
            <div className="gsec">議案（{g.agenda.length}件）</div>
            {g.agenda.length > 0 ? (
              <table>
                <caption className="sr-only">{m.name} の議案一覧</caption>
                <thead><tr><th scope="col" style={{ width: 90 }}>議案番号</th><th scope="col" style={{ width: 70 }}>区分</th><th scope="col">件名</th></tr></thead>
                <tbody>{g.agenda.map((a) => <tr key={a.no}><td>{a.no}</td><td><span className="tag kindtag">{a.kind}</span></td><td>{a.title}</td></tr>)}</tbody>
              </table>
            ) : <div className="empty">議案の抽出はありません。</div>}
            {g.ippan?.length > 0 && (
              <>
                <div className="gsec">一般質問（{g.ippan.length}名）</div>
                <div className="ippanbox"><span className="small">質問者をクリックすると、その議員の発言を検索します</span>
                  <div style={{ marginTop: 4 }}>{g.ippan.map((ip, i) => <button key={ip.member + i} className="chip" onClick={() => onSpeaker(ip.member)}>{ip.member}</button>)}</div>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
