// Franklin.bet — static front-end.
// World Cup match predictions (primary) + other markets, rendered from a JSON
// file the council produced. Consensus is computed in the browser. No backend,
// no user data. Language is user-toggleable (EN / 中文).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = (n) => String(n).padStart(2, "0");

const STATE = { events: [], models: [], modelById: {}, preds: {}, filter: "All", lang: "en" };

// --- i18n (4 languages) ----------------------------------------------------
// Dynamic labels live here; static markup carries data-en/data-es/data-zh/data-ja.
const LANGS = [{ code: "en", label: "EN" }, { code: "es", label: "ES" }, { code: "zh", label: "中" }, { code: "ja", label: "日" }];
const LOCALE = { en: "en-US", es: "es-ES", zh: "zh-CN", ja: "ja-JP" };
const I18N = {
  all: { en: "All", es: "Todos", zh: "全部", ja: "すべて" },
  councilPick: { en: "Council pick", es: "Pronóstico IA", zh: "AI 共识", ja: "AI 予想" },
  agree: { en: "agree", es: "de acuerdo", zh: "一致", ja: "一致" },
  pending: { en: "Predictions pending", es: "Pronósticos pendientes", zh: "预测生成中", ja: "予測生成中" },
  resolves: { en: "Resolves", es: "Se resuelve", zh: "揭晓", ja: "判明" },
  camps: { en: "camps", es: "posturas", zh: "种观点", ja: "陣営" },
  fullAgreement: { en: "full agreement", es: "acuerdo total", zh: "完全一致", ja: "全員一致" },
  kicksOffIn: { en: "Kicks off in", es: "Comienza en", zh: "距开球", ja: "キックオフまで" },
  kickedOff: { en: "Kicked off", es: "Ya comenzó", zh: "已开球", ja: "開始済み" },
  abstained: { en: "abstained", es: "se abstuvo", zh: "弃权", ja: "棄権" },
  noAnswer: { en: "No clean structured answer after retries.", es: "Sin respuesta estructurada tras varios intentos.", zh: "多次重试仍未给出规范答案。", ja: "再試行しても整形された回答が得られませんでした。" },
  consensusTag: { en: "consensus", es: "consenso", zh: "共识", ja: "コンセンサス" },
  soloTag: { en: "solo call", es: "voto solitario", zh: "独家", ja: "単独予想" },
  confident: { en: "confident", es: "de confianza", zh: "信心", ja: "確信" },
  researchAnalysis: { en: "Research & analysis", es: "Investigación y análisis", zh: "调研与分析", ja: "調査と分析" },
  fullAnalysis: { en: "Full analysis", es: "Análisis completo", zh: "完整分析", ja: "詳細分析" },
  howResearched: { en: "How it researched", es: "Cómo investigó", zh: "调研过程", ja: "調査の流れ" },
  toolCalls: { en: "tool calls", es: "llamadas a herramientas", zh: "次工具调用", ja: "回のツール呼び出し" },
  kicksOff: { en: "kicks off", es: "comienza", zh: "开球", ja: "開始" },
  avgConf: { en: "Avg confidence", es: "Confianza media", zh: "平均信心", ja: "平均確信度" },
  withConsensus: { en: "With consensus", es: "Con el consenso", zh: "跟随共识", ja: "コンセンサス一致" },
  upsetHunter: { en: "🔥 Upset-hunter", es: "🔥 Cazasorpresas", zh: "🔥 爆冷猎手", ja: "🔥 番狂わせ狙い" },
  independent: { en: "Independent", es: "Independiente", zh: "独立判断", ja: "独立判断" },
  chalkEater: { en: "🤝 Chalk-eater", es: "🤝 Pro-favoritos", zh: "🤝 追热门", ja: "🤝 本命派" },
  favBacker: { en: "Favourite-backer", es: "Pro-favorito", zh: "押热门", ja: "本命党" },
  soloCalls: { en: "solo calls", es: "votos solitarios", zh: "次独家", ja: "件の単独予想" },
  marketLabel: { en: "Market", es: "Mercado", zh: "市场", ja: "マーケット" },
  toWin: { en: "to win", es: "gana", zh: "胜", ja: "勝利" },
  drawPick: { en: "Draw", es: "Empate", zh: "平局", ja: "引き分け" },
  noPreds: { en: "No predictions generated yet for this match.", es: "Aún no hay pronósticos para este partido.", zh: "这场比赛还没有生成预测。", ja: "この試合の予測はまだありません。" },
};
const t = (k) => (I18N[k] ? (I18N[k][STATE.lang] ?? I18N[k].en) : k);

