"use strict";

const $ = id => document.getElementById(id);
const STORE = "studysprint.v1";
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const today = () => dateKey(new Date());
const addDays = (value, n) => { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate()+n); return dateKey(d); };
const displayDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {month:"short",day:"numeric"});
const hours = minutes => Number((minutes/60).toFixed(2)).toString();
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaultSettings = () => ({start:today(), daily:120, days:7});
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "0001-01-01" && value <= "9999-12-17" && dateKey(new Date(`${value}T12:00:00`)) === value;

function normalizeTasks(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Import must contain no more than 100 assignments.");
  const ids = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || item.id.length > 64 || ids.has(item.id.trim())) throw new Error("Each assignment needs a unique ID.");
    ids.add(item.id.trim());
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 100 || typeof item.course !== "string" || !item.course.trim() || item.course.length > 60) throw new Error("Each assignment needs a valid title and course.");
    if (!validDate(item.due) || !Number.isInteger(item.minutes) || item.minutes < 15 || item.minutes > 10080 || item.minutes % 15) throw new Error("Check due dates and estimates (15-minute steps).");
    if (!["high","medium","low"].includes(item.priority) || typeof item.completed !== "boolean") throw new Error("Check priority and completion status.");
    return {id:item.id.trim(),title:item.title.trim(),course:item.course.trim(),due:item.due,minutes:item.minutes,priority:item.priority,completed:item.completed};
  });
}

let state = {tasks:[],settings:defaultSettings()};
let filter = "all", latestPlan = null, planGeneration = 0, toastTimeout;
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
  catch { toast("Storage is unavailable. Export your tasks to keep a copy."); }
}

function clearPlan() {
  latestPlan = null;
  planGeneration++;
  $("stat-risk").textContent = "—";
  $("risk-caption").textContent = "Build a plan to check your capacity";
  $("plan-summary").textContent = "Build a plan to see your sessions";
  $("plan-message").replaceChildren();
  $("week-grid").innerHTML = '<div class="plan-empty">Your study sessions will appear here.<br><span>Add an assignment, choose your daily budget, and build your plan.</span></div>';
}

function render() {
  const active = state.tasks.filter(t => !t.completed);
  const completed = state.tasks.length-active.length;
  $("stat-open").textContent = active.length;
  $("task-count").textContent = state.tasks.length;
  $("stat-hours").textContent = hours(active.reduce((n,t) => n+t.minutes,0));
  $("stat-complete").textContent = completed;
  const next = [...active].sort((a,b) => a.due.localeCompare(b.due))[0];
  $("stat-deadline").textContent = next ? `Next deadline: ${displayDate(next.due)}` : "A fresh start. Add an assignment.";
  const query = $("search").value.toLowerCase().trim();
  const visible = [...state.tasks].filter(t => (filter === "all" || (filter === "open" ? !t.completed : t.completed)) && `${t.title} ${t.course}`.toLowerCase().includes(query)).sort((a,b) => Number(a.completed)-Number(b.completed) || a.due.localeCompare(b.due));
  $("task-list").innerHTML = visible.map(t => `<article class="task" data-id="${escapeHTML(t.id)}"><button class="task-check ${t.completed ? "checked":""}" data-action="toggle" aria-label="${t.completed ? "Reopen":"Complete"} ${escapeHTML(t.title)}" aria-pressed="${t.completed}">${t.completed ? "✓":""}</button><div class="task-body"><div class="task-name ${t.completed ? "done":""}">${escapeHTML(t.title)}</div><div class="task-details"><span class="course-chip">${escapeHTML(t.course)}</span><span class="task-due ${!t.completed && t.due < today() ? "overdue":""}">◷ ${displayDate(t.due)}</span><span>·</span><span>${hours(t.minutes)}h estimated</span></div></div><span class="priority ${t.priority}">${t.priority[0].toUpperCase()+t.priority.slice(1)}</span><div class="task-menu"><button class="icon-button" data-action="edit" aria-label="Edit ${escapeHTML(t.title)}">✎</button><button class="icon-button" data-action="delete" aria-label="Delete ${escapeHTML(t.title)}">×</button></div></article>`).join("") || `<div class="task-empty">${state.tasks.length ? "No assignments match your filters.":"A fresh page for your next big idea."}<br><span>${state.tasks.length ? "Try another filter or search.":"Add your own assignment, or try sample tasks to explore."}</span></div>`;
  $("capacity-hours").textContent = `${hours(state.settings.daily*state.settings.days)} hours`;
}

function syncSettings() {
  $("daily-minutes").value = state.settings.daily;
  $("start-date").value = state.settings.start;
  $("plan-days").value = state.settings.days;
}

