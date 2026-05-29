const STORAGE_KEY = "accessibility-monitor-records";
const SAMPLE_SEEDED_KEY = "accessibility-sample-seeded";
const MONITOR_UNLOCK_KEY = "accessibility-monitor-unlocked";
const MONITOR_PASSWORD_KEY = "accessibility-monitor-password";
const DEFAULT_MONITOR_PASSWORD = "7051";
const MANAGER_PASSWORD = "4382";
const RAMP_LIMIT = 6;
const KAKAO_JS_KEY = "80997111825554ef64ddb0481b4c0a76";
const SHEET_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbxkHFlIqSY0pRu0t1V4cfRKYJk7qXYvqIO6ayJcylr6MZ7VuJcv4yWANWUrQCycjGc3Og/exec";

const pageTitles = {
  dashboard: "오늘의 접근성 현황",
  request: "신청하기",
  monitor: "모니터링 기록하기",
  records: "전체 기록 살펴보기",
  map: "지도에서 보기",
  sheet: "구글시트 연결하기",
};

const views = {
  dashboard: document.querySelector("#dashboardView"),
  request: document.querySelector("#requestView"),
  monitor: document.querySelector("#monitorView"),
  records: document.querySelector("#recordsView"),
  map: document.querySelector("#mapView"),
  sheet: document.querySelector("#sheetView"),
};

const pageTitle = document.querySelector("#pageTitle");
const tabButtons = document.querySelectorAll(".tab-button");
const requestForm = document.querySelector("#requestForm");
const monitorGate = document.querySelector("#monitorGate");
const monitorForm = document.querySelector("#monitorForm");
const lockMonitorButton = document.querySelector("#lockMonitorButton");
const recordsList = document.querySelector("#recordsList");
const recentRecordsList = document.querySelector("#recentRecordsList");
const mapRecordsList = document.querySelector("#mapRecordsList");
const mapCanvas = document.querySelector("#mapCanvas");
const mapMessage = document.querySelector("#mapMessage");
const searchInput = document.querySelector("#searchInput");
const kindFilter = document.querySelector("#kindFilter");
const statusFilter = document.querySelector("#statusFilter");
const totalCount = document.querySelector("#totalCount");
const needsActionCount = document.querySelector("#needsActionCount");
const metricTotal = document.querySelector("#metricTotal");
const metricRequests = document.querySelector("#metricRequests");
const metricAction = document.querySelector("#metricAction");
const metricGood = document.querySelector("#metricGood");
const typeChart = document.querySelector("#typeChart");
const rampRemaining = document.querySelector("#rampRemaining");
const exportButton = document.querySelector("#exportButton");
const clearButton = document.querySelector("#clearButton");
const sheetUrl = document.querySelector("#sheetUrl");
const testSheetButton = document.querySelector("#testSheetButton");
const copySheetButton = document.querySelector("#copySheetButton");
const sampleButton = document.querySelector("#sampleButton");
const managerModal = document.querySelector("#managerModal");
const managerForm = document.querySelector("#managerForm");
const managerModalText = document.querySelector("#managerModalText");
const managerPassword = document.querySelector("#managerPassword");
const managerCancelButton = document.querySelector("#managerCancelButton");
const toast = document.querySelector("#toast");

let records = loadRecords();
let kakaoMap;
let kakaoGeocoder;
let kakaoMarkers = [];
let pendingManagerAction = null;
let editingRecordId = null;
const expandedRecords = new Set();

sheetUrl.value = SHEET_WEB_APP_URL;