// Group / round labels per language.
const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Third place", "Final"];
const ROUND_I18N = {
  "Round of 32": { es: "Dieciseisavos", zh: "32 强", ja: "ベスト32" },
  "Round of 16": { es: "Octavos", zh: "16 强", ja: "ベスト16" },
  "Quarter-finals": { es: "Cuartos", zh: "1/4 决赛", ja: "準々決勝" },
  "Semi-finals": { es: "Semifinales", zh: "半决赛", ja: "準決勝" },
  "Third place": { es: "Tercer puesto", zh: "季军赛", ja: "3位決定戦" },
  "Final": { es: "Final", zh: "决赛", ja: "決勝" },
};
const GROUP_WORD = { en: "Group", es: "Grupo", zh: "组", ja: "グループ" };
function catLabel(cat) {
  const g = cat.match(/^Group ([A-L])$/);
  if (g) return STATE.lang === "zh" ? `${g[1]} 组` : STATE.lang === "ja" ? `グループ${g[1]}` : `${GROUP_WORD[STATE.lang]} ${g[1]}`;
  if (STATE.lang === "en") return cat;
  return ROUND_I18N[cat]?.[STATE.lang] || cat;
}
const titleOf = (ev) => ev[`title_${STATE.lang}`] || (STATE.lang === "zh" && ev.title_zh ? ev.title_zh : ev.title);

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

const isMatch = (ev) => !!(ev && ev.home && ev.away);

// --- Consensus math -------------------------------------------------------
function consensusFor(eventId) {
  const votes = STATE.preds.byEvent?.[eventId] || [];
  if (!votes.length) return null;
  const tally = {};
  for (const v of votes) {
    if (!tally[v.pick]) tally[v.pick] = { pick: v.pick, count: 0, weight: 0 };
    tally[v.pick].count += 1;
    tally[v.pick].weight += v.confidence || 0;
  }
  const ranked = Object.values(tally).sort((a, b) => b.weight - a.weight || b.count - a.count);
  const total = votes.length;
  return {
    leaderPick: ranked[0].pick, agreeCount: ranked[0].count, total,
    agreeShare: ranked[0].count / total, distinctPicks: ranked.length,
    soloPicks: new Set(ranked.filter((r) => r.count === 1).map((r) => r.pick)), votes,
  };
}

function bucketOf(ev, pick) {
  const p = String(pick || "");
  if (p === ev.home || (ev.home && p.includes(ev.home))) return "home";
  if (p === ev.away || (ev.away && p.includes(ev.away))) return "away";
  return "draw";
}

function matchBuckets(ev, votes) {
  const acc = { home: { count: 0, weight: 0 }, draw: { count: 0, weight: 0 }, away: { count: 0, weight: 0 } };
  for (const v of votes) { const b = bucketOf(ev, v.pick); acc[b].count += 1; acc[b].weight += v.confidence || 0; }
  const totalW = acc.home.weight + acc.draw.weight + acc.away.weight || 1;
  const drawable = ev.unit !== "winner" && ev.stage !== "knockout";
  const order = drawable ? ["home", "draw", "away"] : ["home", "away"];
  return order.map((k) => ({
    key: k, label: k === "home" ? ev.home : k === "away" ? ev.away : t("drawPick"),
    count: acc[k].count, share: acc[k].weight / totalW,
  }));
}

// --- helpers --------------------------------------------------------------
function modelMeta(id) { return STATE.modelById[id] || { name: id, provider: "", color: "#888" }; }

