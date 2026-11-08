"use strict";

const byId = (id) => document.getElementById(id);
const form = byId("calculator");
const submit = byId("submit");
const sentimentValue = byId("sentiment");
const sentimentDate = byId("sentiment-date");
const useMarketDate = byId("use-market-date");
const koreaTicker = "122630.KS";
const koreaFear = byId("korea-fear");
const koreaFearDate = byId("korea-fear-date");
const asOfInput = byId("as-of");
const dateNote = byId("as-of-note");
const manualPanel = byId("manual-metrics");
const metricInputs = Array.from(manualPanel?.querySelectorAll("input") ?? []);
const chartSymbols = {"SPY": "AMEX:SPY", "QQQ": "NASDAQ:QQQ", "TQQQ": "NASDAQ:TQQQ",
  "SOXL": "AMEX:SOXL", "122630.KS": "KRX:122630"};
const pages = globalThis.cremaPages;
const percentMetrics = new Set(["drawdown", "vix_dev", "dist_200"]);
const dollar = new Intl.NumberFormat("ko-KR", {style: "currency", currency: "USD"});
const won = new Intl.NumberFormat("ko-KR", {style: "currency", currency: "KRW"});
let pendingRequest;
let latestMarketDate;

function setMessage(message, isError = false) {
  const box = byId("form-message");
  box.hidden = !message;
  box.textContent = message;
  box.dataset.error = String(isError);
}

function emptyComponents(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = "empty";
  cell.colSpan = 5;
  cell.textContent = message;
  row.append(cell);
  byId("components").replaceChildren(row);
}

function clearResults(ticker, mode, message) {
  const korea = ticker === koreaTicker;
  byId("score-ticker").textContent = korea ? "KODEX 레버리지" : ticker;
  byId("score-kind").textContent = korea ? "국내형 참고" : "크레마지수";
  byId("market-label").textContent = korea ? "한국 거래일" : "미국 거래일";
  byId("volatility-label").textContent = korea ? "V-KOSPI 200 종가" : "VIX 종가";
  byId("score-max").textContent = " / 100";
  byId("gauge-max").textContent = "100";
  byId("mode-badge").textContent = {demo: "데모", market: "자동 조회", manual: "지표 직접 입력"}[mode] ?? "실제 일봉";
  byId("threshold").textContent = "—";
  byId("score-status").textContent = message;
  if (dateNote) dateNote.hidden = true;
  byId("gauge-fill").setAttribute("stroke-dasharray", "0 100");
  for (const id of ["total", "market-date", "price", "high", "vix"]) {
    byId(id).textContent = "—";
  }
  byId("weekly-date").textContent = "";
  byId("chart").setAttribute("hidden", "");
  byId("chart-empty").hidden = false;
  byId("chart-empty").textContent = message;
  emptyComponents(message);
}

function drawComponents(components) {
  const rows = components.map(({key, label, value, weight, score, contribution}) => {
    const row = document.createElement("tr");
    const title = document.createElement("th");
    title.scope = "row";
    title.textContent = label;
    row.append(title);
    const suffix = percentMetrics.has(key) ? "%" : "";
    row.insertCell().textContent = value === null ? "—" : value.toFixed(2) + suffix;
    row.insertCell().textContent = (weight * 100).toFixed(0) + "%";
    const scoreCell = row.insertCell();
    if (score === null) {
      scoreCell.textContent = "—";
    } else {
      const meter = document.createElement("progress");
      meter.max = 100;
      meter.value = score;
      meter.setAttribute("aria-hidden", "true");
      const block = document.createElement("span");
      block.className = "component-score";
      block.append(meter, score.toFixed(1));
      scoreCell.append(block);
    }
    const contributionCell = row.insertCell();
    contributionCell.className = "contribution";
    contributionCell.textContent = contribution === null ? "—" : contribution.toFixed(2);
    return row;
  });
  byId("components").replaceChildren(...rows);
}

function svgElement(tag, attributes, label) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  if (label !== undefined) element.textContent = label;
  return element;
}