if (!records.length && localStorage.getItem(SAMPLE_SEEDED_KEY) !== "true") {
  records = sampleRecords();
  localStorage.setItem(SAMPLE_SEEDED_KEY, "true");
  saveRecords();
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function switchView(viewName) {
  Object.entries(views).forEach(([name, view]) => {
    view.classList.toggle("active", name === viewName);
  });

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  pageTitle.textContent = pageTitles[viewName];

  if (viewName === "map") {
    renderMap();
  }
}

function getCheckedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function formDataValue(form, name) {
  return new FormData(form).get(name)?.toString().trim() || "";
}

function getRecordDate(record) {
  return record.visitDate || new Date(record.createdAt).toLocaleDateString("ko-KR");
}

function normalizeRecord(record) {
  return {
    placeType: "",
    address: "",
    district: "",
    lat: "",
    lng: "",
    status: "접수",
    needs: [],
    checks: [],
    reporter: "",
    contact: "",
    note: "",
    positive: "",
    issue: "",
    evidence: "",
    photoName: "",
    photoType: "",
    photoData: "",
    photos: [],
    evaluations: [],
    ...record,
  };
}

async function addRecord(record) {
  if (editingRecordId) {
    return updateRecord(editingRecordId, record);
  }

  const nextRecord = normalizeRecord({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...record,
  });

  records.unshift(nextRecord);
  saveRecords();
  render();
  sendToSheet(nextRecord, "create");
}

async function updateRecord(id, patch) {
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return;

  const existing = normalizeRecord(records[index]);
  const updatedRecord = normalizeRecord({
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    photoName: patch.photoName || existing.photoName,
    photoType: patch.photoType || existing.photoType,
    photoData: patch.photoData || existing.photoData,
    photos: patch.photos?.length ? patch.photos : existing.photos,
  });

  records[index] = updatedRecord;
  editingRecordId = null;
  saveRecords();
  render();
  sendToSheet(updatedRecord, "update");
  showToast("기록을 수정했어요.");
}

async function sendToSheet(record, action = "upsert") {
  try {
    await fetch(SHEET_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, record }),
    });
  } catch {
    showToast("기록은 저장됐지만 시트 전송은 확인하지 못했어요.");
  }
}

async function readPhoto(form) {
  const files = [...(form.elements.photo?.files || [])].slice(0, 5);
  if (!files.length) {
    return {};
  }

  if (files.some((file) => file.size > 1.5 * 1024 * 1024)) {
    showToast("사진은 각 1.5MB 이하로 줄여서 첨부해주세요.");
    throw new Error("Photo is too large");
  }

  const photos = await Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              type: file.type,
              data: reader.result,
            });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    ),
  );

  return {
    photoName: photos.map((photo) => photo.name).join(", "),
    photoType: photos[0]?.type || "",
    photoData: photos[0]?.data || "",
    photos,
  };
}

function recordMatches(record) {
  const query = searchInput.value.trim().toLowerCase();
  const kind = kindFilter.value;
  const status = statusFilter.value;
  const haystack = Object.values(record).flat().join(" ").toLowerCase();
  const queryMatches = !query || haystack.includes(query);
  const kindMatches = kind === "all" || record.kind === kind;
  const statusMatches = status === "all" || record.status === status;

  return queryMatches && kindMatches && statusMatches;
}

function requestRecords() {
  return records.filter((record) => record.kind === "request");
}

function getMonitorPassword() {
  return localStorage.getItem(MONITOR_PASSWORD_KEY) || DEFAULT_MONITOR_PASSWORD;
}

function recordTags(record) {
  return [...(record.needs || []), ...(record.checks || [])].map((tag) => {
    if (tag === "점자메뉴판") return "점자메뉴판 필요";
    if (tag === "경사로") return "경사로 필요";
    if (tag === "쉬운 안내문") return "쉬운 안내판 필요";
    return tag;
  });
}

function getEvaluations(form) {
  const labels = {
    eval_brailleMenu: "점자메뉴판 구비 여부",
    eval_rampAccess: "경사로 및 출입 접근성",
    eval_restroom: "화장실 접근성",
    eval_signage: "안내판·표지판 가독성",
  };

  return Object.entries(labels)
    .map(([name, label]) => {
      const value = form.querySelector(`input[name="${name}"]:checked`)?.value || "";
      return value ? { label, value } : null;
    })
    .filter(Boolean);
}

function rampRequestCount() {
  return requestRecords().filter((record) => recordTags(record).includes("경사로 필요")).length;
}

function renderStats() {
  const actionCount = records.filter((record) => record.status === "조치 필요").length;
  const goodCount = records.filter(
    (record) => record.status === "좋음" || recordTags(record).includes("직원 응대 좋음"),
  ).length;
  const requestCount = requestRecords().length;
  const remaining = Math.max(0, RAMP_LIMIT - rampRequestCount());

  totalCount.textContent = records.length;
  needsActionCount.textContent = actionCount;
  metricTotal.textContent = records.length;
  metricRequests.textContent = requestCount;
  metricAction.textContent = actionCount;
  metricGood.textContent = goodCount;
  rampRemaining.textContent = remaining;
}

