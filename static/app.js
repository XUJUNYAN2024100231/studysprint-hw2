"use strict";

const $ = id => document.getElementById(id);
const STORE = "studysprint.v1";
const LANG_STORE = "studysprint.language";
const DICTIONARIES = window.StudySprintI18n;
let language = navigator.language.toLowerCase().startsWith("zh") ? "zh" : navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
try { const savedLanguage=localStorage.getItem(LANG_STORE); if(DICTIONARIES[savedLanguage]) language=savedLanguage; } catch {}
const locale = () => ({en:"en-US",zh:"zh-CN",ko:"ko-KR"}[language]);
function t(key, values={}) {
  const text=DICTIONARIES[language][key] ?? DICTIONARIES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_,name)=>String(values[name] ?? `{${name}}`));
}
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const today = () => dateKey(new Date());
const addDays = (value, n) => { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate()+n); return dateKey(d); };
const displayDate = value => new Date(`${value}T12:00:00`).toLocaleDateString(locale(), {month:"short",day:"numeric"});
const hours = minutes => Number((minutes/60).toFixed(2)).toString();
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaultSettings = () => ({start:today(), daily:120, days:7});
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "0001-01-01" && value <= "9999-12-17" && dateKey(new Date(`${value}T12:00:00`)) === value;

function normalizeTasks(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error(t("errorMaxTasks"));
  const ids = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || item.id.length > 64 || ids.has(item.id.trim())) throw new Error(t("errorID"));
    ids.add(item.id.trim());
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 100 || typeof item.course !== "string" || !item.course.trim() || item.course.length > 60) throw new Error(t("errorText"));
    if (!validDate(item.due) || !Number.isInteger(item.minutes) || item.minutes < 15 || item.minutes > 10080 || item.minutes % 15) throw new Error(t("errorEstimate"));
    if (!["high","medium","low"].includes(item.priority) || typeof item.completed !== "boolean") throw new Error(t("errorPriority"));
    return {id:item.id.trim(),title:item.title.trim(),course:item.course.trim(),due:item.due,minutes:item.minutes,priority:item.priority,completed:item.completed};
  });
}

let state = {tasks:[],settings:defaultSettings()};
let filter = "all", latestPlan = null, latestPlanError = null, planGeneration = 0, toastTimeout, serviceState="connecting";
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved) {
    state.tasks = normalizeTasks(saved.tasks);
    const s = saved.settings;
    if (s && validDate(s.start) && [60,90,120,180,240,360].includes(s.daily) && [3,7,14].includes(s.days)) state.settings = s;
  }
} catch { state = {tasks:[],settings:defaultSettings()}; }

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.remove("visible"), 4000);
}

function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch { toast(t("storageUnavailable")); }
}

function renderEmptyPlan() {
  $("stat-risk").textContent = "—";
  $("risk-caption").textContent = t("riskInitial");
  $("plan-summary").textContent = t("planInitial");
  $("plan-message").replaceChildren();
  $("week-grid").innerHTML = `<div class="plan-empty">${t("planEmpty")}<br><span>${t("planEmptyDescription")}</span></div>`;
}

function clearPlan() {
  latestPlan = null;
  latestPlanError = null;
  planGeneration++;
  renderEmptyPlan();
}

function renderServiceStatus() {
  $("api-status").textContent=t(serviceState);
  $("api-status").className="api-status"+(serviceState==="connecting"?"":" "+serviceState);
}