function drawChart(history, korea) {
  if (!history.length) return;
  const values = history.flatMap(({close, average}) => [close, average]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * .07, .1);
  const left = korea ? 87 : 57;
  const right = 741;
  const top = 15;
  const bottom = 187;
  const x = (i) => left + i * (right - left) / Math.max(history.length - 1, 1);
  const y = (value) => bottom - (value - low + padding) * (bottom - top) / (high - low + 2 * padding);
  const coordinates = (field) => history.map((point, i) => [x(i).toFixed(1), y(point[field]).toFixed(1)]);
  const close = coordinates("close");
  byId("price-line").setAttribute("points", close.map((point) => point.join(",")).join(" "));
  byId("average-line").setAttribute("points", coordinates("average").map((point) => point.join(",")).join(" "));
  const outline = close.map((point) => point.join(" ")).join(" L ");
  const lastX = x(history.length - 1);
  byId("price-area").setAttribute("d", "M " + outline + " L " + lastX + " " + bottom + " L " + left + " " + bottom + " Z");
  const grid = [];
  for (let i = 0; i < 4; i++) {
    const height = top + i * (bottom - top) / 3;
    const value = high + padding - i * (high - low + 2 * padding) / 3;
    grid.push(svgElement("line", {x1: left, x2: right, y1: height, y2: height, class: "chart-guide"}));
    const label = korea ? won.format(value) : "$" + value.toFixed(0);
    grid.push(svgElement("text", {x: left - 8, y: height + 4, "text-anchor": "end", class: "chart-label"}, label));
  }
  const dates = [0, Math.floor((history.length - 1) / 2), history.length - 1];
  for (const [index, anchor] of dates.map((value, i) => [value, ["start", "middle", "end"][i]])) {
    grid.push(svgElement("text", {x: x(index), y: 211, "text-anchor": anchor, class: "chart-label"}, history[index].date.slice(5)));
  }
  byId("chart-grid").replaceChildren(...grid);
  byId("chart").removeAttribute("hidden");
  byId("chart-empty").hidden = true;
}

function syncDateAction() {
  useMarketDate.hidden = !latestMarketDate || !sentimentDate.value || latestMarketDate === sentimentDate.value;
  if (!useMarketDate.hidden) useMarketDate.textContent = latestMarketDate + "로 날짜 맞추기";
}

function showResults(result) {
  const korea = result.market === "KR";
  const currency = korea ? won : dollar;
  const fearDate = korea ? koreaFearDate : sentimentDate;
  const fearInput = korea ? koreaFear : sentimentValue;
  byId("market-date").textContent = result.date;
  if (dateNote && result.as_of && result.as_of !== result.date) {
    dateNote.textContent = "선택한 " + result.as_of + "의 종가가 없어 " + result.date + " 종가로 계산했습니다.";
    dateNote.hidden = false;
  }
  byId("threshold").textContent = result.threshold === null ? "미설정" : result.threshold + "점";
  byId("weekly-date").textContent = result.weekly_date ? "이번 계산의 주봉 기준일은 " + result.weekly_date + "입니다." : "";
  byId("price").textContent = result.price === null ? "—" : currency.format(result.price);
  byId("high").textContent = result.high === null ? "—" : currency.format(result.high);
  byId("vix").textContent = result.vix === null ? "—" : result.vix.toFixed(2);
  if (result.mode === "live") {
    latestMarketDate = result.date;
    if (!fearDate.value || !fearInput.value) fearDate.value = result.date;
    if (!korea) syncDateAction();
  }
  if (result.total === null) {
    byId("score-status").textContent = korea ? "확인된 항목의 부분 점수" : "공포탐욕지수 입력 대기";
    if (korea) {
      byId("total").textContent = result.available_score.toFixed(2);
      byId("score-max").textContent = " / " + result.available_weight;
      byId("gauge-max").textContent = result.available_weight;
      byId("gauge-fill").setAttribute("stroke-dasharray", (result.available_score / result.available_weight * 100) + " 100");
    }
    if (result.sentiment_problem === "manual_date_mismatch") {
      setMessage("입력 날짜 " + fearDate.value + "와 가격 기준일 " + result.date
        + "이 다릅니다. 입력값이 가격 기준일의 값이면 날짜를 맞춘 뒤 다시 계산하세요.", true);
    } else if (result.sentiment_problem === "cnn_unavailable") {
      setMessage("CNN에서 " + result.date + "의 마감값을 가져오지 못했습니다. 다시 계산하거나 해당 날짜의 값을 직접 입력 또는 CSV로 넣어 주세요.");
    } else if (korea) {
      const missing = [];
      if (result.components.find(({key}) => key === "vix_dev").value === null) missing.push("V-KOSPI 200 최근 50거래일 종가");
      if (result.components.find(({key}) => key === "sentiment").value === null) missing.push(result.date + " 국내 심리값");
      setMessage("국내형 총점에 필요한 입력 · " + missing.join(" 및 "));
    } else {
      setMessage(result.date + " 기준의 공포탐욕지수를 입력해 주세요.");
    }
  } else {
    byId("total").textContent = result.total.toFixed(2);
    byId("gauge-fill").setAttribute("stroke-dasharray", result.total + " 100");
    const status = result.threshold === null
      ? (korea ? "국내형 참고 점수" : "참고 점수 · 전용 기준선 미설정")
      : result.total >= result.threshold ? "종목 기준선 이상" : "종목 기준선 미만";
    byId("score-status").textContent = status;
    if (result.mode === "live") {
      const fear = result.components.find(({key}) => key === "sentiment").value;
      setMessage(result.sentiment_source + (korea ? " · 국내 심리 " : " · 공포탐욕 ") + fear.toFixed(2) + " · " + result.date);
    } else if (result.mode === "market") {
      setMessage("자동 조회 · " + result.date + " · 종가 " + result.price_source
        + " · 변동성 " + result.volatility_source + " · 심리 " + result.sentiment_source);
    } else if (result.mode === "manual") {
      setMessage(result.total.toFixed(2) + "점 · 사용자 입력 6개 항목 · " + result.date);
      byId("chart-empty").textContent = "직접 입력 모드는 여섯 지표의 점수를 표시합니다.";
    }
  }
  drawComponents(result.components);
  drawChart(result.history, korea);
}