function renderRecords() {
  const filtered = records.filter(recordMatches);

  if (!filtered.length) {
    recordsList.innerHTML = '<div class="panel empty">아직 표시할 기록이 없어요.</div>';
    return;
  }

  recordsList.innerHTML = filtered.map((record) => recordTemplate(record, false)).join("");
}

function renderRecentRecords() {
  const recent = records.slice(0, 4);

  if (!recent.length) {
    recentRecordsList.innerHTML = '<div class="empty">아직 기록이 없어요.</div>';
    return;
  }

  recentRecordsList.innerHTML = recent.map((record) => recordTemplate(record, true)).join("");
}

function renderMapRecords() {
  const located = records.filter((record) => normalizeRecord(record).address);

  if (!located.length) {
    mapRecordsList.innerHTML = '<div class="empty">주소가 입력된 기록이 아직 없어요.</div>';
    return;
  }

  mapRecordsList.innerHTML = located.map((record) => recordTemplate(record, true)).join("");
}

function renderTypeChart() {
  const labels = ["점자메뉴판 필요", "경사로 필요", "쉬운 안내판 필요", "직원 응대 좋음", "후속 조치 필요"];
  const counts = labels.map((label) => ({
    label,
    count: records.filter((record) => recordTags(record).includes(label)).length,
  }));
  const max = Math.max(1, ...counts.map((item) => item.count));

  typeChart.innerHTML = counts
    .map(
      (item) => `
        <div class="bar-row">
          <div class="bar-label">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${item.count}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(item.count / max) * 100}%"></div>
          </div>
        </div>
      `,
    )
    .join("");
}

