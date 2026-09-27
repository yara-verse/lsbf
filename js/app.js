(() => {
"use strict";

/* ---------- state ---------- */
const KEY = "lsbf-advisor-v1";
const DEFAULT_SETTINGS = { weekday: 1.5, weekend: 3, buffer: 1, target: 50 };
const clone = o => JSON.parse(JSON.stringify(o));

function defaults(){
  return {
    term: LSBF_DATA.term,
    courses: clone(LSBF_DATA.courses),
    items: clone(LSBF_DATA.items),
    done: [], logged: {}, marks: {},
    logDay: { date: "", hours: 0 },
    settings: { ...DEFAULT_SETTINGS }
  };
}

function load(){
  let s = null;
  try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch(e) {}
  const base = defaults();
  if (!s || !Array.isArray(s.items)) {
    // Carry over ticks from the original deadlines page, if present.
    try { const old = JSON.parse(localStorage.getItem("deadlines-done-v1") || "[]"); if (Array.isArray(old)) base.done = old; } catch(e) {}
    return base;
  }
  return { ...base, ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
}

let S = load();
let done = new Set(S.done);
function save(){
  S.done = [...done];
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {}
}

let filter = "all", hideDone = false, planAll = false;

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); })();
const todayIso = iso(today);
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const daysUntil = s => daysBetween(today, parse(s));
const fmtDay = d => d.toLocaleDateString("en-GB", { day:"numeric", month:"short" });
const fmtDow = d => d.toLocaleDateString("en-GB", { weekday:"long" });
const fmtShortDow = d => d.toLocaleDateString("en-GB", { weekday:"short" });
const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
const course = c => S.courses[c] || { name: "Unknown module", short: "Other", lecturer: "", color: "--muted" };
const cvar = c => `var(${course(c).color})`;
const fmtH = h => { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? r : r.toFixed(1)) + "h"; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const byDate = (a, b) => a.date.localeCompare(b.date);
const items = () => [...S.items].sort(byDate);