function syncManualSources(ticker, korea) {
  const history = new URL("https://finance.yahoo.com/quote/" + encodeURIComponent(ticker) + "/history/");
  const selectedDate = asOfInput.value;
  if (selectedDate) {
    history.searchParams.set("period1", Date.parse(selectedDate.slice(0, 4) + "-01-01") / 1000);
    history.searchParams.set("period2", Date.parse(selectedDate) / 1000 + 86400);
  }
  byId("manual-price-link").href = history.href;
  for (const link of manualPanel.querySelectorAll(".manual-chart-link")) {
    link.href = "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(chartSymbols[ticker])
      + "&interval=" + link.dataset.interval;
  }
  const volatilityLink = byId("manual-volatility-link");
  volatilityLink.href = korea ? "https://kred.dev/ko/series/KRVKOSPI"
    : "https://www.cboe.com/tradable-products/vix/vix-historical-data/";
  volatilityLink.textContent = korea ? "V-KOSPI 200 일별 값 ↗" : "VIX 일별 종가 ↗";
  byId("manual-volatility-label").textContent = korea ? "3. V-KOSPI 200 이격도 (%)" : "3. VIX 이격도 (%)";
  byId("manual-krx-hint").hidden = !korea;
  const fearLink = byId("manual-sentiment-link");
  fearLink.href = korea ? "https://scoreport.kr/fear-greed" : "https://www.cnn.com/markets/fear-and-greed";
  fearLink.textContent = korea ? "코스피 참고 지수 ↗" : "CNN 지수 ↗";
  byId("manual-sentiment-label").textContent = korea ? "6. 국내 시장 심리 (0~100)" : "6. CNN 공포탐욕지수 (0~100)";
  byId("manual-fear-us").hidden = korea;
  byId("manual-fear-kr").hidden = !korea;
}

function syncControls(values) {
  const live = values.get("mode") === "live";
  const demo = values.get("mode") === "demo";
  const manualMetrics = values.get("mode") === "manual";
  const korea = values.get("ticker") === koreaTicker;
  const usInputs = live && !korea;
  const csv = values.get("source") === "csv";
  const manual = values.get("source") === "manual";
  if (asOfInput) {
    byId("as-of-controls").hidden = demo;
    asOfInput.disabled = demo;
    asOfInput.required = manualMetrics;
    byId("as-of-help").textContent = manualMetrics ? "입력한 지표의 거래일을 선택하세요."
      : "비워 두면 최신 종가를 사용합니다. 종가가 없는 날은 이전 거래일을 사용합니다.";
  }
  if (manualPanel) {
    manualPanel.hidden = !manualMetrics;
    manualPanel.disabled = !manualMetrics;
    if (manualMetrics) syncManualSources(values.get("ticker"), korea);
  }
  if (pages) {
    byId("price-controls").hidden = !live;
    byId("us-volatility-row").hidden = korea;
  }
  byId("demo-help").hidden = !demo;
  byId("sentiment-controls").hidden = !usInputs;
  byId("korea-controls").hidden = !live || !korea;
  byId("korea-controls").disabled = !live || !korea;
  byId("soxl-note").hidden = values.get("ticker") !== "SOXL";
  byId("manual-inputs").hidden = !manual;
  byId("csv-inputs").hidden = !csv;
  sentimentValue.disabled = !usInputs || !manual;
  sentimentDate.disabled = !usInputs || !manual;
  byId("sentiment-file").disabled = !usInputs || !csv;
}

