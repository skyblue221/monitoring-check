const STORAGE_KEY = "accessibility-monitoring-records-v1";
const SETTINGS_KEY = "accessibility-monitoring-settings-v1";
const DEFAULT_SHEET_URL = "https://script.google.com/macros/s/AKfycbxkHFlIqSY0pRu0t1V4cfRKYJk7qXYvqIO6ayJcylr6MZ7VuJcv4yWANWUrQCycjGc3Og/exec";

const views = {
  dashboard: "오늘의 접근성 현황",
  monitoring: "모니터링 기록하기",
  request: "보급 신청하기",
  list: "전체 기록 살펴보기",
  settings: "구글시트 연결하기",
};

const sampleRecords = [
  {
    id: crypto.randomUUID(),
    kind: "monitoring",
    place: "샘플: 동네분식",
    location: "서울시 ○○구",
    date: new Date().toISOString().slice(0, 10),
    owner: "모니터링단",
    good: "직원이 입구 안내를 빠르게 도와주고 내부 동선이 넓었습니다.",
    issue: "점자메뉴판이 없어 메뉴 확인에 도움이 필요했습니다.",
    tags: ["직원 응대 좋음", "점자메뉴판 필요"],
    status: "조치 필요",
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    kind: "request",
    place: "샘플: 골목카페",
    location: "서울시 ○○구",
    requestType: "경사로",
    priority: "높음",
    owner: "모니터링단",
    contact: "",
    reason: "입구에 낮은 턱이 있어 휠체어와 유아차 이용자가 들어가기 어렵습니다.",
    tags: ["경사로", "높음"],
    status: "신청 접수",
    createdAt: new Date().toISOString(),
  },
];

let records = loadRecords();
let settings = loadSettings();

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleRecords));
    return sampleRecords;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { sheetUrl: DEFAULT_SHEET_URL };

  try {
    const saved = { sheetUrl: "", ...JSON.parse(raw) };
    return saved.sheetUrl ? saved : { sheetUrl: DEFAULT_SHEET_URL };
  } catch {
    return { sheetUrl: DEFAULT_SHEET_URL };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setView(viewName) {
  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  $$(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewName);
  });

  $("#view-title").textContent = views[viewName];
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function createRecordCard(record) {
  const template = $("#record-template").content.cloneNode(true);
  const card = $(".record-card", template);
  const isRequest = record.kind === "request";
  const body = isRequest ? record.reason : [record.good, record.issue].filter(Boolean).join("\n\n");

  $(".record-kicker", card).textContent = isRequest
    ? `보급 신청 · ${formatDate(record.createdAt)}`
    : `모니터링 · ${record.date || formatDate(record.createdAt)}`;
  $("h3", card).textContent = record.place;
  $(".record-location", card).textContent = record.location || "위치 미입력";
  $(".record-body", card).textContent = body || "상세 내용이 없습니다.";

  const pill = $(".status-pill", card);
  pill.textContent = record.status;
  pill.classList.toggle("need", record.status === "조치 필요");
  pill.classList.toggle("request", record.status === "신청 접수");

  const tagRow = $(".tag-row", card);
  record.tags.forEach((tag) => {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = tag;
    tagRow.append(el);
  });

  $("[data-action='toggle']", card).addEventListener("click", () => toggleStatus(record.id));
  $("[data-action='delete']", card).addEventListener("click", () => deleteRecord(record.id));

  return template;
}

function renderRecordList(target, items, emptyText) {
  target.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }

  items.forEach((record) => target.append(createRecordCard(record)));
}

function renderDashboard() {
  const total = records.length;
  const requests = records.filter((record) => record.kind === "request").length;
  const action = records.filter((record) => record.status === "조치 필요").length;
  const good = records.filter((record) => record.good && record.good.trim()).length;

  $("#stat-total").textContent = total;
  $("#stat-request").textContent = requests;
  $("#stat-action").textContent = action;
  $("#stat-good").textContent = good;

  const recent = [...records]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);
  renderRecordList($("#recent-records"), recent, "아직 최근 기록이 없습니다.");
  renderTypeBars();
}