function recordTemplate(record, compact) {
  const normalized = normalizeRecord(record);
  const tags = recordTags(normalized);
  const expanded = expandedRecords.has(normalized.id);
  const cardClass =
    normalized.status === "조치 필요" ? "action" : normalized.status === "일부 보완 필요" ? "partial" : "";
  const body = [
    normalized.address && `위치: ${escapeHtml(normalized.address)}`,
    normalized.district && `행정동: ${escapeHtml(normalized.district)}`,
    normalized.note && `신청 이유: ${escapeHtml(normalized.note)}`,
    normalized.positive && `좋았던 점: ${escapeHtml(normalized.positive)}`,
    normalized.issue && `부족한 점/조치: ${escapeHtml(normalized.issue)}`,
    normalized.evidence && `자료: ${linkify(normalized.evidence)}`,
    normalized.photoName && `사진: ${escapeHtml(normalized.photoName)}`,
  ]
    .filter(Boolean)
    .join("<br />");
  const evaluations = (normalized.evaluations || [])
    .map((item) => `<span>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>`)
    .join("");
  const photos = normalized.photos?.length
    ? normalized.photos
    : normalized.photoData
      ? [{ name: normalized.photoName || "첨부 사진", data: normalized.photoData }]
      : [];
  const photoHtml = photos.length
    ? `<div class="photo-grid">${photos
        .map(
          (photo) => `
            <figure>
              <img src="${escapeHtml(photo.data)}" alt="${escapeHtml(photo.name || "첨부 사진")}" />
              <figcaption>${escapeHtml(photo.name || "첨부 사진")}</figcaption>
            </figure>
          `,
        )
        .join("")}</div>`
    : "";
  const kindLabel = normalized.kind === "request" ? "신청" : "모니터링";
  const actions = compact
    ? ""
    : `<div class="record-actions">
        <button class="ghost-button mini-action" type="button" data-edit="${normalized.id}">수정</button>
        <label class="status-control">
          상태
          <select data-status-select="${normalized.id}">
            ${["접수", "확인 중", "조치 필요", "확인 완료", "좋음", "일부 보완 필요"]
              .map((status) => `<option value="${status}" ${normalized.status === status ? "selected" : ""}>${status}</option>`)
              .join("")}
          </select>
        </label>
        <button class="mini-button" type="button" data-delete="${normalized.id}">담당자 삭제</button>
      </div>`;

  return `
    <article class="record-card ${cardClass}">
      <div class="record-head" data-toggle="${normalized.id}" role="button" tabindex="0">
        <div>
          <div class="record-meta">
            <span>${kindLabel}</span>
            <span>${escapeHtml(getRecordDate(normalized))}</span>
          </div>
          <h3>${escapeHtml(normalized.placeName)}</h3>
          ${normalized.address ? `<p class="record-address">${escapeHtml(normalized.address)}</p>` : ""}
        </div>
        <div class="record-head-actions">
          <span class="status-badge">${escapeHtml(normalized.status || "접수")}</span>
          <button class="link-button detail-toggle" type="button" data-toggle="${normalized.id}">
            ${expanded ? "▲ 닫기" : "▼ 상세"}
          </button>
        </div>
      </div>
      ${tags.length ? `<div class="record-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="record-details ${expanded ? "" : "hidden"}">
        ${body ? `<div class="record-body">${body}</div>` : ""}
        ${evaluations ? `<div class="record-tags eval-tags">${evaluations}</div>` : ""}
        ${photoHtml}
        ${actions}
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return value
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkify(value) {
  const escaped = escapeHtml(value);
  if (!/^https?:\/\//i.test(value)) {
    return escaped;
  }
  return `<a href="${escaped}" target="_blank" rel="noreferrer">${escaped}</a>`;
}

function render() {
  renderStats();
  renderRecords();
  renderRecentRecords();
  renderMapRecords();
  renderTypeChart();
  updateMonitorGate();
  if (views.map.classList.contains("active")) {
    renderMap();
  }
}

function loadKakaoMapSdk() {
  if (window.kakao?.maps) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector("#kakaoMapSdk");
    if (existing) {
      existing.addEventListener("load", () => window.kakao.maps.load(resolve), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "kakaoMapSdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function renderMap() {
  const located = records.filter((record) => normalizeRecord(record).address);

  renderMapRecords();

  if (!located.length) {
    mapMessage.textContent = "주소가 입력된 신청이나 모니터링 기록이 생기면 지도에 표시됩니다.";
    mapMessage.classList.remove("hidden");
    return;
  }

  try {
    await loadKakaoMapSdk();
  } catch {
    renderFallbackMap(located);
    return;
  }

  mapMessage.classList.add("hidden");

  if (!kakaoMap) {
    kakaoMap = new kakao.maps.Map(mapCanvas, {
      center: new kakao.maps.LatLng(37.5665, 126.978),
      level: 5,
    });
    kakaoGeocoder = new kakao.maps.services.Geocoder();
  }

  kakaoMarkers.forEach((marker) => marker.setMap(null));
  kakaoMarkers = [];
  if (mapCanvas.querySelector(".fallback-map")) {
    mapCanvas.innerHTML = "";
    kakaoMap = null;
  }
  const bounds = new kakao.maps.LatLngBounds();

  located.forEach((record) => {
    const normalized = normalizeRecord(record);
    kakaoGeocoder.addressSearch(normalized.address, (result, status) => {
      if (status !== kakao.maps.services.Status.OK || !result[0]) return;

      const position = new kakao.maps.LatLng(result[0].y, result[0].x);
      normalized.lat = result[0].y;
      normalized.lng = result[0].x;
      const marker = new kakao.maps.Marker({ map: kakaoMap, position });
      const tags = recordTags(normalized).slice(0, 3).join(", ") || normalized.status;
      const infoWindow = new kakao.maps.InfoWindow({
        content: `<div class="map-balloon"><strong>${escapeHtml(normalized.placeName)}</strong><span>${escapeHtml(tags)}</span></div>`,
      });

      kakao.maps.event.addListener(marker, "click", () => {
        infoWindow.open(kakaoMap, marker);
      });

      kakaoMarkers.push(marker);
      bounds.extend(position);
      kakaoMap.setBounds(bounds);
    });
  });
}

function renderFallbackMap(located) {
  mapMessage.classList.add("hidden");
  mapCanvas.innerHTML = `
    <div class="fallback-map" aria-label="지도 미리보기">
      ${located
        .slice(0, 6)
        .map((record, index) => {
          const normalized = normalizeRecord(record);
          const left = 18 + ((index * 23) % 64);
          const top = 22 + ((index * 31) % 52);
          const tags = recordTags(normalized).slice(0, 2).join(", ") || normalized.status;
          return `
            <button class="fallback-pin" style="left:${left}%; top:${top}%" type="button">
              <span class="pin-dot"></span>
              <span class="pin-balloon"><strong>${escapeHtml(normalized.placeName)}</strong>${escapeHtml(tags)}</span>
            </button>
          `;
        })
        .join("")}
      <div class="fallback-label">카카오 지도 도메인 설정 전 미리보기</div>
    </div>
  `;
}

function refreshMapSoon() {
  if (!views.map.classList.contains("active")) return;
  window.setTimeout(renderMap, 250);
}

function exportCsv() {
  if (!records.length) {
    showToast("내보낼 기록이 없어요.");
    return;
  }

  const columns = [
    "kind",
    "placeName",
    "placeType",
    "address",
    "district",
    "status",
    "needs",
    "checks",
    "evaluations",
    "reporter",
    "contact",
    "visitDate",
    "note",
    "positive",
    "issue",
    "evidence",
    "photoName",
    "createdAt",
  ];
  const csvRows = [
    columns.join(","),
    ...records.map((record) =>
      columns
        .map((column) => {
          const value = Array.isArray(record[column])
            ? record[column]
                .map((item) => (typeof item === "object" ? `${item.label}: ${item.value}` : item))
                .join(" / ")
            : record[column] || "";
          return `"${value.toString().replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ];

  const blob = new Blob(["\ufeff" + csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `accessibility-records-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function updateMonitorGate() {
  const unlocked = localStorage.getItem(MONITOR_UNLOCK_KEY) === "true";
  monitorGate.classList.toggle("hidden", unlocked);
  monitorForm.classList.toggle("hidden", !unlocked);
  lockMonitorButton.classList.toggle("hidden", !unlocked);
}

function sampleRecords() {
  return [
    {
      id: "sample-1",
      kind: "request",
      status: "접수",
      placeName: "골목카페",
      placeType: "음식점/카페",
      address: "서울 종로구 삼일대로 428",
      district: "종로1·2·3·4가동",
      needs: ["경사로 필요", "쉬운 안내판 필요"],
      reporter: "지역주민",
      contact: "",
      note: "입구에 낮은 턱이 있어 휠체어와 유아차 이용자가 들어가기 어렵습니다.",
      evidence: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: "sample-2",
      kind: "monitor",
      status: "조치 필요",
      placeName: "동네분식",
      placeType: "음식점/카페",
      address: "서울 종로구 인사동길 49",
      district: "종로1·2·3·4가동",
      checks: ["점자메뉴판 필요", "직원 응대 좋음", "후속 조치 필요"],
      reporter: "1조 모니터링단",
      visitDate: new Date().toISOString().slice(0, 10),
      positive: "직원이 입구 안내를 빠르게 도와주고 내부 동선이 넓었습니다.",
      issue: "점자메뉴판이 없어 메뉴 확인에 도움이 필요했습니다.",
      evidence: "",
      createdAt: new Date().toISOString(),
    },
  ].map(normalizeRecord);
}

function insertSampleRecords() {
  if (records.some((record) => record.id?.startsWith("sample-"))) {
    showToast("샘플 기록이 이미 들어 있어요.");
    return;
  }

  records = [...sampleRecords(), ...records];
  saveRecords();
  render();
  showToast("샘플 기록 2건을 넣었어요.");
}

function requestManagerAction(message, action) {
  pendingManagerAction = action;
  managerModalText.textContent = message;
  managerPassword.value = "";
  managerModal.classList.remove("hidden");
  managerPassword.focus();
}

function closeManagerModal() {
  pendingManagerAction = null;
  managerModal.classList.add("hidden");
  managerPassword.value = "";
}

function toggleRecord(id) {
  if (expandedRecords.has(id)) {
    expandedRecords.delete(id);
  } else {
    expandedRecords.add(id);
  }
  renderRecords();
  renderRecentRecords();
  renderMapRecords();
}

function showMetricRecords(filterName) {
  searchInput.value = "";
  kindFilter.value = "all";
  statusFilter.value = "all";

  if (filterName === "requests") {
    kindFilter.value = "request";
  } else if (filterName === "action") {
    statusFilter.value = "조치 필요";
  } else if (filterName === "good") {
    searchInput.value = "좋음";
  }

  switchView("records");
  renderRecords();
}

function setCheckboxes(form, name, values) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function setEvaluationRadios(form, evaluations) {
  const fieldNames = {
    "점자메뉴판 구비 여부": "eval_brailleMenu",
    "경사로 및 출입 접근성": "eval_rampAccess",
    "화장실 접근성": "eval_restroom",
    "안내판·표지판 가독성": "eval_signage",
  };

  Object.values(fieldNames).forEach((name) => {
    form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = false;
    });
  });

  (evaluations || []).forEach((item) => {
    const name = fieldNames[item.label];
    const input = name ? form.querySelector(`input[name="${name}"][value="${item.value}"]`) : null;
    if (input) input.checked = true;
  });
}

function editRecord(id) {
  const record = normalizeRecord(records.find((item) => item.id === id) || {});
  if (!record.id) return;

  editingRecordId = record.id;

  if (record.kind === "request") {
    requestForm.reset();
    requestForm.elements.placeName.value = record.placeName || "";
    requestForm.elements.placeType.value = record.placeType || "";
    requestForm.elements.address.value = record.address || "";
    requestForm.elements.reporter.value = record.reporter || "";
    requestForm.elements.contact.value = record.contact || "";
    requestForm.elements.note.value = record.note || "";
    setCheckboxes(requestForm, "needs", recordTags(record).filter((tag) => !tag.startsWith("기타:")));
    const otherNeed = recordTags(record).find((tag) => tag.startsWith("기타:"));
    if (otherNeed) {
      requestForm.querySelector('input[value="기타 필요"]').checked = true;
      requestForm.elements.otherNeed.value = otherNeed.replace("기타:", "").trim();
    }
    switchView("request");
  } else {
    localStorage.setItem(MONITOR_UNLOCK_KEY, "true");
    updateMonitorGate();
    monitorForm.reset();
    monitorForm.elements.placeName.value = record.placeName || "";
    monitorForm.elements.visitDate.value = record.visitDate || new Date().toISOString().slice(0, 10);
    monitorForm.elements.address.value = record.address || "";
    monitorForm.elements.district.value = record.district || "";
    monitorForm.elements.reporter.value = record.reporter || "";
    monitorForm.elements.status.value = record.status || "";
    monitorForm.elements.positive.value = record.positive || "";
    monitorForm.elements.issue.value = record.issue || "";
    setCheckboxes(monitorForm, "checks", recordTags(record));
    setEvaluationRadios(monitorForm, record.evaluations);
    switchView("monitor");
  }

  showToast("수정할 내용을 불러왔어요. 저장하면 기존 기록이 바뀝니다.");
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-view-jump]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewJump));
});

document.querySelectorAll("[data-metric-filter]").forEach((card) => {
  card.addEventListener("click", () => showMetricRecords(card.dataset.metricFilter));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showMetricRecords(card.dataset.metricFilter);
    }
  });
});

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingRecordId);
  const needs = getCheckedValues(requestForm, "needs");
  if (!needs.length) {
    showToast("필요한 보급 항목을 하나 이상 선택해주세요.");
    return;
  }

  if (needs.includes("경사로 필요") && rampRequestCount() >= RAMP_LIMIT) {
    showToast("경사로 우선 보급 가능 수량 6곳이 모두 접수됐어요.");
    return;
  }

  await addRecord({
    kind: "request",
    status: "접수",
    placeName: formDataValue(requestForm, "placeName"),
    placeType: formDataValue(requestForm, "placeType"),
    address: formDataValue(requestForm, "address"),
    district: "",
    needs: needs.map((need) =>
      need === "기타 필요" && formDataValue(requestForm, "otherNeed")
        ? `기타: ${formDataValue(requestForm, "otherNeed")}`
        : need,
    ),
    reporter: formDataValue(requestForm, "reporter"),
    contact: formDataValue(requestForm, "contact"),
    note: formDataValue(requestForm, "note"),
    evidence: formDataValue(requestForm, "evidence"),
    ...(await readPhoto(requestForm)),
  });
  requestForm.reset();
  switchView("dashboard");
  showToast(wasEditing ? "신청을 수정했어요." : "신청이 접수됐어요.");
  refreshMapSoon();
});