async function readUpload(id) {
  const file = byId(id).files[0];
  if (!file) return undefined;
  if (file.size > 128 * 1024) throw new Error("CSV 파일은 128KB 이하로 올려 주세요.");
  return file.text();
}

async function refresh(submitted = false) {
  pendingRequest?.abort();
  const controller = new AbortController();
  pendingRequest = controller;
  const values = new FormData(form);
  const payload = {ticker: values.get("ticker"), mode: values.get("mode")};
  const asOf = values.get("as_of");
  if (payload.mode !== "demo" && asOf) payload.as_of = asOf;
  syncControls(values);
  if (payload.mode === "manual" && !submitted) {
    clearResults(payload.ticker, payload.mode, "기준일과 여섯 지표를 입력하세요");
    setMessage("");
    submit.disabled = false;
    form.removeAttribute("aria-busy");
    return;
  }
  submit.disabled = true;
  form.setAttribute("aria-busy", "true");
  clearResults(payload.ticker, payload.mode, "계산 중");
  setMessage("");
  try {
    if (pages && payload.mode === "live") {
      payload.price_csv = await readUpload("price-file");
      if (payload.ticker !== koreaTicker) payload.volatility_csv = await readUpload("us-volatility");
    }
    if (payload.mode === "live" && payload.ticker === koreaTicker) {
      payload.volatility_csv = await readUpload("korea-volatility");
      if (koreaFear.value !== "") {
        payload.sentiment = koreaFear.valueAsNumber;
        payload.sentiment_date = koreaFearDate.value;
      }
    } else if (payload.mode === "live") {
      payload.sentiment_source = values.get("source");
      if (payload.sentiment_source === "csv") {
        payload.sentiment_csv = await readUpload("sentiment-file");
      } else if (payload.sentiment_source === "manual" && sentimentValue.value !== "") {
        payload.sentiment = sentimentValue.valueAsNumber;
        payload.sentiment_date = sentimentDate.value;
      }
    }
    let result;
    if (payload.mode === "manual") {
      const metrics = Object.fromEntries(metricInputs.map((input) => [input.name, input.valueAsNumber]));
      result = globalThis.cremaScoring.manual(payload.ticker, payload.as_of, metrics);
    } else if (pages) {
      result = await pages.request(payload, controller.signal);
    } else {
      const response = await fetch("/api/crema", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (payload.as_of && result.as_of !== payload.as_of) {
        throw new Error("이전 버전의 로컬 서버에 연결되어 있습니다. 업데이트된 계산기를 열어 다시 시도하세요.");
      }
    }
    if (pendingRequest === controller) showResults(result);
  } catch (error) {
    if (pendingRequest !== controller || error.name === "AbortError") return;
    clearResults(payload.ticker, payload.mode, "계산할 수 없음");
    const connectionError = pages ? "계산 자료를 읽을 수 없습니다. 페이지를 새로고침해 주세요."
      : "서버에 연결할 수 없습니다. 웹 계산기를 다시 실행해 주세요.";
    setMessage(error instanceof TypeError ? connectionError : error.message, true);
  } finally {
    if (pendingRequest === controller) {
      submit.disabled = false;
      form.removeAttribute("aria-busy");
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  refresh(true);
});
form.addEventListener("change", (event) => {
  if (manualPanel && !manualPanel.hidden && event.target === asOfInput) {
    const ticker = new FormData(form).get("ticker");
    syncManualSources(ticker, ticker === koreaTicker);
  }
  if (event.target.name === "ticker") {
    for (const input of metricInputs) input.value = "";
  }
  if (pages && event.target.name === "ticker") {
    byId("price-file").value = "";
    latestMarketDate = undefined;
    syncDateAction();
  }
  if (["ticker", "mode", "source"].includes(event.target.name)) refresh();
  if (pages && ["price-file", "us-volatility", "korea-volatility", "sentiment-file"].includes(event.target.id)) refresh();
  if (event.target === sentimentDate) syncDateAction();
});
useMarketDate.addEventListener("click", () => {
  sentimentDate.value = latestMarketDate;
  syncDateAction();
});
refresh();