function renderTypeBars() {
  const groups = [
    ["점자메뉴판 필요", countByTag("점자메뉴판 필요") + countByRequest("점자메뉴판")],
    ["경사로 필요", countByTag("경사로 필요") + countByRequest("경사로")],
    ["직원 응대 좋음", countByTag("직원 응대 좋음")],
    ["후속 조치 필요", records.filter((record) => record.status === "조치 필요").length],
  ];
  const max = Math.max(1, ...groups.map(([, value]) => value));
  const target = $("#type-bars");
  target.replaceChildren();

  groups.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label"><span>${label}</span><span>${value}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width: ${(value / max) * 100}%"></div></div>
    `;
    target.append(row);
  });
}

function countByTag(tag) {
  return records.filter((record) => record.tags.includes(tag)).length;
}

function countByRequest(keyword) {
  return records.filter((record) => record.requestType?.includes(keyword)).length;
}

function renderAllRecords() {
  const query = $("#search-input").value.trim().toLowerCase();
  const type = $("#type-filter").value;
  const status = $("#status-filter").value;

  const filtered = records.filter((record) => {
    const haystack = Object.values(record).join(" ").toLowerCase();
    return (
      (type === "all" || record.kind === type) &&
      (status === "all" || record.status === status) &&
      (!query || haystack.includes(query))
    );
  });

  const sorted = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderRecordList($("#all-records"), sorted, "조건에 맞는 기록이 없습니다.");
}

function render() {
  renderDashboard();
  renderAllRecords();
  renderSettings();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function serializeForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function checked(form, name) {
  return Boolean(form.elements[name]?.checked);
}

async function sendToSheet(record) {
  const url = settings.sheetUrl.trim();
  if (!url) return { skipped: true };

  const response = await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(record),
  });

  return { ok: response.ok || response.type === "opaque" };
}

async function saveRecord(record, successMessage) {
  records.unshift(record);
  saveRecords();
  render();

  if (!settings.sheetUrl.trim()) {
    showToast(`${successMessage} 구글시트는 아직 연결되지 않았습니다.`);
    return;
  }

  try {
    await sendToSheet(record);
    showToast(`${successMessage} 구글시트에도 전송했습니다.`);
  } catch {
    showToast(`${successMessage} 구글시트 전송은 실패했습니다. URL과 배포 권한을 확인해주세요.`);
  }
}

async function handleMonitoringSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = serializeForm(form);
  const tags = [];

  [
    ["hasBrailleMenu", "점자메뉴판 있음"],
    ["needsBrailleMenu", "점자메뉴판 필요"],
    ["hasRamp", "경사로 있음"],
    ["needsRamp", "경사로 필요"],
    ["staffHelpful", "직원 응대 좋음"],
    ["actionNeeded", "후속 조치 필요"],
  ].forEach(([field, label]) => {
    if (checked(form, field)) tags.push(label);
  });

  const record = {
    id: crypto.randomUUID(),
    kind: "monitoring",
    place: data.place,
    location: data.location,
    date: data.date,
    owner: data.owner,
    good: data.good,
    issue: data.issue,
    tags,
    status: checked(form, "actionNeeded") || checked(form, "needsBrailleMenu") || checked(form, "needsRamp")
      ? "조치 필요"
      : "확인 완료",
    createdAt: new Date().toISOString(),
  };

  await saveRecord(record, "모니터링 기록을 저장했습니다.");
  form.reset();
  setToday();
  setView("dashboard");
}

async function handleRequestSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = serializeForm(form);

  const record = {
    id: crypto.randomUUID(),
    kind: "request",
    place: data.place,
    location: data.location,
    requestType: data.requestType,
    priority: data.priority,
    owner: data.owner,
    contact: data.contact,
    reason: data.reason,
    tags: [data.requestType, data.priority].filter(Boolean),
    status: "신청 접수",
    createdAt: new Date().toISOString(),
  };

  await saveRecord(record, "보급 신청을 저장했습니다.");
  form.reset();
  setView("dashboard");
}

function toggleStatus(id) {
  records = records.map((record) => {
    if (record.id !== id) return record;
    const status = record.status === "확인 완료" ? "조치 필요" : "확인 완료";
    return { ...record, status };
  });
  saveRecords();
  render();
  showToast("상태를 변경했습니다.");
}

function deleteRecord(id) {
  if (!window.confirm("이 기록을 삭제할까요?")) return;
  records = records.filter((record) => record.id !== id);
  saveRecords();
  render();
  showToast("기록을 삭제했습니다.");
}

function exportCsv() {
  const header = ["유형", "장소명", "위치", "상태", "태그", "내용", "담당자", "연락처", "생성일"];
  const rows = records.map((record) => [
    record.kind === "request" ? "보급 신청" : "모니터링",
    record.place,
    record.location,
    record.status,
    record.tags.join(", "),
    record.kind === "request" ? record.reason : [record.good, record.issue].filter(Boolean).join(" / "),
    record.owner,
    record.contact || "",
    formatDate(record.createdAt),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `monitoring-records-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearData() {
  if (!window.confirm("저장된 모든 기록을 초기화할까요?")) return;
  records = [];
  saveRecords();
  render();
  showToast("모든 기록을 초기화했습니다.");
}

function renderSettings() {
  $("#sheet-url").value = settings.sheetUrl || "";
  const status = $("#connection-status");
  const connected = Boolean(settings.sheetUrl?.trim());
  status.classList.toggle("connected", connected);
  status.textContent = connected
    ? "구글시트 연결 URL이 저장되어 있습니다. 새 기록 저장 시 시트에도 전송됩니다."
    : "구글시트가 아직 연결되지 않았습니다.";
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  settings.sheetUrl = $("#sheet-url").value.trim();
  saveSettings();
  renderSettings();
  showToast(settings.sheetUrl ? "구글시트 연결 URL을 저장했습니다." : "연결 URL이 비어 있습니다.");
}

async function testSheetConnection() {
  const url = $("#sheet-url").value.trim();
  if (!url) {
    showToast("먼저 Apps Script 웹앱 URL을 입력해주세요.");
    return;
  }

  settings.sheetUrl = url;
  saveSettings();
  renderSettings();

  try {
    await sendToSheet({
      id: crypto.randomUUID(),
      kind: "test",
      place: "연결 테스트",
      location: "",
      status: "테스트",
      tags: ["테스트"],
      reason: "모니터링단 앱에서 보낸 구글시트 연결 테스트입니다.",
      owner: "",
      contact: "",
      createdAt: new Date().toISOString(),
    });
    showToast("테스트 전송을 보냈습니다. 구글시트를 확인해주세요.");
  } catch {
    showToast("테스트 전송에 실패했습니다. URL과 웹앱 배포 권한을 확인해주세요.");
  }
}

function disconnectSheet() {
  settings.sheetUrl = "";
  saveSettings();
  renderSettings();
  showToast("구글시트 연결을 해제했습니다.");
}

function setToday() {
  const date = $("#monitoring-form [name='date']");
  date.value = new Date().toISOString().slice(0, 10);
}

$$(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$$("[data-view-jump]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewJump));
});

$("#monitoring-form").addEventListener("submit", handleMonitoringSubmit);
$("#request-form").addEventListener("submit", handleRequestSubmit);
$("#settings-form").addEventListener("submit", handleSettingsSubmit);
$("#test-sheet").addEventListener("click", testSheetConnection);
$("#disconnect-sheet").addEventListener("click", disconnectSheet);
$("#search-input").addEventListener("input", renderAllRecords);
$("#type-filter").addEventListener("change", renderAllRecords);
$("#status-filter").addEventListener("change", renderAllRecords);
$("#export-csv").addEventListener("click", exportCsv);
$("#clear-data").addEventListener("click", clearData);

setToday();
render();