monitorGate.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = formDataValue(monitorGate, "password");
  if (password !== getMonitorPassword() && password !== DEFAULT_MONITOR_PASSWORD) {
    showToast("비밀번호를 확인해주세요.");
    return;
  }

  localStorage.setItem(MONITOR_UNLOCK_KEY, "true");
  monitorGate.reset();
  updateMonitorGate();
  showToast("모니터링 기록 화면을 열었어요.");
});

lockMonitorButton.addEventListener("click", () => {
  localStorage.removeItem(MONITOR_UNLOCK_KEY);
  updateMonitorGate();
  showToast("모니터링 기록 화면을 잠갔어요.");
});

monitorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingRecordId);
  await addRecord({
    kind: "monitor",
    placeName: formDataValue(monitorForm, "placeName"),
    visitDate: formDataValue(monitorForm, "visitDate"),
    address: formDataValue(monitorForm, "address"),
    district: formDataValue(monitorForm, "district"),
    reporter: formDataValue(monitorForm, "reporter"),
    status: formDataValue(monitorForm, "status"),
    checks: getCheckedValues(monitorForm, "checks"),
    evaluations: getEvaluations(monitorForm),
    positive: formDataValue(monitorForm, "positive"),
    issue: formDataValue(monitorForm, "issue"),
    evidence: formDataValue(monitorForm, "evidence"),
    ...(await readPhoto(monitorForm)),
  });
  monitorForm.reset();
  monitorForm.elements.visitDate.valueAsDate = new Date();
  switchView("dashboard");
  showToast(wasEditing ? "모니터링 기록을 수정했어요." : "모니터링 기록을 저장했어요.");
  refreshMapSoon();
});