function toast(msg){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------- effort model ---------- */
// Rough hours for a piece of work, used unless the student sets their own.
function estimateHours(i){
  if (i.hours > 0) return Number(i.hours);
  const text = `${i.title} ${i.length || ""}`.toLowerCase();
  const words = /([\d,]+)\s*words?/.exec(text);
  if (words) return Math.max(4, Math.round(parseInt(words[1].replace(/,/g, ""), 10) / 100));
  if (/quiz|multiple choice|test/.test(text)) return 6;
  if (/poster|presentation/.test(text)) return 12;
  if (/case study|report/.test(text)) return 15;
  if (/exam/.test(text)) return 20;
  return 10;
}
const logged = i => Number(S.logged[i.id] || 0);
const remaining = i => done.has(i.id) ? 0 : Math.max(0, estimateHours(i) - logged(i));

function capacity(d){
  const base = isWeekend(d) ? S.settings.weekend : S.settings.weekday;
  if (iso(d) === todayIso && S.logDay.date === todayIso) return Math.max(0, base - S.logDay.hours);
  return base;
}
// Last day you should still be working on an item.
function lastWorkDay(i){
  const due = parse(i.date);
  const target = addDays(due, -S.settings.buffer);
  return target < today ? due : target;
}

/* ---------- planner ---------- */
// Forward plan: each day, spend available hours on the open item with the
// earliest finish-by date. This front-loads work, so you finish early.
function buildPlan(){
  const open = items().filter(i => remaining(i) > 0 && daysUntil(i.date) >= 0)
    .sort((a, b) => lastWorkDay(a) - lastWorkDay(b));
  const rem = Object.fromEntries(open.map(i => [i.id, remaining(i)]));
  const finish = {};
  const last = S.items.reduce((m, i) => i.date > m ? i.date : m, todayIso);
  const days = [];
  for (let d = new Date(today); iso(d) <= last; d = addDays(d, 1)){
    let cap = capacity(d);
    const blocks = [];
    for (const i of open){
      if (cap <= 0) break;
      if (rem[i.id] <= 0 || d > lastWorkDay(i)) continue;
      const take = Math.min(cap, rem[i.id]);
      rem[i.id] -= take; cap -= take;
      blocks.push({ item: i, hours: take });
      if (rem[i.id] <= 1e-9) finish[i.id] = new Date(d);
    }
    const due = S.items.filter(i => i.date === iso(d));
    days.push({ date: new Date(d), blocks, due, free: cap });
  }
  const short = open.filter(i => rem[i.id] > 1e-9).map(i => ({ item: i, hours: rem[i.id] }));
  return { days, finish, short };
}

// Latest start: schedule each item as late as possible (latest deadline
// first, walking backwards) to find the last day you can safely begin.
function latestStarts(){
  const open = items().filter(i => remaining(i) > 0 && daysUntil(i.date) >= 0)
    .sort((a, b) => lastWorkDay(b) - lastWorkDay(a));
  const used = {};
  const out = {};
  for (const i of open){
    let need = remaining(i), start = null;
    for (let d = lastWorkDay(i); d >= today && need > 1e-9; d = addDays(d, -1)){
      const k = iso(d), free = capacity(d) - (used[k] || 0);
      if (free <= 0) continue;
      const take = Math.min(free, need);
      used[k] = (used[k] || 0) + take; need -= take; start = new Date(d);
    }
    out[i.id] = { start, short: need > 1e-9 };
  }
  return out;
}

/* ---------- grades ---------- */
function gradeFor(c){
  const its = S.items.filter(i => i.c === c);
  const totalW = its.reduce((s, i) => s + Number(i.weight || 0), 0);
  let earned = 0, markedW = 0;
  its.forEach(i => { const m = S.marks[i.id]; if (m !== undefined && m !== "") { earned += i.weight * m / 100; markedW += Number(i.weight); } });
  const remainingW = totalW - markedW;
  const target = Number(S.settings.target);
  const current = markedW ? earned / markedW * 100 : null;
  const needed = remainingW > 0 ? (target * totalW / 100 - earned) / remainingW * 100 : null;
  const final = remainingW === 0 && totalW ? earned / totalW * 100 : null;
  const passNeeded = remainingW > 0 ? (50 * totalW / 100 - earned) / remainingW * 100 : null;
  return { its, totalW, markedW, remainingW, current, needed, passNeeded, final, target };
}
const targetName = t => ({ 50: "a pass", 60: "a merit", 70: "a distinction" }[t] || `${t}%`);

/* ---------- advice ---------- */
function buildAdvice(plan, starts){
  const tips = [];
  const open = items().filter(i => !done.has(i.id) && daysUntil(i.date) >= 0);
  const s = S.settings;

  // Not enough time.
  plan.short.forEach(({ item, hours }) => {
    const weeks = Math.max(1, daysUntil(item.date) / 7);
    tips.push({ kind: "warn", k: "Not enough time", text:
      `At your current hours you'll be <b>${fmtH(hours)} short</b> on ${esc(item.title)} (${esc(course(item.c).short)}). Add about ${fmtH(Math.ceil(hours / weeks * 2) / 2)} a week, or start sooner.` });
  });

  // Overdue and not ticked.
  items().filter(i => !done.has(i.id) && daysUntil(i.date) < 0).forEach(i => {
    tips.push({ kind: "warn", k: "Past due", text: `${esc(i.title)} for ${esc(course(i.c).short)} was due ${fmtDay(parse(i.date))}. Tick it if you submitted it, or contact ${esc(course(i.c).lecturer) || "your lecturer"}.` });
  });

  // Start soon.
  open.forEach(i => {
    const st = starts[i.id];
    if (!st || st.short || !st.start || logged(i) > 0) return;
    const n = daysBetween(today, st.start);
    if (n <= 10) tips.push({ kind: "plan", k: n <= 0 ? "Start today" : "Start soon", text:
      `${n <= 0 ? "Today is the latest day" : `<b>${fmtDow(st.start)} ${fmtDay(st.start)}</b> is the latest day`} to start ${esc(i.title)} for ${esc(course(i.c).short)} and still finish on time.` });
  });

  // Deadline clashes.
  for (let a = 0; a < open.length - 1; a++){
    const x = open[a], y = open[a + 1], gap = daysBetween(parse(x.date), parse(y.date));
    if (gap <= 2) tips.push({ kind: "warn", k: "Deadline clash", text:
      `${esc(course(x.c).short)} (${fmtDay(parse(x.date))}) and ${esc(course(y.c).short)} (${fmtDay(parse(y.date))}) are ${gap === 0 ? "due the same day" : plural(gap, "day", "days") + " apart"}. Aim to finish ${esc(x.title.toLowerCase())} a few days early.` });
  }

  // Busiest stretch: most deadlines inside any 10-day window.
  let best = null;
  open.forEach((x, a) => {
    const win = open.filter(y => { const g = daysBetween(parse(x.date), parse(y.date)); return g >= 0 && g < 10; });
    if (win.length >= 3 && (!best || win.length > best.length)) best = win;
  });
  if (best) {
    const hrs = best.reduce((t, i) => t + estimateHours(i), 0);
    tips.push({ kind: "plan", k: "Busiest stretch", text:
      `${best.length} deadlines between ${fmtDay(parse(best[0].date))} and ${fmtDay(parse(best[best.length-1].date))}, about ${fmtH(hrs)} of work. Get as much of it done before ${fmtDay(parse(best[0].date))} as you can.` });
  }

  // Highest stakes.
  const top = [...open].sort((a, b) => b.weight - a.weight)[0];
  if (top && top.weight >= 60) tips.push({ kind: "plan", k: "Highest stakes", text:
    `${esc(top.title)} is worth <b>${top.weight}%</b> of ${esc(course(top.c).short)}. Give it your best hours and leave time to proofread.` });

  // Things to check.
  open.filter(i => i.flag).forEach(i => tips.push({ kind: "verify", k: "Check this", text: `${esc(course(i.c).short)}, ${esc(i.title)}: ${esc(i.flag)}` }));

  // Grades.
  Object.keys(S.courses).forEach(c => {
    const g = gradeFor(c), co = course(c);
    if (!g.markedW) return;
    g.its.forEach(i => {
      const m = S.marks[i.id], pm = parseFloat(i.pass);
      if (m !== undefined && m !== "" && pm && m < pm) tips.push({ kind: "warn", k: "Below pass mark", text:
        `${m}% on ${esc(i.title)} is under its ${pm}% pass mark. Ask ${esc(co.lecturer) || "your lecturer"} about resit or resubmission rules.` });
    });
    if (g.needed !== null){
      if (g.needed > 100) tips.push({ kind: "warn", k: co.short, text: `${targetName(g.target)[0].toUpperCase() + targetName(g.target).slice(1)} is out of reach for ${esc(co.short)} this term (you'd need ${Math.round(g.needed)}%). Focus on passing.` });
      else if (g.needed > g.target + 10) tips.push({ kind: "warn", k: co.short, text: `You need <b>${Math.round(g.needed)}%</b> on the rest of ${esc(co.short)} for ${targetName(g.target)}. Book time with ${esc(co.lecturer) || "your lecturer"} for feedback.` });
      else if (g.needed <= 0) tips.push({ kind: "good", k: co.short, text: `You've already secured ${targetName(g.target)} in ${esc(co.short)}.` });
    }
  });

  if (!tips.some(t => t.kind === "warn") && open.length) tips.unshift({ kind: "good", k: "On track", text:
    `At ${fmtH(s.weekday)} a weekday and ${fmtH(s.weekend)} a weekend day you can finish everything with time to spare.` });
  if (!open.length) tips.push({ kind: "good", k: "All done", text: "Nothing left to submit this term. Well done." });
  return tips;
}

/* ---------- views: today ---------- */
function renderNext(){
  const el = $("next");
  const upcoming = items().filter(i => !done.has(i.id) && daysUntil(i.date) >= 0);
  if (!upcoming.length){
    el.style.setProperty("--accent", "var(--c2)");
    el.innerHTML = `<div class="count">0<small>to go</small></div><div><h2>Everything is ticked off</h2><div class="meta">Nothing left on the list for this term.</div></div>`;
    return;
  }
  const i = upcoming[0], co = course(i.c), n = daysUntil(i.date), d = parse(i.date), after = upcoming[1];
  el.style.setProperty("--accent", cvar(i.c));
  el.innerHTML = `
    <div class="count">${n === 0 ? "Today" : n}<small>${n === 0 ? "" : n === 1 ? "day to go" : "days to go"}</small></div>
    <div>
      <div class="intro">Next up</div>
      <h2>${esc(i.title)}</h2>
      <div class="meta">${esc(co.name)}${co.lecturer ? ", " + esc(co.lecturer) : ""}<br>${fmtDow(d)} ${fmtDay(d)}${i.time ? ", " + esc(i.time) : ""}, worth ${esc(i.weight)}%</div>
      ${after ? `<div class="after">Then <b>${esc(after.title)}</b> for ${esc(course(after.c).short)}, ${fmtDay(parse(after.date))}</div>` : ""}
    </div>`;
}

function renderAdvice(tips){
  $("adviceCount").textContent = plural(tips.length, "note", "notes");
  $("advice").innerHTML = tips.map(t => `<div class="tip ${t.kind}"><span class="k">${esc(t.k)}</span><p>${t.text}</p></div>`).join("");
}

function renderFocus(plan){
  const day = plan.days[0];
  const blocks = day ? day.blocks : [];
  const total = blocks.reduce((s, b) => s + b.hours, 0);
  const loggedToday = S.logDay.date === todayIso ? S.logDay.hours : 0;
  $("todayHours").textContent = total ? `${fmtH(total)} planned` : (loggedToday ? `${fmtH(loggedToday)} logged` : "");
  if (!blocks.length){
    $("todayFocus").innerHTML = `<div class="focus"><div class="focus-empty">${loggedToday ? "You've done today's study. Rest up." : "Nothing scheduled today. You're ahead, or it's a day off in your study hours."}</div></div>`;
    return;
  }
  $("todayFocus").innerHTML = `<div class="focus">${blocks.map(b => `
    <div class="session" style="--cc:${cvar(b.item.c)}">
      <div><div class="course">${esc(course(b.item.c).short)}</div><div class="what">${esc(b.item.title)}</div></div>
      <div class="hrs">${fmtH(b.hours)}</div>
      <button class="btn small" data-log="${esc(b.item.id)}" data-hours="${b.hours}">Log ${fmtH(b.hours)} done</button>
    </div>`).join("")}</div>`;
}

function renderCal(){
  const $cal = $("cal");
  const its = items();
  if (!its.length){ $cal.innerHTML = `<div class="empty">No assessments yet.</div>`; $("calTitle").textContent = "Deadlines"; return; }
  const first = parse(its[0].date), last = parse(its[its.length - 1].date);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const weeks = Math.min(12, Math.ceil((daysBetween(start, last) + 1) / 7));
  const end = addDays(start, weeks * 7 - 1);
  $("calTitle").textContent = `The crunch, ${fmtDay(start)} to ${fmtDay(end)}`;
  const map = {};
  its.forEach(i => (map[i.date] ||= []).push(i));
  let html = `<div class="dow"><div></div>${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => `<div>${d}</div>`).join("")}</div>`;
  for (let w = 0; w < weeks; w++){
    const ws = addDays(start, w * 7);
    html += `<div class="week"><div class="wk">Week of<br>${fmtDay(ws)}</div>`;
    for (let d = 0; d < 7; d++){
      const day = addDays(ws, d), key = iso(day);
      const chips = (map[key] || []).map(i => {
        const cls = ["chip", done.has(i.id) ? "done" : "", filter !== "all" && filter !== i.c ? "dim" : ""].join(" ");
        return `<button class="${cls}" style="--cc:${cvar(i.c)}" data-jump="${esc(i.id)}" aria-label="${esc(i.title)}, ${esc(course(i.c).name)}, ${fmtDay(day)}">${esc(course(i.c).short)}</button>`;
      }).join("");
      const label = day.getDate() === 1 || (w === 0 && d === 0) ? fmtDay(day) : day.getDate();
      html += `<div class="day${d > 4 ? " weekend" : ""}${key === todayIso ? " today" : ""}"><span class="n">${label}</span>${chips}</div>`;
    }
    html += `</div>`;
  }
  $cal.innerHTML = html;
}

function renderFilters(){
  const opts = [["all", "All courses"], ...Object.entries(S.courses).map(([k, v]) => [k, v.short])];
  $("filters").innerHTML = opts.map(([k, label]) =>
    `<button class="filter" aria-pressed="${filter === k}" data-filter="${esc(k)}" ${k !== "all" ? `style="--cc:${cvar(k)}"` : ""}>${k !== "all" ? '<span class="dot"></span>' : ""}${esc(label)}</button>`
  ).join("") + `<button class="toggle-done" id="toggleDone">${hideDone ? "Show submitted" : "Hide submitted"}</button>`;
}

function leftText(n){
  if (n < 0) return { big: `${-n}`, small: n === -1 ? "day ago" : "days ago" };
  if (n === 0) return { big: "Today", small: "" };
  if (n === 1) return { big: "1", small: "day left" };
  return { big: `${n}`, small: "days left" };
}

function renderList(starts){
  const rows = items().filter(i => (filter === "all" || i.c === filter) && !(hideDone && done.has(i.id)));
  const el = $("list");
  if (!rows.length){ el.innerHTML = `<div class="empty">Nothing to show. Everything here is submitted, or try another course.</div>`; return; }
  el.innerHTML = rows.map(i => {
    const co = course(i.c), d = parse(i.date), n = daysUntil(i.date), lt = leftText(n), isDone = done.has(i.id);
    const st = starts[i.id];
    const facts = [
      `<span class="fact"><b>${esc(i.weight)}%</b> of grade</span>`,
      i.length ? `<span class="fact">${esc(i.length)}</span>` : "",
      i.pass ? `<span class="fact">Pass mark <b>${esc(i.pass)}</b></span>` : "",
      i.time ? `<span class="fact">Due by <b>${esc(i.time)}</b></span>` : "",
      !isDone && st && st.start && !st.short ? `<span class="fact">Start by <b>${fmtDay(st.start)}</b></span>` : "",
      i.flag ? `<span class="flag">${esc(i.flag)}</span>` : ""
    ].join("");
    return `
    <article class="item${isDone ? " is-done" : ""}" id="item-${esc(i.id)}" style="--cc:${cvar(i.c)}">
      <input type="checkbox" class="check" data-id="${esc(i.id)}" ${isDone ? "checked" : ""} aria-label="Mark ${esc(i.title)} for ${esc(co.short)} as submitted">
      <div class="date"><b>${fmtDay(d)}</b><span>${fmtDow(d)}</span></div>
      <div class="body">
        <div class="course">${esc(co.name)} <em>${esc(co.lecturer)}</em></div>
        <h3>${esc(i.title)}</h3>
        <div class="facts">${facts}</div>
      </div>
      <div class="left${!isDone && n >= 0 && n <= 7 ? " soon" : ""}">${isDone ? `<b>Done</b><span>submitted</span>` : `<b>${lt.big}</b><span>${lt.small}</span>`}</div>
    </article>`;
  }).join("");
}

function renderCourses(){
  $("courses").innerHTML = Object.entries(S.courses).map(([k, co]) => {
    const its = items().filter(i => i.c === k);
    if (!its.length) return "";
    return `<div class="cc" style="--cc:${cvar(k)}">
      <h3>${esc(co.name)}</h3><p>${esc(co.lecturer)}</p>
      <div class="split">${its.map(i => `<span class="${done.has(i.id) ? "done" : ""}" style="flex:${Number(i.weight) || 1}" title="${esc(i.title)} ${esc(i.weight)}%"></span>`).join("")}</div>
      <div class="split-labels">${its.map(i => `<span>${esc(i.title.split(" ").slice(0, 2).join(" "))} ${esc(i.weight)}%, ${fmtDay(parse(i.date))}</span>`).join("")}</div>
    </div>`;
  }).join("");
}

/* ---------- views: plan ---------- */
function renderPlan(plan, starts){
  const s = S.settings;
  $("setWeekday").value = s.weekday; $("setWeekend").value = s.weekend; $("setBuffer").value = s.buffer;

  const open = items().filter(i => remaining(i) > 0 && daysUntil(i.date) >= 0);
  const totalRem = open.reduce((t, i) => t + remaining(i), 0);
  const perWeek = s.weekday * 5 + s.weekend * 2;
  const finishAll = open.map(i => plan.finish[i.id]).filter(Boolean).sort((a, b) => b - a)[0];
  $("planSummary").innerHTML = [
    `<span class="fact"><b>${fmtH(totalRem)}</b> of work left</span>`,
    `<span class="fact"><b>${fmtH(perWeek)}</b> a week available</span>`,
    finishAll && !plan.short.length ? `<span class="fact">All done by <b>${fmtDow(finishAll)} ${fmtDay(finishAll)}</b></span>` : "",
    plan.short.length ? `<span class="flag">${plural(plan.short.length, "piece won't", "pieces won't")} fit. Add hours or start sooner.</span>` : ""
  ].join("");

  $("effort").innerHTML = items().map(i => {
    const est = estimateHours(i), lg = logged(i), isDone = done.has(i.id);
    const pct = isDone ? 100 : Math.min(100, lg / est * 100);
    const st = starts[i.id], fin = plan.finish[i.id], sh = plan.short.find(x => x.item.id === i.id);
    let sub;
    if (isDone) sub = "Submitted";
    else if (daysUntil(i.date) < 0) sub = `Was due ${fmtDay(parse(i.date))}`;
    else if (sh) sub = `<b style="color:var(--warn)">${fmtH(sh.hours)} short</b> before ${fmtDay(parse(i.date))}`;
    else sub = `Due ${fmtDay(parse(i.date))}${fin ? `. On this plan it's done by <b>${fmtDay(fin)}</b>` : ""}${st && st.start ? ` (latest start ${fmtDay(st.start)})` : ""}`;
    return `<div class="effort-row" style="--cc:${cvar(i.c)}">
      <div><div class="course">${esc(course(i.c).short)}</div><h3>${esc(i.title)}</h3><div class="sub">${sub}</div></div>
      <div><div class="meter"><span style="width:${pct}%"></span></div><div class="meter-label">${fmtH(lg)} of ~${fmtH(est)}${i.hours ? "" : " (estimate)"}</div></div>
      <div class="log-btns">${isDone ? "" : `<button class="btn small ghost" data-log="${esc(i.id)}" data-hours="0.5">+30m</button><button class="btn small ghost" data-log="${esc(i.id)}" data-hours="1">+1h</button>`}<button class="btn small ghost" data-edit="${esc(i.id)}">Edit</button></div>
    </div>`;
  }).join("");

  const days = planAll ? plan.days : plan.days.slice(0, 14);
  $("planRange").textContent = plan.days.length ? `${fmtDay(today)} to ${fmtDay(plan.days[plan.days.length - 1].date)}` : "";
  let html = "", lastWeek = null;
  days.forEach(day => {
    const monday = iso(addDays(day.date, -((day.date.getDay() + 6) % 7)));
    if (monday !== lastWeek){ html += `<div class="week-sep">Week of ${fmtDay(parse(monday))}</div>`; lastWeek = monday; }
    const blocks = day.blocks.map(b => `<span class="pblock" style="--cc:${cvar(b.item.c)}"><b>${fmtH(b.hours)}</b> ${esc(course(b.item.c).short)}: ${esc(b.item.title)}</span>`)
      .concat(day.due.map(i => `<span class="pblock due" style="--cc:${cvar(i.c)}">Due: ${esc(course(i.c).short)} ${esc(i.title)}${i.time ? ", " + esc(i.time) : ""}</span>`));
    html += `<div class="pday${isWeekend(day.date) ? " weekend" : ""}${iso(day.date) === todayIso ? " today" : ""}">
      <div class="d">${iso(day.date) === todayIso ? "Today" : fmtShortDow(day.date)}<span>${fmtDay(day.date)}</span></div>
      <div class="blocks">${blocks.length ? blocks.join("") : `<span class="free">Free</span>`}</div></div>`;
  });
  if (plan.days.length > 14) html += `<div class="btn-row" style="margin-top:10px"><button class="btn ghost" id="planToggle">${planAll ? "Show the next two weeks only" : `Show the whole term (${plan.days.length} days)`}</button></div>`;
  $("planDays").innerHTML = html || `<div class="empty">No upcoming deadlines to plan for.</div>`;
}

/* ---------- views: grades ---------- */
function renderGrades(){
  $("setTarget").value = String(S.settings.target);
  $("grades").innerHTML = Object.entries(S.courses).map(([c, co]) => {
    const g = gradeFor(c);
    if (!g.its.length) return "";
    const rows = [...g.its].sort(byDate).map(i => `
      <label class="mark"><span class="t">${esc(i.title)}<span>${esc(i.weight)}% of module${i.pass ? `, pass ${esc(i.pass)}` : ""}</span></span>
      <input type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="Mark %" data-mark="${esc(i.id)}" value="${S.marks[i.id] ?? ""}"></label>`).join("");
    let verdict = `<div class="verdict">No marks yet. You need an average of <b>${g.target}%</b> for ${targetName(g.target)}.</div>`;
    if (g.final !== null){
      const ok = g.final >= g.target;
      verdict = `<div class="verdict ${ok ? "good" : "warn"}">Final module mark <b>${g.final.toFixed(1)}%</b>. ${ok ? `That's ${targetName(g.target)}.` : `Below ${targetName(g.target)}.`}</div>`;
    } else if (g.markedW){
      const need = g.needed;
      const cls = need > 100 || need > g.target + 10 ? "warn" : "good";
      const msg = need <= 0 ? `You've already secured ${targetName(g.target)}.`
        : need > 100 ? `${targetName(g.target)[0].toUpperCase() + targetName(g.target).slice(1)} is no longer possible.${g.target > 50 && g.passNeeded <= 100 ? ` You need ${Math.max(0, Math.ceil(g.passNeeded))}% on the rest to pass.` : ""}`
        : `You need <b>${Math.ceil(need)}%</b> on the remaining ${g.remainingW}% for ${targetName(g.target)}.`;
      verdict = `<div class="verdict ${cls}">So far <b>${g.current.toFixed(1)}%</b> on ${g.markedW}% of the module. ${msg}</div>`;
    }
    if (g.totalW !== 100) verdict += `<div class="verdict warn">Weights add up to ${g.totalW}%, not 100%. Check them in Manage.</div>`;
    return `<div class="gcard" style="--cc:${cvar(c)}"><h3>${esc(co.name)}</h3><p class="lect">${esc(co.lecturer)}</p>${rows}${verdict}</div>`;
  }).join("");
}

/* ---------- views: manage ---------- */
function renderManage(){
  $("manageList").innerHTML = items().map(i => `
    <div class="mrow" style="--cc:${cvar(i.c)}">
      <span class="sw"></span>
      <span class="dt">${fmtDay(parse(i.date))} ${parse(i.date).getFullYear()}</span>
      <span class="nm">${esc(i.title)}<span>${esc(course(i.c).short)}, ${esc(i.weight)}%${i.length ? ", " + esc(i.length) : ""}</span></span>
      <button class="btn small ghost" data-edit="${esc(i.id)}">Edit</button>
    </div>`).join("") || `<div class="empty">No assessments. Add one to get started.</div>`;
}

/* ---------- render ---------- */
function render(){
  const plan = buildPlan(), starts = latestStarts();
  const its = S.items;
  $("subtitle").textContent = `${S.term}, ${plural(Object.keys(S.courses).length, "module", "modules")}, ${plural(its.length, "assessment", "assessments")}`;
  const doneN = its.filter(i => done.has(i.id)).length;
  $("doneCount").textContent = doneN;
  $("totalCount").textContent = its.length;
  $("barFill").style.width = (its.length ? doneN / its.length * 100 : 0) + "%";

  renderNext(); renderAdvice(buildAdvice(plan, starts)); renderFocus(plan);
  renderCal(); renderFilters(); renderList(starts); renderCourses();
  renderPlan(plan, starts); renderGrades(); renderManage();
}

/* ---------- routing ---------- */
const TABS = ["today", "plan", "grades", "manage"];
function route(){
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "today";
  TABS.forEach(t => { $("view-" + t).hidden = t !== tab; });
  document.querySelectorAll(".tabs a").forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

/* ---------- actions ---------- */
function logHours(id, h){
  S.logged[id] = Math.round((logged({ id }) + h) * 100) / 100;
  if (S.logDay.date !== todayIso) S.logDay = { date: todayIso, hours: 0 };
  S.logDay.hours += h;
  const i = S.items.find(x => x.id === id);
  save(); render();
  toast(`Logged ${fmtH(h)} on ${i ? i.title : "assessment"}`);
}

document.addEventListener("change", e => {
  const t = e.target;
  if (t.matches(".check")){
    t.checked ? done.add(t.dataset.id) : done.delete(t.dataset.id);
    save(); render(); return;
  }
  if (t.matches("[data-mark]")){
    const v = t.value.trim();
    if (v === "") delete S.marks[t.dataset.mark];
    else { S.marks[t.dataset.mark] = Math.max(0, Math.min(100, Number(v))); done.add(t.dataset.mark); }
    save(); render(); return;
  }
  const num = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
  if (t.id === "setWeekday"){ S.settings.weekday = num(t.value, 0, 12); save(); render(); }
  if (t.id === "setWeekend"){ S.settings.weekend = num(t.value, 0, 16); save(); render(); }
  if (t.id === "setBuffer"){ S.settings.buffer = Math.round(num(t.value, 0, 7)); save(); render(); }
  if (t.id === "setTarget"){ S.settings.target = Number(t.value); save(); render(); }
  if (t.id === "importJson" && t.files[0]) importBackup(t.files[0]).finally(() => { t.value = ""; });
});

document.addEventListener("click", e => {
  const f = e.target.closest("[data-filter]");
  if (f){ filter = f.dataset.filter; render(); return; }
  if (e.target.closest("#toggleDone")){ hideDone = !hideDone; render(); return; }
  if (e.target.closest("#planToggle")){ planAll = !planAll; render(); return; }
  const lg = e.target.closest("[data-log]");
  if (lg){ logHours(lg.dataset.log, Number(lg.dataset.hours)); return; }
  const ed = e.target.closest("[data-edit]");
  if (ed){ openEditor(ed.dataset.edit); return; }
  if (e.target.closest("#addItem")){ openEditor(null); return; }
  if (e.target.closest("#exportIcs")){ exportIcs(); return; }
  if (e.target.closest("#exportJson")){ exportJson(); return; }
  if (e.target.closest("#resetAll")){
    if (confirm("Reset everything to the original deadlines? Your ticks, logged hours, marks and edits will be cleared.")){
      S = defaults(); done = new Set(); save(); render(); toast("Reset to original data");
    }
    return;
  }
  const j = e.target.closest("[data-jump]");
  if (j){
    const id = j.dataset.jump, item = S.items.find(i => i.id === id);
    if (filter !== "all" && filter !== item.c) filter = "all";
    if (hideDone && done.has(id)) hideDone = false;
    render();
    const el = $("item-" + id);
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400);
  }
});

/* ---------- editor ---------- */
const dlg = $("editDialog"), form = $("editForm");
let editingId = null;
function openEditor(id){
  editingId = id;
  const i = id ? S.items.find(x => x.id === id) : { c: Object.keys(S.courses)[0], title: "", date: iso(addDays(today, 14)), weight: "" };
  form.elements.c.innerHTML = Object.entries(S.courses).map(([k, co]) => `<option value="${esc(k)}">${esc(co.name)}</option>`).join("");
  ["c", "title", "date", "time", "weight", "pass", "length", "hours", "flag"].forEach(k => { form.elements[k].value = i[k] ?? ""; });
  form.elements.hours.placeholder = `auto, about ${estimateHours({ ...i, hours: 0 })}`;
  $("editTitle").textContent = id ? "Edit assessment" : "Add assessment";
  $("deleteItem").hidden = !id;
  dlg.showModal();
}
$("cancelEdit").addEventListener("click", () => dlg.close());
$("deleteItem").addEventListener("click", () => {
  const i = S.items.find(x => x.id === editingId);
  if (!i || !confirm(`Delete ${i.title}?`)) return;
  S.items = S.items.filter(x => x.id !== editingId);
  done.delete(editingId); delete S.logged[editingId]; delete S.marks[editingId];
  dlg.close(); save(); render(); toast("Assessment deleted");
});
form.addEventListener("submit", e => {
  e.preventDefault();
  const v = k => form.elements[k].value.trim();
  const rec = { c: v("c"), title: v("title"), date: v("date"), weight: Number(v("weight")) };
  ["time", "pass", "length", "flag"].forEach(k => { if (v(k)) rec[k] = v(k); });
  if (Number(v("hours")) > 0) rec.hours = Number(v("hours"));
  if (editingId){
    const idx = S.items.findIndex(x => x.id === editingId);
    S.items[idx] = { id: editingId, ...rec };
  } else {
    S.items.push({ id: `${rec.c}-${Date.now().toString(36)}`, ...rec });
  }
  dlg.close(); save(); render(); toast(editingId ? "Saved" : "Assessment added");
});

/* ---------- export / import ---------- */
function download(name, text, type){
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
function exportIcs(){
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LSBF Advisor//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:LSBF deadlines"];
  items().forEach(i => {
    const co = course(i.c), ymd = i.date.replace(/-/g, "");
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?$/i.exec((i.time || "").trim());
    lines.push("BEGIN:VEVENT", `UID:${i.id}@lsbf-advisor`, `DTSTAMP:${stamp}`);
    if (m && Number(m[1]) <= 23){
      let h = Number(m[1]);
      if (m[3]) h = h % 12 + (/^p/i.test(m[3]) ? 12 : 0);
      const t = `${String(h).padStart(2, "0")}${m[2] || "00"}00`;
      lines.push(`DTSTART:${ymd}T${t}`, `DTEND:${ymd}T${t}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${iso(addDays(parse(i.date), 1)).replace(/-/g, "")}`);
    }
    const desc = [`${co.name}${co.lecturer ? ", " + co.lecturer : ""}`, `Worth ${i.weight}%`, i.length, i.pass && `Pass mark ${i.pass}`, i.flag && `Check: ${i.flag}`].filter(Boolean).join("\n");
    lines.push(`SUMMARY:${icsEsc(`${co.short}: ${i.title}`)}`, `DESCRIPTION:${icsEsc(desc)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(i.title)} due in 3 days`, "TRIGGER:-P3D", "END:VALARM",
      "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  download("lsbf-deadlines.ics", lines.join("\r\n") + "\r\n", "text/calendar");
  toast("Calendar file downloaded");
}
function exportJson(){
  save();
  download(`lsbf-advisor-backup-${todayIso}.json`, JSON.stringify(S, null, 2), "application/json");
}
async function importBackup(file){
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.items) || typeof data.courses !== "object") throw new Error("bad");
    S = { ...defaults(), ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
    done = new Set(S.done || []);
    save(); render(); toast("Backup restored");
  } catch(e) {
    alert("That file isn't an LSBF Advisor backup.");
  }
}

/* ---------- boot ---------- */
route(); render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
})();
