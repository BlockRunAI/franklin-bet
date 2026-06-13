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

const STATE = { events: [], models: [], modelById: {}, preds: {}, results: { byEvent: {} }, filter: "All", lang: "en" };

// --- i18n (4 languages) ----------------------------------------------------
// Dynamic labels live here; static markup carries data-en/data-es/data-zh/data-ja.
const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "es", label: "ES", name: "Español" },
  { code: "zh", label: "中", name: "中文" },
  { code: "ja", label: "日", name: "日本語" },
];
const LOCALE = { en: "en-US", es: "es-ES", zh: "zh-CN", ja: "ja-JP" };
const I18N = {
  all: { en: "All", es: "Todos", zh: "全部", ja: "すべて" },
  councilPick: { en: "Council pick", es: "Pronóstico IA", zh: "AI 共识", ja: "AI 予想" },
  agree: { en: "agree", es: "de acuerdo", zh: "一致", ja: "一致" },
  pending: { en: "Predictions pending", es: "Pronósticos pendientes", zh: "预测生成中", ja: "予測生成中" },
  notPredicted: { en: "Not predicted", es: "Sin pronóstico", zh: "未预测", ja: "予測なし" },
  linkCopied: { en: "Link copied", es: "Enlace copiado", zh: "链接已复制", ja: "リンクをコピーしました" },
  imgSaved: { en: "Image saved", es: "Imagen guardada", zh: "图片已保存", ja: "画像を保存しました" },
  imgFail: { en: "Could not render image", es: "No se pudo generar la imagen", zh: "图片生成失败", ja: "画像を生成できませんでした" },
  shareLinkTitle: { en: "Share link", es: "Compartir enlace", zh: "分享链接", ja: "リンクを共有" },
  imgPreviewTitle: { en: "Image preview", es: "Vista previa", zh: "图片预览", ja: "画像プレビュー" },
  copy: { en: "Copy", es: "Copiar", zh: "复制", ja: "コピー" },
  copied: { en: "Copied", es: "Copiado", zh: "已复制", ja: "コピー済み" },
  shareVia: { en: "Share…", es: "Compartir…", zh: "系统分享…", ja: "共有…" },
  copyImg: { en: "Copy image", es: "Copiar imagen", zh: "复制图片", ja: "画像をコピー" },
  download: { en: "Download", es: "Descargar", zh: "下载图片", ja: "ダウンロード" },
  rendering: { en: "Rendering…", es: "Generando…", zh: "生成中…", ja: "生成中…" },
  predictionsMade: { en: "Predictions", es: "Pronósticos", zh: "预测数", ja: "予測数" },
  confTrend: { en: "Confidence trend", es: "Tendencia de confianza", zh: "信心走势", ja: "確信度の推移" },
  picksTitle: { en: "All picks", es: "Todos los pronósticos", zh: "历次预测", ja: "予測履歴" },
  noPicksYet: { en: "No predictions yet", es: "Aún sin pronósticos", zh: "暂无预测", ja: "予測なし" },
  retired: { en: "Retired", es: "Retirado", zh: "已停用", ja: "提供終了" },
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
  winRate: { en: "World Cup win rate", es: "Acierto Mundial", zh: "World Cup 胜率", ja: "W杯 的中率" },
  played: { en: "played", es: "jugados", zh: "场已赛", ja: "試合" },
  ftLabel: { en: "FT", es: "Final", zh: "完场", ja: "終了" },
  liveLabel: { en: "LIVE", es: "EN VIVO", zh: "进行中", ja: "ライブ" },
  resultLabel: { en: "Result", es: "Resultado", zh: "最终结果", ja: "結果" },
  notPlayed: { en: "not played yet", es: "aún sin jugar", zh: "暂无已赛场次", ja: "未消化" },
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

// --- Results (optional data/results.json: actual scores + status) ----------
// { byEvent: { "<id>": { status: "scheduled"|"live"|"finished", home, away, minute? } } }
function resultOf(ev) {
  const r = STATE.results.byEvent?.[ev.id];
  if (!r || r.status === "scheduled") return null;
  const bucket = r.home > r.away ? "home" : r.home < r.away ? "away" : "draw";
  return { ...r, bucket };
}

// Per-model World Cup accuracy: correct picks / finished matches.
function winRates() {
  const wr = {};
  for (const m of STATE.models) wr[m.id] = { correct: 0, played: 0 };
  for (const ev of STATE.events) {
    if (!isMatch(ev)) continue;
    const r = resultOf(ev);
    if (!r || r.status !== "finished") continue;
    for (const v of STATE.preds.byEvent?.[ev.id] || []) {
      const s = wr[v.modelId];
      if (!s) continue;
      s.played += 1;
      if (bucketOf(ev, v.pick) === r.bucket) s.correct += 1;
    }
  }
  return wr;
}

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
  const r = resultOf(ev);
  if (r && r.status === "finished") {
    top.append(el("span", "mc-status mc-ft", `${t("ftLabel")} ${r.home}–${r.away}`));
  } else if (r && r.status === "live") {
    top.append(el("span", "mc-status mc-live", `🔴 ${t("liveLabel")} ${r.home}–${r.away}${r.minute ? ` ${r.minute}'` : ""}`));
  } else if (ev.kickoff) {
    const cd = el("span", "mc-countdown"); COUNTDOWNS.push({ el: cd, kickoff: ev.kickoff }); top.append(cd);
  }
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
    if (r && r.status === "finished") {
      const ok = bucketOf(ev, con.leaderPick) === r.bucket;
      pickLine.innerHTML += ` <span class="mc-verdict ${ok ? "ok" : "no"}">${ok ? "✓" : "✗"}</span>`;
    }
    card.append(pickLine);

    const foot = el("div", "ec-foot");
    const dots = el("div", "ec-dots");
    for (const v of con.votes) { const d = el("span", "dot"); d.style.background = modelMeta(v.modelId).color; d.title = `${modelMeta(v.modelId).name}: ${v.pick}`; dots.append(d); }
    foot.append(dots);
    if (ev.venue) foot.append(el("div", "ec-venue", esc(ev.venue.split(",")[0])));
    card.append(foot);
  } else {
    // A match that already kicked off without any prediction was never run in
    // time — label it "Not predicted" rather than "pending" (nothing is coming).
    const elapsed = ev.kickoff && Date.parse(ev.kickoff) < Date.now();
    card.append(el("div", `mc-pending${elapsed ? " mc-unpredicted" : ""}`, t(elapsed ? "notPredicted" : "pending")));
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
  const wr = winRates();
  const grid = $("#showdown-grid"); grid.innerHTML = "";
  // Roster order — not sorted by boldness.
  for (const m of STATE.models) {
    const s = stats[m.id];
    const avg = s.conf.length ? s.conf.reduce((x, y) => x + y, 0) / s.conf.length : 0;
    const align = s.n ? Math.round((s.withLeader / s.n) * 100) : 0;
    const card = el("div", "model-card" + (m.retired ? " is-retired" : ""));
    if (m.retired) card.append(el("span", "mc-retired-badge", t("retired")));
    const head = el("div", "mc-head");
    const sw = el("span", "mc-swatch"); sw.style.background = m.color; sw.style.color = m.color; head.append(sw);
    const nm = el("div"); nm.append(el("div", "mc-name", esc(m.name)), el("div", "mc-provider", esc(m.provider))); head.append(nm);
    card.append(head);

    // World Cup win rate (accuracy) — headline metric, auto-computed from results.
    const w = wr[m.id];
    const wrPct = w.played ? Math.round((w.correct / w.played) * 100) : null;
    const wrEl = el("div", "mc-winrate");
    wrEl.append(el("div", "mc-wr-val" + (wrPct === null ? " dim" : ""), wrPct === null ? "—" : `${wrPct}%`));
    wrEl.append(el("div", "mc-wr-label", `${t("winRate")} · ${w.played ? `${w.correct}/${w.played} ${t("played")}` : t("notPlayed")}`));
    card.append(wrEl);

    const st = el("div", "mc-stats");
    const a = el("div", "mc-stat"); a.append(el("div", "v", `${Math.round(avg * 100)}%`), el("div", "l", t("avgConf")));
    const b = el("div", "mc-stat"); b.append(el("div", "v", `${align}%`), el("div", "l", t("withConsensus")));
    st.append(a, b); card.append(st);
    let tag = t("favBacker");
    if (s.solo >= 3) tag = `${t("upsetHunter")} · ${s.solo} ${t("soloCalls")}`;
    else if (s.solo > 0) tag = `${t("independent")} · ${s.solo} ${t("soloCalls")}`;
    else if (align >= 90) tag = t("chalkEater");
    card.append(el("span", "mc-tag", tag));
    card.classList.add("is-clickable");
    card.onclick = () => openModelModal(m);
    grid.append(card);
  }
}

// Per-model deep stats, computed from the current predictions (+ results when
// matches have resolved). Ordered chronologically so we can chart a trend.
function modelStats(model) {
  const evs = STATE.events
    .filter((e) => (STATE.preds.byEvent?.[e.id] || []).some((v) => v.modelId === model.id))
    .sort((a, b) => Date.parse(a.kickoff || a.resolves || 0) - Date.parse(b.kickoff || b.resolves || 0));
  const picks = [];
  let confSum = 0, solo = 0, withLeader = 0, correct = 0, played = 0;
  for (const ev of evs) {
    const con = consensusFor(ev.id); if (!con) continue;
    const v = con.votes.find((x) => x.modelId === model.id); if (!v) continue;
    confSum += v.confidence || 0;
    if (con.soloPicks.has(v.pick)) solo += 1;
    if (v.pick === con.leaderPick) withLeader += 1;
    const r = resultOf(ev);
    let verdict = null;
    if (r && r.status === "finished") { played += 1; verdict = bucketOf(ev, v.pick) === r.bucket ? "win" : "loss"; if (verdict === "win") correct += 1; }
    picks.push({ ev, v, verdict });
  }
  const n = picks.length;
  return { picks, n, avg: n ? confSum / n : 0, solo, align: n ? Math.round((withLeader / n) * 100) : 0, correct, played };
}

// Tiny inline SVG line chart for a 0..1 series.
function sparkline(vals, w = 280, h = 46) {
  if (!vals.length) return "";
  if (vals.length === 1) { const y = (h - vals[0] * h).toFixed(1); return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><circle cx="${(w / 2).toFixed(1)}" cy="${y}" r="3" fill="currentColor"/></svg>`; }
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - Math.max(0, Math.min(1, v)) * h).toFixed(1)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polygon points="${area}" class="spark-fill"/>
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function openModelModal(model) {
  const s = modelStats(model);
  const { box } = subOverlay(model.name);
  box.classList.add("model-detail");

  const head = el("div", "md-head");
  const sw = el("span", "md-swatch"); sw.style.background = model.color; head.append(sw);
  const nm = el("div"); nm.append(el("div", "md-name", esc(model.name)), el("div", "md-provider", esc(model.provider)));
  head.append(nm); box.append(head);

  // Stat tiles
  const grid = el("div", "md-stats");
  const tile = (val, label, dim) => { const d = el("div", "md-tile"); d.append(el("div", "md-v" + (dim ? " dim" : ""), val), el("div", "md-l", label)); return d; };
  const wrPct = s.played ? `${Math.round((s.correct / s.played) * 100)}%` : "—";
  grid.append(
    tile(String(s.n), t("predictionsMade")),
    tile(`${Math.round(s.avg * 100)}%`, t("avgConf")),
    tile(`${s.align}%`, t("withConsensus")),
    tile(wrPct, t("winRate"), !s.played),
  );
  box.append(grid);

  // Confidence trend
  const trend = el("div", "md-trend");
  trend.append(el("div", "md-section", t("confTrend")));
  if (s.n) {
    const spark = el("div", "md-spark"); spark.innerHTML = sparkline(s.picks.map((p) => p.v.confidence || 0)); trend.append(spark);
  } else trend.append(el("div", "md-empty", t("noPicksYet")));
  box.append(trend);

  // All picks
  if (s.n) {
    box.append(el("div", "md-section", t("picksTitle")));
    const list = el("div", "md-picks");
    for (const p of [...s.picks].reverse()) {
      const row = el("div", "md-pick");
      const title = isMatch(p.ev) ? `${p.ev.home} vs ${p.ev.away}` : titleOf(p.ev);
      const main = el("div", "md-pick-main");
      main.append(el("div", "md-pick-ev", esc(title)));
      const pickLine = el("div", "md-pick-pick");
      pickLine.append(el("span", "md-pick-name", esc(p.v.pick)));
      if (p.verdict) pickLine.append(el("span", "md-verdict " + p.verdict, p.verdict === "win" ? "✓" : "✗"));
      main.append(pickLine); row.append(main);
      row.append(el("div", "md-pick-conf", `${Math.round((p.v.confidence || 0) * 100)}%`));
      list.append(row);
    }
    box.append(list);
  }
}

// --- Modal ----------------------------------------------------------------
function openModal(ev, con) {
  currentEvent = ev;
  setModalHash(ev.id);
  const body = $("#modal-body"); body.innerHTML = "";
  const match = isMatch(ev);
  // The whole card lives inside `cap` — that's exactly what "save as image"
  // captures: header, question, consensus, every model's pick, and the
  // franklin.bet watermark (appended last).
  const cap = el("div", "share-capture"); body.append(cap);
  cap.append(el("div", "m-cat", `${esc(catLabel(ev.category))}${ev.kickoff ? " · " + esc(fmtKick(ev.kickoff)) : ""}`));

  if (match) {
    const header = el("div", "m-match");
    header.innerHTML = `<span class="m-team">${esc(ev.homeFlag || "")} ${esc(ev.home)}</span><span class="m-vs">vs</span><span class="m-team">${esc(ev.away)} ${esc(ev.awayFlag || "")}</span>`;
    cap.append(header);
    if (ev.venue) cap.append(el("div", "m-title-zh", esc(ev.venue)));
  } else {
    cap.append(el("div", "m-title", `${ev.emoji || "🔮"} ${esc(titleOf(ev))}`));
  }
  cap.append(el("div", "m-question", esc(ev.question)));

  if (!con) { cap.append(el("div", "m-question", t("noPreds"))); $("#modal-overlay").hidden = false; document.body.style.overflow = "hidden"; return; }

  if (match) {
    const buckets = matchBuckets(ev, con.votes);
    const cwrap = el("div", "m-consensus"); const left = el("div");
    const winTxt = /draw/i.test(con.leaderPick) || con.leaderPick === t("drawPick") ? t("drawPick") : `${con.leaderPick} ${t("toWin")}`;
    left.append(el("div", "big", esc(winTxt)));
    left.append(el("div", "meta", buckets.map((b) => `${esc(b.label)} ${Math.round(b.share * 100)}%`).join(" · ") + ` · ${con.agreeCount}/${con.total} ${t("agree")} · ${t("kicksOff")} ${esc(fmtKick(ev.kickoff))}`));
    cwrap.append(el("div", "", "⚽")); cwrap.firstChild.style.fontSize = "30px"; cwrap.append(left); cap.append(cwrap);
    const bar = el("div", "threeway m-threeway");
    for (const b of buckets) { const seg = el("div", `tw-seg tw-${b.key}`); seg.style.width = `${Math.max(2, Math.round(b.share * 100))}%`; bar.append(seg); }
    cap.append(bar);

    const fin = resultOf(ev);
    if (fin && fin.status === "finished") {
      const ok = bucketOf(ev, con.leaderPick) === fin.bucket;
      const res = el("div", "m-result " + (ok ? "ok" : "no"));
      res.innerHTML = `<b>${esc(t("resultLabel"))}: ${esc(ev.home)} ${fin.home}–${fin.away} ${esc(ev.away)}</b> · ${esc(t("councilPick"))} ${ok ? "✓" : "✗"}`;
      cap.append(res);
    }
  } else {
    const cwrap = el("div", "m-consensus"); const left = el("div");
    left.append(el("div", "big", esc(con.leaderPick)));
    left.append(el("div", "meta", `${con.agreeCount}/${con.total} ${t("agree")} · ${con.distinctPicks} ${t("camps")} · ${t("resolves")} ${esc(ev.resolves)}`));
    cwrap.append(el("div", "", "🔮")); cwrap.firstChild.style.fontSize = "30px"; cwrap.append(left); cap.append(cwrap);
  }
  const votes = [...con.votes].sort((a, b) => {
    const al = a.pick === con.leaderPick ? 0 : 1, bl = b.pick === con.leaderPick ? 0 : 1;
    return al - bl || (b.confidence || 0) - (a.confidence || 0);
  });
  for (const v of votes) cap.append(renderVote(ev, con, v, match));

  const voted = new Set(con.votes.map((v) => v.modelId));
  for (const m of STATE.models.filter((m) => !voted.has(m.id))) {
    const row = el("div", "m-vote m-vote-abstained");
    const sw = el("span", "mv-swatch"); sw.style.background = m.color; sw.style.color = m.color; row.append(sw);
    const bd = el("div", "mv-body"); const head = el("div", "mv-head");
    head.append(el("span", "mv-model", esc(m.name)), el("span", "mv-abstain-tag", t("abstained")));
    bd.append(head, el("div", "mv-rationale", t("noAnswer"))); row.append(bd); cap.append(row);
  }
  // Watermark closes the card — appended last so it sits below every vote in
  // both the modal and the exported image.
  cap.append(el("div", "share-wm", "franklin.bet · AI council"));
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
  const fin = match ? resultOf(ev) : null;
  if (fin && fin.status === "finished") {
    const ok = bucketOf(ev, v.pick) === fin.bucket;
    head.append(el("span", `mv-verdict ${ok ? "ok" : "no"}`, ok ? "✓" : "✗"));
  }
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

function closeModal() {
  $("#modal-overlay").hidden = true; document.body.style.overflow = "";
  currentEvent = null;
  if (location.hash.startsWith("#match=")) history.replaceState(null, "", location.pathname + location.search);
}

// --- Share: deep-link + native/copy + image -------------------------------
let currentEvent = null;

function setModalHash(id) {
  if (location.hash !== `#match=${id}`) history.replaceState(null, "", `#match=${id}`);
}

function shareUrlFor(id) {
  return `${location.origin}${location.pathname}#match=${id}`;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false; t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 250); }, 1800);
}