recordsList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  const editButton = event.target.closest("[data-edit]");
  const toggleButton = event.target.closest("[data-toggle]");

  if (event.target.closest("select, button, input, label")) {
    if (!toggleButton || event.target.closest("[data-delete], [data-edit]")) {
      // Let explicit controls below handle their own action.
    } else if (event.target.closest(".detail-toggle")) {
      toggleRecord(toggleButton.dataset.toggle);
      return;
    } else {
      return;
    }
  }

  if (toggleButton) {
    toggleRecord(toggleButton.dataset.toggle);
    return;
  }

  if (editButton) {
    editRecord(editButton.dataset.edit);
    return;
  }

  if (deleteButton) {
    requestManagerAction("이 기록을 삭제하려면 담당자 비밀번호를 입력해주세요.", () => {
      const record = records.find((item) => item.id === deleteButton.dataset.delete);
      records = records.filter((item) => item.id !== deleteButton.dataset.delete);
      saveRecords();
      render();
      if (record) sendToSheet(record, "delete");
      showToast("기록을 삭제했어요.");
    });
  }
});

recentRecordsList.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle]");
  if (toggleButton) {
    toggleRecord(toggleButton.dataset.toggle);
  }
});

mapRecordsList.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle]");
  if (toggleButton) {
    toggleRecord(toggleButton.dataset.toggle);
  }
});