function openTask(task=null) {
  $("task-form").reset();
  $("edit-id").value = task?.id || "";
  $("dialog-title").textContent = task ? "Edit assignment" : "New assignment";
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
  $("risk-caption").textContent = summary.at_risk_tasks ? "Revisit these estimates or your study budget" : "Your upcoming deadlines fit the plan";
  $("plan-summary").textContent = `${hours(summary.scheduled_minutes)}h scheduled · ${hours(summary.capacity_minutes)}h capacity`;
  const warnings = result.tasks.filter(t => ["overdue","at_risk","beyond_horizon"].includes(t.status));
  const messages = warnings.map(t => t.status === "overdue" ? `${t.title}: deadline already passed; ${hours(t.unscheduled_minutes)}h remains.` : t.status === "at_risk" ? `${t.title}: ${hours(t.unscheduled_minutes)}h will not fit before its deadline.` : `${t.title}: ${hours(t.unscheduled_minutes)}h falls outside this planning window.`);
  $("plan-message").innerHTML = messages.length ? `<div class="plan-notice warning"><strong>Your plan needs a little adjustment.</strong><ul>${messages.map(m => `<li>${escapeHTML(m)}</li>`).join("")}</ul></div>` : `<div class="plan-notice">${summary.active_tasks ? "All open assignments fit before their deadlines. You've got this." : "No open assignments. Enjoy the breathing space."}</div>`;
  $("week-grid").innerHTML = result.days.map(day => {
    const date = new Date(`${day.date}T12:00:00`);
    const percent = day.scheduled_minutes/day.capacity_minutes*100;
    return `<article class="week-day"><div class="day-label"><span>${date.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase()}</span><span>${date.toLocaleDateString("en-US",{month:"short"})}</span></div><div class="day-date">${date.getDate()}</div><div class="day-capacity"><span style="width:${percent}%"></span></div><div class="day-time">${hours(day.scheduled_minutes)}h / ${hours(day.capacity_minutes)}h</div>${day.sessions.map(s => `<div class="session"><strong>${escapeHTML(s.title)}</strong><small>${s.minutes} min · ${escapeHTML(s.course)}</small></div>`).join("") || '<div class="rest-day">Room to recharge.</div>'}</article>`;
  }).join("");
}

async function buildPlan() {
  if (!validDate(state.settings.start)) { toast("Choose a valid start date."); $("start-date").focus(); return; }
  const generation = ++planGeneration;
  const buttons = [$("plan-button"),$("refresh-plan")];
  buttons.forEach(b => b.disabled=true);
  try {
    const response = await fetch("/api/plan", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tasks:state.tasks,start_date:state.settings.start,days:state.settings.days,daily_minutes:state.settings.daily}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(response.status === 422 ? "Please check assignment dates and study estimates." : "The planning service is unavailable. Try again shortly.");
    const result = await response.json();
    if (generation !== planGeneration) return;
    latestPlan = result;
    renderPlan(result);
    toast("Your study plan is ready.");
  } catch (error) {
    if (generation !== planGeneration) return;
    latestPlan = null;
    $("plan-message").innerHTML = '<div class="plan-notice error"></div>';
    $("plan-message").firstElementChild.textContent = error.name === "TimeoutError" ? "The server is taking longer than expected. Try again shortly." : (error instanceof TypeError ? "Cannot reach the planning server. Your tasks are still saved on this device." : error.message);
    $("week-grid").replaceChildren();
    $("stat-risk").textContent = "—";
    $("plan-summary").textContent = "Plan unavailable";
  } finally { buttons.forEach(b => b.disabled=false); }
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
    toast(previous ? "Assignment updated. Rebuild your plan when ready." : "Assignment added. One step closer.");
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
    if (!await confirmAction("Remove this assignment?", `“${task.title}” will be removed from this device. Export your tasks first if you need a backup.`)) return;
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
  if (state.tasks.length && !await confirmAction("Load sample assignments?", "This replaces the assignments on this device. Export your tasks first if you want to keep them.")) return;
  const start = today();
  state.tasks = [
    {id:"demo-1",title:"Build a CI/CD pipeline",course:"Open Source SW",due:addDays(start,4),minutes:240,priority:"high",completed:false},
    {id:"demo-2",title:"Finish graph traversal exercises",course:"Data Structures",due:addDays(start,1),minutes:90,priority:"high",completed:false},
    {id:"demo-3",title:"Draft the project proposal",course:"Software Engineering",due:addDays(start,3),minutes:150,priority:"medium",completed:false},
    {id:"demo-4",title:"Prepare the team presentation",course:"Communication",due:addDays(start,5),minutes:120,priority:"medium",completed:false},
    {id:"demo-5",title:"Review database normalization",course:"Database Systems",due:start,minutes:60,priority:"low",completed:true},
  ];
  state.settings = defaultSettings(); syncSettings(); clearPlan(); persist(); render();
  toast("Sample tasks loaded. Replace them with your own whenever you're ready.");
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
    if (file.size > 500000) throw new Error("Choose a task export smaller than 500 KB.");
    const data = JSON.parse(await file.text());
    if (data.format !== "studysprint-v1") throw new Error("Choose a StudySprint task export.");
    const tasks = normalizeTasks(data.tasks);
    if (state.tasks.length && !await confirmAction("Import these assignments?", "This replaces the assignments currently saved on this device.")) return;
    state.tasks = tasks;
    if (data.settings && validDate(data.settings.start) && [60,90,120,180,240,360].includes(data.settings.daily) && [3,7,14].includes(data.settings.days)) state.settings = data.settings;
    syncSettings(); clearPlan(); persist(); render(); toast("Assignments imported.");
  } catch (error) { toast(error instanceof SyntaxError ? "This file is not valid JSON." : error.message); }
  finally { event.target.value = ""; }
};

async function checkHealth() {
  try {
    const response = await fetch("/api/health",{signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error("unavailable");
    const data = await response.json();
    $("api-status").textContent = "Service online";
    $("api-status").className = "api-status online";
    $("version-label").textContent = `v${data.version} · ${data.revision}`;
  } catch {
    $("api-status").textContent = "Service offline";
    $("api-status").className = "api-status offline";
  }
}

$("today-label").textContent = new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
syncSettings(); render(); checkHealth();