const SVG = {
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

// Lightweight overlay above the main modal (link dialog / image preview).
function subOverlay(title) {
  const ov = el("div", "sub-overlay");
  const box = el("div", "sub-modal");
  const head = el("div", "sub-head");
  const x = el("button", "sub-x"); x.innerHTML = SVG.close; x.setAttribute("aria-label", "Close");
  const close = () => { ov.remove(); document.removeEventListener("keydown", onEsc); };
  x.onclick = close;
  const onEsc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  head.append(el("div", "sub-title", esc(title)), x);
  box.append(head);
  ov.append(box);
  ov.onclick = (e) => { if (e.target === ov) close(); };
  document.addEventListener("keydown", onEsc);
  document.body.append(ov);
  return { ov, box, close };
}

function shareLink() {
  if (!currentEvent) return;
  const url = shareUrlFor(currentEvent.id);
  const { box } = subOverlay(t("shareLinkTitle"));
  const row = el("div", "sub-linkrow");
  const input = el("input", "sub-linkinput"); input.value = url; input.readOnly = true;
  const copy = el("button", "sub-btn is-primary"); copy.innerHTML = SVG.copy + `<span>${t("copy")}</span>`;
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch { input.select(); document.execCommand && document.execCommand("copy"); }
    copy.innerHTML = SVG.check + `<span>${t("copied")}</span>`; copy.classList.add("ok"); toast(t("linkCopied"));
  };
  row.append(input, copy); box.append(row);
  if (navigator.share) {
    const title = isMatch(currentEvent) ? `${currentEvent.home} vs ${currentEvent.away}` : titleOf(currentEvent);
    const sh = el("button", "sub-btn sub-wide"); sh.innerHTML = SVG.link + `<span>${t("shareVia")}</span>`;
    sh.onclick = () => navigator.share({ title: `${title} — franklin.bet`, url }).catch(() => {});
    box.append(sh);
  }
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

// Robust DOM→PNG: full content size, fonts ready, images decoded, canvas-limit
// safe scale, solid (non-transparent) background. Mirrors franklin-desktop.
async function renderCardPng(node) {
  try { await document.fonts?.ready; } catch { /* noop */ }
  await Promise.all([...node.querySelectorAll("img")].map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => {}))));
  const css = getComputedStyle(document.documentElement);
  const bg = (css.getPropertyValue("--bg-soft").trim() || "#0b0d16");
  const w = node.offsetWidth, h = node.offsetHeight;
  const MAX = 16000, scale = Math.max(1, Math.min(2, MAX / h, MAX / w));
  const canvas = await window.html2canvas(node, {
    backgroundColor: bg, scale, useCORS: true, logging: false,
    width: w, height: h, windowWidth: document.documentElement.scrollWidth,
  });
  return canvas.toDataURL("image/png");
}