function renderLanguage() {
  document.documentElement.lang=locale();
  document.title=t("pageTitle");
  document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach(node=>node.innerHTML=t(node.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node=>node.placeholder=t(node.dataset.i18nPlaceholder));
  document.querySelectorAll('[data-i18n-aria]').forEach(node=>node.setAttribute('aria-label',t(node.dataset.i18nAria)));
  $("language-select").value=language;
  $("today-label").textContent=new Date().toLocaleDateString(locale(),{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  $("dialog-title").textContent=t($("edit-id").value?"editAssignment":"newAssignment");
  $("form-error").textContent="";
  $("toast").classList.remove("visible");
  renderServiceStatus();
  render();
  if(latestPlan) renderPlan(latestPlan);
  else if(latestPlanError) renderPlanError(latestPlanError);
  else renderEmptyPlan();
}

function render() {
  const active = state.tasks.filter(t => !t.completed);
  const completed = state.tasks.length-active.length;
  $("stat-open").textContent = active.length;
  $("task-count").textContent = state.tasks.length;
  $("stat-hours").textContent = hours(active.reduce((n,t) => n+t.minutes,0));
  $("stat-complete").textContent = completed;
  const next = [...active].sort((a,b) => a.due.localeCompare(b.due))[0];
  $("stat-deadline").textContent = next ? t("nextDeadline",{date:displayDate(next.due)}) : t("freshStart");
  const query = $("search").value.toLowerCase().trim();
  const visible = [...state.tasks].filter(t => (filter === "all" || (filter === "open" ? !t.completed : t.completed)) && `${t.title} ${t.course}`.toLowerCase().includes(query)).sort((a,b) => Number(a.completed)-Number(b.completed) || a.due.localeCompare(b.due));
  $("task-list").innerHTML = visible.map(task => `<article class="task" data-id="${escapeHTML(task.id)}"><button class="task-check ${task.completed ? "checked":""}" data-action="toggle" aria-label="${escapeHTML(t(task.completed?"reopenTask":"completeTask",{title:task.title}))}" aria-pressed="${task.completed}">${task.completed ? "✓":""}</button><div class="task-body"><div class="task-name ${task.completed ? "done":""}">${escapeHTML(task.title)}</div><div class="task-details"><span class="course-chip">${escapeHTML(task.course)}</span><span class="task-due ${!task.completed && task.due < today() ? "overdue":""}">◷ ${displayDate(task.due)}</span><span>·</span><span>${t("taskEstimate",{hours:hours(task.minutes)})}</span></div></div><span class="priority ${task.priority}">${t("priority_"+task.priority)}</span><div class="task-menu"><button class="icon-button" data-action="edit" aria-label="${escapeHTML(t("editTask",{title:task.title}))}">✎</button><button class="icon-button" data-action="delete" aria-label="${escapeHTML(t("deleteTask",{title:task.title}))}">×</button></div></article>`).join("") || `<div class="task-empty">${t(state.tasks.length?"noMatches":"emptyHeading")}<br><span>${t(state.tasks.length?"tryAnotherFilter":"emptyDescription")}</span></div>`;
  $("capacity-hours").textContent = t("capacityHours",{hours:hours(state.settings.daily*state.settings.days)});
}

function syncSettings() {
  $("daily-minutes").value = state.settings.daily;
  $("start-date").value = state.settings.start;
  $("plan-days").value = state.settings.days;
}

function openTask(task=null) {
  $("task-form").reset();
  $("edit-id").value = task?.id || "";
  $("dialog-title").textContent = t(task ? "editAssignment" : "newAssignment");
  $("task-title").value = task?.title || "";
  $("task-course").value = task?.course || "";
  $("task-due").value = task?.due || addDays(today(),3);
  $("task-minutes").value = task?.minutes || 120;
  $("task-priority").value = task?.priority || "medium";
  $("form-error").textContent = "";
  $("task-dialog").showModal();
  $("task-title").focus();
}

function confirmAction(title, message) {
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  return new Promise(resolve => {
    const finish = answer => {
      $("confirm-dialog").close();
      $("confirm-yes").onclick = null;
      $("confirm-cancel").onclick = null;
      $("confirm-dialog").oncancel = null;
      resolve(answer);
    };
    $("confirm-yes").onclick = () => finish(true);
    $("confirm-cancel").onclick = () => finish(false);
    $("confirm-dialog").oncancel = event => { event.preventDefault(); finish(false); };
    $("confirm-dialog").showModal();
  });
}

function renderPlan(result) {
  const summary = result.summary;
  $("stat-risk").textContent = summary.at_risk_tasks;
  $("risk-caption").textContent = t(summary.at_risk_tasks ? "riskCaption" : "onTrackCaption");
  $("plan-summary").textContent = t("planSummary",{scheduled:hours(summary.scheduled_minutes),capacity:hours(summary.capacity_minutes)});
  const warnings = result.tasks.filter(t => ["overdue","at_risk","beyond_horizon"].includes(t.status));
  const messages = warnings.map(task => t(task.status==="overdue"?"overdueWarning":task.status==="at_risk"?"riskWarning":"horizonWarning",{title:task.title,hours:hours(task.unscheduled_minutes)}));
  $("plan-message").innerHTML = messages.length ? `<div class="plan-notice warning"><strong>${t("adjustment")}</strong><ul>${messages.map(m => `<li>${escapeHTML(m)}</li>`).join("")}</ul></div>` : `<div class="plan-notice">${t(summary.active_tasks ? "allFit" : "noOpen")}</div>`;
  $("week-grid").innerHTML = result.days.map(day => {
    const date = new Date(`${day.date}T12:00:00`);
    const percent = day.scheduled_minutes/day.capacity_minutes*100;
    return `<article class="week-day"><div class="day-label"><span>${date.toLocaleDateString(locale(),{weekday:"short"}).toUpperCase()}</span><span>${date.toLocaleDateString(locale(),{month:"short"})}</span></div><div class="day-date">${date.getDate()}</div><div class="day-capacity"><span style="width:${percent}%"></span></div><div class="day-time">${t("dayTime",{scheduled:hours(day.scheduled_minutes),capacity:hours(day.capacity_minutes)})}</div>${day.sessions.map(s => `<div class="session"><strong>${escapeHTML(s.title)}</strong><small>${escapeHTML(t("sessionTime",{minutes:s.minutes,course:s.course}))}</small></div>`).join("") || `<div class="rest-day">${t("restDay")}</div>`}</article>`;
  }).join("");
}

async function buildPlan() {
  if (!validDate(state.settings.start)) { toast(t("chooseStart")); $("start-date").focus(); return; }
  const generation = ++planGeneration;
  const buttons = [$("plan-button"),$("refresh-plan")];
  buttons.forEach(b => b.disabled=true);
  try {
    const response = await fetch("/api/plan", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tasks:state.tasks,start_date:state.settings.start,days:state.settings.days,daily_minutes:state.settings.daily}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Object.assign(new Error(),{translationKey:response.status===422?"checkInputs":"serviceUnavailable"});
    const result = await response.json();
    if (generation !== planGeneration) return;
    latestPlan = result;
    latestPlanError = null;
    renderPlan(result);
    toast(t("planReady"));
  } catch (error) {
    if (generation !== planGeneration) return;
    latestPlan = null;
    latestPlanError=error.name==="TimeoutError"?"serverSlow":error instanceof TypeError?"cannotReach":error.translationKey||"serviceUnavailable";
    renderPlanError(latestPlanError);
  } finally { buttons.forEach(b => b.disabled=false); }
}

function renderPlanError(key) {
  $("plan-message").innerHTML='<div class="plan-notice error"></div>';
  $("plan-message").firstElementChild.textContent=t(key);
  $("week-grid").replaceChildren();
  $("stat-risk").textContent="—";
  $("risk-caption").textContent=t("riskInitial");
  $("plan-summary").textContent=t("planUnavailable");
}

$("add-task-top").onclick = $("add-task-bottom").onclick = () => openTask();
$("close-dialog").onclick = () => $("task-dialog").close();
$("task-form").onsubmit = event => {
  event.preventDefault();
  const id = $("edit-id").value || crypto.randomUUID();
  const previous = state.tasks.find(t => t.id === id);
  const candidate = {id,title:$("task-title").value.trim(),course:$("task-course").value.trim(),due:$("task-due").value,minutes:Number($("task-minutes").value),priority:$("task-priority").value,completed:previous?.completed || false};
  try {
    const updated = normalizeTasks([...state.tasks.filter(t => t.id!==id),candidate]);
    state.tasks = updated;
    clearPlan(); persist(); render(); $("task-dialog").close();
    toast(t(previous ? "assignmentUpdated" : "assignmentAdded"));
  } catch (error) { $("form-error").textContent = error.message; }
};

$("task-list").onclick = async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.closest(".task").dataset.id;
  const task = state.tasks.find(t => t.id===id);
  if (!task) return;
  if (button.dataset.action === "edit") { openTask(task); return; }
  if (button.dataset.action === "delete") {
    if (!await confirmAction(t("removeTitle"),t("removeMessage",{title:task.title}))) return;
    state.tasks = state.tasks.filter(t => t.id!==id);
  } else task.completed = !task.completed;
  clearPlan(); persist(); render();
};

document.querySelectorAll("[data-filter]").forEach(button => button.onclick = () => {
  filter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("active",b===button));
  render();
});
$("search").oninput = render;
[$("daily-minutes"),$("start-date"),$("plan-days")].forEach(input => input.onchange = () => {
  state.settings = {start:$("start-date").value,daily:Number($("daily-minutes").value),days:Number($("plan-days").value)};
  clearPlan(); persist(); render();
});
$("plan-button").onclick = $("refresh-plan").onclick = buildPlan;

$("load-demo").onclick = async () => {
  if (state.tasks.length && !await confirmAction(t("loadSampleTitle"),t("loadSampleMessage"))) return;
  const start = today();
  state.tasks = [
    {id:"demo-1",title:t("sample1Title"),course:t("sample1Course"),due:addDays(start,4),minutes:240,priority:"high",completed:false},
    {id:"demo-2",title:t("sample2Title"),course:t("sample2Course"),due:addDays(start,1),minutes:90,priority:"high",completed:false},
    {id:"demo-3",title:t("sample3Title"),course:t("sample3Course"),due:addDays(start,3),minutes:150,priority:"medium",completed:false},
    {id:"demo-4",title:t("sample4Title"),course:t("sample4Course"),due:addDays(start,5),minutes:120,priority:"medium",completed:false},
    {id:"demo-5",title:t("sample5Title"),course:t("sample5Course"),due:start,minutes:60,priority:"low",completed:true},
  ];
  state.settings = defaultSettings(); syncSettings(); clearPlan(); persist(); render();
  toast(t("samplesLoaded"));
  await buildPlan();
};

$("export-button").onclick = () => {
  const blob = new Blob([JSON.stringify({format:"studysprint-v1",tasks:state.tasks,settings:state.settings},null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `studysprint-${today()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};

$("import-file").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 500000) throw new Error(t("errorFileSize"));
    const data = JSON.parse(await file.text());
    if (data.format !== "studysprint-v1") throw new Error(t("errorFileFormat"));
    const tasks = normalizeTasks(data.tasks);
    if (state.tasks.length && !await confirmAction(t("importTitle"),t("importMessage"))) return;
    state.tasks = tasks;
    if (data.settings && validDate(data.settings.start) && [60,90,120,180,240,360].includes(data.settings.daily) && [3,7,14].includes(data.settings.days)) state.settings = data.settings;
    syncSettings(); clearPlan(); persist(); render(); toast(t("imported"));
  } catch (error) { toast(error instanceof SyntaxError ? t("invalidJSON") : error.message); }
  finally { event.target.value = ""; }
};

async function checkHealth() {
  try {
    const response = await fetch("/api/health",{signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error("unavailable");
    const data = await response.json();
    serviceState="online"; renderServiceStatus();
    $("version-label").textContent = `v${data.version} · ${data.revision}`;
  } catch {
    serviceState="offline"; renderServiceStatus();
  }
}

$("language-select").onchange=()=>{
  language=$("language-select").value;
  try {localStorage.setItem(LANG_STORE,language);}catch{}
  renderLanguage();
};
syncSettings(); renderLanguage(); checkHealth();