recordsList.addEventListener("change", (event) => {
  const statusSelect = event.target.closest("[data-status-select]");
  if (!statusSelect) return;

  const record = records.find((item) => item.id === statusSelect.dataset.statusSelect);
  if (!record) return;

  record.status = statusSelect.value;
  saveRecords();
  render();
  sendToSheet(record, "status_update");
  showToast("상태를 변경했어요.");
});

searchInput.addEventListener("input", renderRecords);
kindFilter.addEventListener("change", renderRecords);
statusFilter.addEventListener("change", renderRecords);
sampleButton.addEventListener("click", insertSampleRecords);
exportButton.addEventListener("click", exportCsv);
clearButton.addEventListener("click", () => {
  if (!records.length) return;
  requestManagerAction("전체 기록을 초기화하려면 담당자 비밀번호를 입력해주세요.", () => {
    const deletedRecords = [...records];
    records = [];
    saveRecords();
    render();
    sendToSheet({ deletedCount: deletedRecords.length, createdAt: new Date().toISOString() }, "clear");
    showToast("전체 기록을 삭제했어요.");
  });
});

testSheetButton.addEventListener("click", () => {
  sendToSheet({
    id: "test",
    kind: "test",
    placeName: "연결 테스트",
    status: "테스트",
    createdAt: new Date().toISOString(),
  });
  showToast("테스트 전송을 시도했어요.");
});

copySheetButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(SHEET_WEB_APP_URL);
    showToast("시트 주소를 복사했어요.");
  } catch {
    showToast("복사 권한이 없어 주소를 선택해 복사해주세요.");
  }
});

managerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (managerPassword.value !== MANAGER_PASSWORD) {
    showToast("담당자 비밀번호를 확인해주세요.");
    return;
  }

  const action = pendingManagerAction;
  closeManagerModal();
  if (action) action();
});

managerCancelButton.addEventListener("click", closeManagerModal);

monitorForm.elements.visitDate.valueAsDate = new Date();
render();