async function copyImageData(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch { return false; }
}

async function shareImage() {
  if (!currentEvent || typeof window.html2canvas !== "function") { toast(t("imgFail")); return; }
  const node = $("#modal-body .share-capture");
  if (!node) { toast(t("imgFail")); return; }
  const btn = $("#modal-image"); btn.classList.add("busy");
  let dataUrl = null;
  try { $("#modal").scrollTop = 0; dataUrl = await renderCardPng(node); } catch { /* noop */ }
  btn.classList.remove("busy");
  if (!dataUrl) { toast(t("imgFail")); return; }

  const { box } = subOverlay(t("imgPreviewTitle"));
  const wrap = el("div", "sub-imgwrap"); const img = el("img", "sub-img"); img.src = dataUrl; wrap.append(img); box.append(wrap);
  const foot = el("div", "sub-foot");
  const copyBtn = el("button", "sub-btn"); copyBtn.innerHTML = SVG.copy + `<span>${t("copyImg")}</span>`;
  copyBtn.onclick = async () => {
    const ok = await copyImageData(dataUrl);
    copyBtn.innerHTML = (ok ? SVG.check : SVG.copy) + `<span>${t(ok ? "copied" : "imgFail")}</span>`;
    if (ok) copyBtn.classList.add("ok");
  };
  const dl = el("button", "sub-btn is-primary"); dl.innerHTML = SVG.download + `<span>${t("download")}</span>`;
  dl.onclick = () => { const a = el("a"); a.href = dataUrl; a.download = `franklin-bet-${currentEvent.id}.png`; a.click(); };
  foot.append(copyBtn, dl); box.append(foot);
}

