const PLUGIN_ID = "community-history";
const PANEL_ID = "community-history-workbench";
const SWIPE_PLUGIN_ID = "maplibre-gl-swipe";

let appRef = null;
let unregisterPanel = null;
let pendingPoint = null;
let selectedYear = "1945";
let selectedChange = "changed";
let markerCount = 0;

const labels = {
  title: "社區時光地圖",
  intro: "比較不同年代的地圖，找出社區的改變，並用證據記錄你的發現。",
  timeline: "1. 選擇年代",
  compare: "2. 比較地圖",
  compareHint: "請先在 GeoLibre 載入歷史圖層與現代圖層，再開啟左右滑動比較。",
  openSwipe: "開啟左右比較",
  observe: "3. 標記社區變遷",
  choosePoint: "在地圖選位置",
  pointEmpty: "尚未選擇位置",
  pointReady: "已選擇位置",
  changeType: "變遷類型",
  evidenceOld: "舊圖看到什麼？",
  evidenceNow: "現在看到什麼？",
  inference: "我的推測",
  save: "儲存這筆發現",
  saved: "已儲存為 GeoJSON 圖層",
  needPoint: "請先在地圖選擇位置。",
  needEvidence: "請至少填寫一項觀察或推測。",
  restored: "已恢復上次選擇的年代。",
};

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function field(labelText, control) {
  const wrap = make("label", "community-history-field");
  wrap.append(make("span", "community-history-label", labelText), control);
  return wrap;
}

function renderPanel(container) {
  container.replaceChildren();
  const root = make("div", "community-history-root");
  const intro = make("p", "community-history-intro", labels.intro);
  root.append(intro);

  const timeline = make("section", "community-history-section");
  timeline.append(make("h3", "community-history-heading", labels.timeline));
  const yearRow = make("div", "community-history-year-row");
  ["1945", "現在"].forEach((year) => {
    const value = year === "現在" ? "present" : year;
    const button = make("button", "community-history-year", year);
    button.type = "button";
    button.dataset.active = String(selectedYear === value);
    button.addEventListener("click", () => {
      selectedYear = value;
      yearRow.querySelectorAll("button").forEach((node) => {
        node.dataset.active = String(node === button);
      });
    });
    yearRow.append(button);
  });
  timeline.append(yearRow);

  const compare = make("section", "community-history-section");
  compare.append(make("h3", "community-history-heading", labels.compare));
  compare.append(make("p", "community-history-muted", labels.compareHint));
  const swipeButton = make("button", "community-history-primary", labels.openSwipe);
  swipeButton.type = "button";
  swipeButton.addEventListener("click", async () => {
    if (!appRef?.activatePlugin) return;
    const ok = await appRef.activatePlugin(SWIPE_PLUGIN_ID);
    if (!ok) setStatus("無法開啟左右比較工具，請確認目前使用 MapLibre 地圖模式。", true);
  });
  compare.append(swipeButton);

  const observe = make("section", "community-history-section");
  observe.append(make("h3", "community-history-heading", labels.observe));

  const pointStatus = make("div", "community-history-point", labels.pointEmpty);
  const pointButton = make("button", "community-history-secondary", labels.choosePoint);
  pointButton.type = "button";
  pointButton.addEventListener("click", () => {
    const map = appRef?.getMap?.();
    if (!map) {
      setStatus("地圖尚未就緒。", true);
      return;
    }
    pointStatus.textContent = "請點一下地圖位置…";
    const onClick = (event) => {
      pendingPoint = [event.lngLat.lng, event.lngLat.lat];
      pointStatus.textContent = `${labels.pointReady}：${pendingPoint[1].toFixed(5)}, ${pendingPoint[0].toFixed(5)}`;
    };
    map.once("click", onClick);
  });
  observe.append(pointButton, pointStatus);

  const changeSelect = document.createElement("select");
  changeSelect.className = "community-history-input";
  [
    ["preserved", "保留"],
    ["added", "新增"],
    ["disappeared", "消失"],
    ["changed", "改變"],
    ["uncertain", "不確定"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = value === selectedChange;
    changeSelect.append(option);
  });
  changeSelect.addEventListener("change", () => {
    selectedChange = changeSelect.value;
  });
  observe.append(field(labels.changeType, changeSelect));

  const oldEvidence = document.createElement("textarea");
  oldEvidence.className = "community-history-input community-history-textarea";
  oldEvidence.placeholder = "例如：舊圖上這裡是一大片農田";
  observe.append(field(labels.evidenceOld, oldEvidence));

  const nowEvidence = document.createElement("textarea");
  nowEvidence.className = "community-history-input community-history-textarea";
  nowEvidence.placeholder = "例如：現在變成住宅與道路";
  observe.append(field(labels.evidenceNow, nowEvidence));

  const inference = document.createElement("textarea");
  inference.className = "community-history-input community-history-textarea";
  inference.placeholder = "例如：可能因人口增加而開發";
  observe.append(field(labels.inference, inference));

  const saveButton = make("button", "community-history-primary", labels.save);
  saveButton.type = "button";
  saveButton.addEventListener("click", () => {
    if (!pendingPoint) {
      setStatus(labels.needPoint, true);
      return;
    }
    const oldText = oldEvidence.value.trim();
    const nowText = nowEvidence.value.trim();
    const inferenceText = inference.value.trim();
    if (!oldText && !nowText && !inferenceText) {
      setStatus(labels.needEvidence, true);
      return;
    }

    const featureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: pendingPoint },
          properties: {
            activity: "community-history",
            reference_year: selectedYear,
            change_type: selectedChange,
            evidence_old: oldText,
            evidence_now: nowText,
            inference: inferenceText,
            created_at: new Date().toISOString(),
          },
        },
      ],
    };

    markerCount += 1;
    const layerName = `社區變遷 ${markerCount}｜${changeSelect.options[changeSelect.selectedIndex].text}`;
    appRef?.addGeoJsonLayer(layerName, featureCollection);
    pendingPoint = null;
    pointStatus.textContent = labels.pointEmpty;
    oldEvidence.value = "";
    nowEvidence.value = "";
    inference.value = "";
    setStatus(labels.saved, false);
  });
  observe.append(saveButton);

  const status = make("div", "community-history-status");
  status.id = "community-history-status";
  root.append(timeline, compare, observe, status);
  container.append(root);

  return () => {
    container.replaceChildren();
  };
}

