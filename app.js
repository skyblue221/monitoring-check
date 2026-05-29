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