// Open a match/market modal directly from a #match=<id> deep link.
function openFromHash() {
  const m = location.hash.match(/^#match=(.+)$/);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  const ev = STATE.events.find((e) => e.id === id);
  if (ev) openModal(ev, consensusFor(ev.id));
}

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

const GLOBE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
const CARET_SVG = '<svg class="lang-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

// Globe icon + dropdown of the four languages.
function buildLangSwitch() {
  const wrap = $("#lang-switch"); if (!wrap) return;
  wrap.innerHTML = "";
  const cur = LANGS.find((l) => l.code === STATE.lang) || LANGS[0];
  const toggle = el("button", "lang-toggle");
  toggle.setAttribute("aria-label", "Language");
  toggle.innerHTML = GLOBE_SVG + `<span class="lang-cur">${cur.label}</span>` + CARET_SVG;
  toggle.onclick = (e) => { e.stopPropagation(); wrap.classList.toggle("open"); };
  const menu = el("div", "lang-menu");
  for (const l of LANGS) {
    const item = el("button", "lang-item" + (l.code === STATE.lang ? " active" : ""), esc(l.name));
    item.onclick = (e) => { e.stopPropagation(); wrap.classList.remove("open"); setLang(l.code); };
    menu.append(item);
  }
  wrap.append(toggle, menu);
}

function updateGeneratedAt() {
  const ga = $("#generated-at"); if (!ga || !STATE.preds.generatedAt) return;
  const d = new Date(STATE.preds.generatedAt);
  const date = d.toLocaleDateString(LOCALE[STATE.lang] || "en-US", { year: "numeric", month: "long", day: "numeric" });
  const sample = STATE.preds.source === "sample";
  // Derive the grounded share from the actual data, not a global tag — a partial
  // agent run leaves the file mostly sample but tagged engine:"agent".
  let grounded = 0, total = 0;
  for (const votes of Object.values(STATE.preds.byEvent || {})) for (const v of votes) {
    total += 1; if (Array.isArray(v.trace) && v.trace.length) grounded += 1;
  }
  const allGrounded = total > 0 && grounded === total;
  const someGrounded = grounded > 0 && grounded < total;
  // src: per-language description of where the predictions came from.
  const SRC = {
    en: allGrounded ? "the grounded Franklin agent" : someGrounded ? `${grounded} grounded, the rest from model training data` : "the BlockRun gateway",
    es: allGrounded ? "el agente Franklin conectado" : someGrounded ? `${grounded} con investigación, el resto del entrenamiento del modelo` : "la pasarela BlockRun",
    zh: allGrounded ? "联网调研的 Franklin agent" : someGrounded ? `${grounded} 条联网调研，其余来自模型训练知识` : "BlockRun 网关",
    ja: allGrounded ? "Web 調査する Franklin エージェント" : someGrounded ? `${grounded} 件は Web 調査、残りは学習知識` : "BlockRun ゲートウェイ",
  };
  const src = SRC[STATE.lang] || SRC.en;
  const S = {
    en: sample ? `Sample data, generated ${date} (run the generator for live predictions).` : `Predictions generated ${date} via ${src}.`,
    es: sample ? `Datos de muestra, generados el ${date} (ejecuta el generador para pronósticos reales).` : `Pronósticos generados el ${date} con ${src}.`,
    zh: sample ? `示例数据，生成于 ${date}（运行生成脚本即可得到真实预测）。` : `预测生成于 ${date}，来自${src}。`,
    ja: sample ? `サンプルデータ（${date} 生成）。実際の予測はジェネレーターを実行してください。` : `予測は ${date} に${src}で生成。`,
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
    STATE.results = await loadJSON("data/results.json").catch(() => ({ byEvent: {} }));
    await applyBranding();
    rerender();
    openFromHash(); // deep-link: open the shared match if the URL carries #match=<id>
  } catch (err) {
    console.error(err);
    $("#events-grid").innerHTML = `<p style="color:var(--muted)">Couldn't load predictions. Run <code>npm run dev</code> to serve over HTTP.</p>`;
  }

  $("#modal-close").onclick = closeModal;
  $("#modal-share").onclick = shareLink;
  $("#modal-image").onclick = shareImage;
  $("#modal-overlay").onclick = (e) => { if (e.target.id === "modal-overlay") closeModal(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); $("#lang-switch")?.classList.remove("open"); } });
  document.addEventListener("click", () => $("#lang-switch")?.classList.remove("open"));
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#match=")) openFromHash(); });
  setInterval(tickCountdowns, 1000);
}

init();