function setStatus(message, isError) {
  const status = document.getElementById("community-history-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(Boolean(isError));
}

export const plugin = {
  id: PLUGIN_ID,
  name: "Community History Map",
  version: "0.1.0",
  engines: ["maplibre"],
  activate(app) {
    appRef = app;
    unregisterPanel = app.registerRightPanel?.({
      id: PANEL_ID,
      title: labels.title,
      dock: "replace-style",
      defaultWidth: 360,
      deactivatePluginOnClose: true,
      render: renderPanel,
    }) ?? null;
    if (!unregisterPanel) return false;
    setTimeout(() => app.openRightPanel?.(PANEL_ID), 0);
  },
  deactivate(app) {
    app.closeRightPanel?.(PANEL_ID);
    unregisterPanel?.();
    unregisterPanel = null;
    appRef = null;
    pendingPoint = null;
  },
  getProjectState() {
    return {
      selectedYear,
      selectedChange,
      markerCount,
    };
  },
  applyProjectState(_app, state) {
    if (!state || typeof state !== "object") return false;
    if (state.selectedYear === "1945" || state.selectedYear === "present") {
      selectedYear = state.selectedYear;
    }
    if (
      ["preserved", "added", "disappeared", "changed", "uncertain"].includes(
        state.selectedChange,
      )
    ) {
      selectedChange = state.selectedChange;
    }
    if (Number.isInteger(state.markerCount) && state.markerCount >= 0) {
      markerCount = state.markerCount;
    }
    setStatus(labels.restored, false);
    return true;
  },
};

export default plugin;