function fmtKick(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(LOCALE[STATE.lang] || "en-US",
    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Live countdown elements: { el, kickoff } — refreshed once per second.
let COUNTDOWNS = [];
const TIME_UNITS = {
  en: { d: "d", h: "h", m: "m", s: "s" }, es: { d: "d", h: "h", m: "m", s: "s" },
  zh: { d: "天", h: "小时", m: "分", s: "秒" }, ja: { d: "日", h: "時間", m: "分", s: "秒" },
};
function countdownText(kickoff) {
  const diff = new Date(kickoff).getTime() - Date.now();
  if (isNaN(diff)) return "";
  if (diff <= 0) return `⚽ ${t("kickedOff")}`;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000),
        m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  const u = TIME_UNITS[STATE.lang] || TIME_UNITS.en;
  const pre = `⏱ ${t("kicksOffIn")} `;
  if (d > 0) return `${pre}${d}${u.d} ${h}${u.h} ${m}${u.m}`;
  if (h > 0) return `${pre}${h}${u.h} ${m}${u.m} ${pad(s)}${u.s}`;
  return `${pre}${m}${u.m} ${pad(s)}${u.s}`;
}
function tickCountdowns() {
  for (const c of COUNTDOWNS) if (c.el.isConnected) c.el.textContent = countdownText(c.kickoff);
}

// --- Rendering ------------------------------------------------------------
function renderHeroStats() {
  const matches = STATE.events.filter(isMatch);
  const others = STATE.events.filter((e) => !isMatch(e));
  const totalVotes = STATE.events.reduce((n, e) => n + (STATE.preds.byEvent?.[e.id]?.length || 0), 0);
  $("#hero-model-count").textContent = STATE.models.length;
  const LABELS = {
    en: ["AI agents", "Matches", "AI bets placed", "Other markets"],
    es: ["Agentes IA", "Partidos", "Apuestas IA", "Otros mercados"],
    zh: ["AI 模型", "场比赛", "次 AI 下注", "其他市场"],
    ja: ["AIエージェント", "試合", "AI予想数", "その他市場"],
  };
  const labels = LABELS[STATE.lang] || LABELS.en;
  const vals = [STATE.models.length, matches.length, totalVotes, others.length];
  const wrap = $("#hero-stats"); wrap.innerHTML = "";
  vals.forEach((v, i) => { const n = el("div", "hero-stat"); n.append(el("div", "v", v), el("div", "l", labels[i])); wrap.append(n); });
}

function sortCategories(cats) {
  const groups = cats.filter((c) => /^Group /.test(c)).sort();
  const rounds = cats.filter((c) => !/^Group /.test(c))
    .sort((a, b) => (ROUND_ORDER.indexOf(a) + 1 || 99) - (ROUND_ORDER.indexOf(b) + 1 || 99));
  return [...groups, ...rounds];
}

function renderFilters() {
  const matchCats = sortCategories(Array.from(new Set(STATE.events.filter(isMatch).map((e) => e.category))));
  const cats = ["All", ...matchCats];
  const row = $("#filter-row"); row.innerHTML = "";
  for (const c of cats) {
    const label = c === "All" ? (STATE.lang === "zh" ? "全部" : "All") : catLabel(c);
    const chip = el("div", "chip" + (c === STATE.filter ? " active" : ""), esc(label));
    chip.onclick = () => { STATE.filter = c; renderFilters(); renderEvents(); };
    row.append(chip);
  }
}

function renderEvents() {
  const grid = $("#events-grid"); grid.innerHTML = "";
  COUNTDOWNS = [];
  const list = STATE.events.filter(isMatch).filter((e) => STATE.filter === "All" || e.category === STATE.filter);
  for (const ev of list) grid.append(matchCard(ev));
  tickCountdowns();
}

function matchCard(ev) {
  const con = consensusFor(ev.id);
  const card = el("div", "event-card match-card");
  card.onclick = () => openModal(ev, con);

  const top = el("div", "ec-top");
  top.append(el("span", "ec-cat", esc(catLabel(ev.category))));
  if (ev.kickoff) { const cd = el("span", "mc-countdown"); COUNTDOWNS.push({ el: cd, kickoff: ev.kickoff }); top.append(cd); }
  card.append(top);

  const teams = el("div", "match-teams");
  const home = el("div", "team");
  home.append(el("span", "flag", esc(ev.homeFlag || "")), el("span", "tname", esc(ev.home)));
  const away = el("div", "team team-away");
  away.append(el("span", "tname", esc(ev.away)), el("span", "flag", esc(ev.awayFlag || "")));
  teams.append(home, el("span", "vs", "vs"), away);
  card.append(teams);

  if (con) {
    const buckets = matchBuckets(ev, con.votes);
    const bar = el("div", "threeway");
    for (const b of buckets) { const seg = el("div", `tw-seg tw-${b.key}`); seg.style.width = `${Math.max(2, Math.round(b.share * 100))}%`; seg.title = `${b.label}: ${Math.round(b.share * 100)}%`; bar.append(seg); }
    card.append(bar);
    const legend = el("div", "threeway-legend");
    legend.innerHTML = buckets.map((b) => `<span class="tw-l tw-l-${b.key}">${esc(b.label)} ${Math.round(b.share * 100)}%</span>`).join("");
    card.append(legend);

    const winTxt = con.leaderPick === t("drawPick") || /draw/i.test(con.leaderPick)
      ? t("drawPick")
      : (STATE.lang === "zh" ? `${con.leaderPick} ${t("toWin")}` : `${con.leaderPick} ${t("toWin")}`);
    const pickLine = el("div", "mc-pick-line");
    pickLine.innerHTML = `<span class="mcp-label">${esc(t("councilPick"))}</span> <b>${esc(winTxt)}</b> · ${con.agreeCount}/${con.total} ${esc(t("agree"))}`;
    card.append(pickLine);

    const foot = el("div", "ec-foot");
    const dots = el("div", "ec-dots");
    for (const v of con.votes) { const d = el("span", "dot"); d.style.background = modelMeta(v.modelId).color; d.title = `${modelMeta(v.modelId).name}: ${v.pick}`; dots.append(d); }
    foot.append(dots);
    if (ev.venue) foot.append(el("div", "ec-venue", esc(ev.venue.split(",")[0])));
    card.append(foot);
  } else {
    card.append(el("div", "mc-pending", t("pending")));
  }
  return card;
}

function renderOthers() {
  const grid = $("#others-grid");
  const others = STATE.events.filter((e) => !isMatch(e));
  $("#markets-section").hidden = others.length === 0;
  grid.innerHTML = "";
  for (const ev of others) grid.append(genericCard(ev));
}

function genericCard(ev) {
  const con = consensusFor(ev.id);
  const card = el("div", "event-card");
  card.onclick = () => openModal(ev, con);
  const top = el("div", "ec-top");
  top.append(el("span", "ec-cat", esc(catLabel(ev.category))), el("span", "ec-emoji", ev.emoji || "🔮"));
  card.append(top);
  card.append(el("h3", "ec-title", esc(titleOf(ev))));
  if (con) {
    card.append(el("div", "ec-consensus-label", t("councilPick")));
    const pick = el("div", "ec-pick");
    pick.append(el("span", "name", esc(con.leaderPick)), el("span", "agree", `${con.agreeCount}/${con.total} ${t("agree")}`));
    card.append(pick);
    const bar = el("div", "agree-bar"); const span = el("span"); span.style.width = `${Math.round(con.agreeShare * 100)}%`; bar.append(span); card.append(bar);
    const foot = el("div", "ec-foot");
    const dots = el("div", "ec-dots");
    for (const v of con.votes) { const d = el("span", "dot"); d.style.background = modelMeta(v.modelId).color; d.title = `${modelMeta(v.modelId).name}: ${v.pick}`; dots.append(d); }
    foot.append(dots);
    foot.append(el("div", "ec-divergence", con.distinctPicks > 1 ? `<b>${con.distinctPicks}</b> ${t("camps")}` : t("fullAgreement")));
    card.append(foot);
  }
  const res = el("div", "ec-resolves", `${esc(t("resolves"))} ${esc(ev.resolves)}`);
  res.style.marginTop = "12px"; card.append(res);
  return card;
}

function renderShowdown() {
  const stats = {};
  for (const m of STATE.models) stats[m.id] = { conf: [], solo: 0, withLeader: 0, n: 0 };
  for (const ev of STATE.events) {
    const con = consensusFor(ev.id); if (!con) continue;
    for (const v of con.votes) {
      const s = stats[v.modelId]; if (!s) continue;
      s.n += 1; s.conf.push(v.confidence || 0);
      if (con.soloPicks.has(v.pick)) s.solo += 1;
      if (v.pick === con.leaderPick) s.withLeader += 1;
    }
  }
  const grid = $("#showdown-grid"); grid.innerHTML = "";
  // Roster order (Western brands first, then the rest) — not sorted by boldness.
  for (const m of STATE.models) {
    const s = stats[m.id];
    const avg = s.conf.length ? s.conf.reduce((x, y) => x + y, 0) / s.conf.length : 0;
    const align = s.n ? Math.round((s.withLeader / s.n) * 100) : 0;
    const card = el("div", "model-card");
    const head = el("div", "mc-head");
    const sw = el("span", "mc-swatch"); sw.style.background = m.color; sw.style.color = m.color; head.append(sw);
    const nm = el("div"); nm.append(el("div", "mc-name", esc(m.name)), el("div", "mc-provider", esc(m.provider))); head.append(nm);
    card.append(head);
    const st = el("div", "mc-stats");
    const a = el("div", "mc-stat"); a.append(el("div", "v", `${Math.round(avg * 100)}%`), el("div", "l", t("avgConf")));
    const b = el("div", "mc-stat"); b.append(el("div", "v", `${align}%`), el("div", "l", t("withConsensus")));
    st.append(a, b); card.append(st);
    let tag = t("favBacker");
    if (s.solo >= 3) tag = `${t("upsetHunter")} · ${s.solo} ${t("soloCalls")}`;
    else if (s.solo > 0) tag = `${t("independent")} · ${s.solo} ${t("soloCalls")}`;
    else if (align >= 90) tag = t("chalkEater");
    card.append(el("span", "mc-tag", tag));
    grid.append(card);
  }
}

// --- Modal ----------------------------------------------------------------
function openModal(ev, con) {
  const body = $("#modal-body"); body.innerHTML = "";
  const match = isMatch(ev);
  body.append(el("div", "m-cat", `${esc(catLabel(ev.category))}${ev.kickoff ? " · " + esc(fmtKick(ev.kickoff)) : ""}`));

  if (match) {
    const header = el("div", "m-match");
    header.innerHTML = `<span class="m-team">${esc(ev.homeFlag || "")} ${esc(ev.home)}</span><span class="m-vs">vs</span><span class="m-team">${esc(ev.away)} ${esc(ev.awayFlag || "")}</span>`;
    body.append(header);
    if (ev.venue) body.append(el("div", "m-title-zh", esc(ev.venue)));
  } else {
    body.append(el("div", "m-title", `${ev.emoji || "🔮"} ${esc(titleOf(ev))}`));
  }
  body.append(el("div", "m-question", esc(ev.question)));

  if (!con) { body.append(el("div", "m-question", t("noPreds"))); $("#modal-overlay").hidden = false; document.body.style.overflow = "hidden"; return; }

  if (match) {
    const buckets = matchBuckets(ev, con.votes);
    const cwrap = el("div", "m-consensus"); const left = el("div");
    const winTxt = /draw/i.test(con.leaderPick) || con.leaderPick === t("drawPick") ? t("drawPick") : `${con.leaderPick} ${t("toWin")}`;
    left.append(el("div", "big", esc(winTxt)));
    left.append(el("div", "meta", buckets.map((b) => `${esc(b.label)} ${Math.round(b.share * 100)}%`).join(" · ") + ` · ${con.agreeCount}/${con.total} ${t("agree")} · ${t("kicksOff")} ${esc(fmtKick(ev.kickoff))}`));
    cwrap.append(el("div", "", "⚽")); cwrap.firstChild.style.fontSize = "30px"; cwrap.append(left); body.append(cwrap);
    const bar = el("div", "threeway m-threeway");
    for (const b of buckets) { const seg = el("div", `tw-seg tw-${b.key}`); seg.style.width = `${Math.max(2, Math.round(b.share * 100))}%`; bar.append(seg); }
    body.append(bar);
  } else {
    const cwrap = el("div", "m-consensus"); const left = el("div");
    left.append(el("div", "big", esc(con.leaderPick)));
    left.append(el("div", "meta", `${con.agreeCount}/${con.total} ${t("agree")} · ${con.distinctPicks} ${t("camps")} · ${t("resolves")} ${esc(ev.resolves)}`));
    cwrap.append(el("div", "", "🔮")); cwrap.firstChild.style.fontSize = "30px"; cwrap.append(left); body.append(cwrap);
  }

  const votes = [...con.votes].sort((a, b) => {
    const al = a.pick === con.leaderPick ? 0 : 1, bl = b.pick === con.leaderPick ? 0 : 1;
    return al - bl || (b.confidence || 0) - (a.confidence || 0);
  });
  for (const v of votes) body.append(renderVote(ev, con, v, match));

  const voted = new Set(con.votes.map((v) => v.modelId));
  for (const m of STATE.models.filter((m) => !voted.has(m.id))) {
    const row = el("div", "m-vote m-vote-abstained");
    const sw = el("span", "mv-swatch"); sw.style.background = m.color; sw.style.color = m.color; row.append(sw);
    const bd = el("div", "mv-body"); const head = el("div", "mv-head");
    head.append(el("span", "mv-model", esc(m.name)), el("span", "mv-abstain-tag", t("abstained")));
    bd.append(head, el("div", "mv-rationale", t("noAnswer"))); row.append(bd); body.append(row);
  }
  $("#modal-overlay").hidden = false; document.body.style.overflow = "hidden";
}

function renderVote(ev, con, v, match) {
  const m = modelMeta(v.modelId);
  const row = el("div", "m-vote");
  const sw = el("span", "mv-swatch"); sw.style.background = m.color; sw.style.color = m.color; row.append(sw);
  const bd = el("div", "mv-body"); const head = el("div", "mv-head");
  head.append(el("span", "mv-model", esc(m.name)));
  const bucketCls = match ? ` mv-pick-${bucketOf(ev, v.pick)}` : "";
  head.append(el("span", `mv-pick${bucketCls}`, `→ ${esc(v.pick)}`));
  if (v.pick === con.leaderPick && con.agreeCount > 1) head.append(el("span", "mv-lead-tag", t("consensusTag")));
  else if (con.soloPicks.has(v.pick)) head.append(el("span", "mv-contrarian-tag", t("soloTag")));
  head.append(el("span", "mv-conf", `${Math.round((v.confidence || 0) * 100)}% ${t("confident")}`));
  bd.append(head);
  if (v.rationale) bd.append(el("div", "mv-rationale", esc(v.rationale)));
  if (v.marketOdds && v.marketOdds.trim() && !/^n\/?a/i.test(v.marketOdds)) bd.append(el("div", "mv-market", `📊 ${t("marketLabel")}: ${esc(v.marketOdds)}`));

  const hasTrace = Array.isArray(v.trace) && v.trace.length > 0;
  if ((v.analysis && v.analysis.trim()) || hasTrace) {
    const label = hasTrace ? t("researchAnalysis") : t("fullAnalysis");
    const toggle = el("button", "mv-toggle", `<span class="chev">▾</span> ${esc(label)}`);
    const detail = el("div", "mv-analysis"); detail.style.borderLeftColor = m.color; detail.hidden = true;
    if (v.analysis && v.analysis.trim()) detail.append(el("div", "mv-analysis-text", esc(v.analysis)));
    if (hasTrace) {
      const trail = el("div", "mv-trail");
      trail.append(el("div", "mv-trail-head", `🔎 ${t("howResearched")} · ${v.trace.length} ${t("toolCalls")}`));
      for (const step of v.trace) {
        const s = el("div", "mv-step");
        s.append(el("span", "mv-step-tool", esc(step.tool || "tool")));
        if (step.query) s.append(el("span", "mv-step-query", esc(step.query)));
        if (step.summary) s.append(el("div", "mv-step-summary", esc(step.summary)));
        trail.append(s);
      }
      detail.append(trail);
    }
    detail.append(el("div", "mv-analysis-meta", `${esc(m.name)} · ${esc(m.provider)} · Franklin × BlockRun`));
    toggle.onclick = () => { const open = detail.hidden; detail.hidden = !open; toggle.classList.toggle("open", open); toggle.firstChild.textContent = open ? "▴" : "▾"; };
    bd.append(toggle, detail);
  }
  row.append(bd);
  return row;
}

function closeModal() { $("#modal-overlay").hidden = true; document.body.style.overflow = ""; }

// --- i18n static + language toggle ----------------------------------------
function fillStatic() {
  document.documentElement.lang = STATE.lang;
  for (const node of $$("[data-en]")) {
    const txt = node.getAttribute(`data-${STATE.lang}`) ?? node.getAttribute("data-en");
    if (txt != null) node.textContent = txt;
  }
  buildLangSwitch();
  updateGeneratedAt();
}

function buildLangSwitch() {
  const wrap = $("#lang-switch"); if (!wrap) return;
  wrap.innerHTML = "";
  for (const l of LANGS) {
    const b = el("button", "lang-btn" + (l.code === STATE.lang ? " active" : ""), l.label);
    b.onclick = () => setLang(l.code);
    wrap.append(b);
  }
}

function updateGeneratedAt() {
  const ga = $("#generated-at"); if (!ga || !STATE.preds.generatedAt) return;
  const d = new Date(STATE.preds.generatedAt);
  const date = d.toLocaleDateString(LOCALE[STATE.lang] || "en-US", { year: "numeric", month: "long", day: "numeric" });
  const sample = STATE.preds.source === "sample";
  const agent = STATE.preds.engine === "agent";
  const S = {
    en: sample ? `Sample data, generated ${date} (run the generator for live predictions).` : `Predictions generated ${date} via the ${agent ? "grounded Franklin agent" : "BlockRun gateway"}.`,
    es: sample ? `Datos de muestra, generados el ${date} (ejecuta el generador para pronósticos reales).` : `Pronósticos generados el ${date} con ${agent ? "el agente Franklin conectado" : "la pasarela BlockRun"}.`,
    zh: sample ? `示例数据，生成于 ${date}（运行生成脚本即可得到真实预测）。` : `预测生成于 ${date}，来自${agent ? "联网调研的 Franklin agent" : "BlockRun 网关"}。`,
    ja: sample ? `サンプルデータ（${date} 生成）。実際の予測はジェネレーターを実行してください。` : `予測は ${date} に${agent ? "Web 調査する Franklin エージェント" : "BlockRun ゲートウェイ"}で生成。`,
  };
  ga.textContent = S[STATE.lang] || S.en;
}

function rerender() {
  fillStatic(); renderHeroStats(); renderFilters(); renderEvents(); renderOthers(); renderShowdown();
}

function setLang(lang) {
  STATE.lang = lang;
  try { localStorage.setItem("franklin_lang", lang); } catch {}
  rerender();
}

async function applyBranding() {
  let cfg; try { cfg = await loadJSON("oracle.config.json"); } catch { return; }
  const s = cfg?.site; if (!s) return;
  if (s.poweredByUrl) $$('a.header-cta, a.brand, .footer-links a:first-child').forEach((a) => { if (a.getAttribute("href")?.includes("blockrun.ai")) a.setAttribute("href", s.poweredByUrl); });
  if (s.twitter) $$('a[href*="x.com"], a[href*="twitter"]').forEach((a) => a.setAttribute("href", s.twitter));
}

// --- Boot -----------------------------------------------------------------
async function init() {
  try {
    const saved = localStorage.getItem("franklin_lang");
    if (LANGS.some((l) => l.code === saved)) STATE.lang = saved;
  } catch {}
  try {
    const [events, models, preds] = await Promise.all([
      loadJSON("data/events.json"), loadJSON("data/models.json"), loadJSON("data/predictions.json"),
    ]);
    STATE.events = events; STATE.models = models;
    STATE.modelById = Object.fromEntries(models.map((m) => [m.id, m]));
    STATE.preds = preds;
    await applyBranding();
    rerender();
  } catch (err) {
    console.error(err);
    $("#events-grid").innerHTML = `<p style="color:var(--muted)">Couldn't load predictions. Run <code>npm run dev</code> to serve over HTTP.</p>`;
  }

  $("#modal-close").onclick = closeModal;
  $("#modal-overlay").onclick = (e) => { if (e.target.id === "modal-overlay") closeModal(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  setInterval(tickCountdowns, 1000);
}

init();
