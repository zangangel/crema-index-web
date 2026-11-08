"use strict";

const byId = (id) => document.getElementById(id);
const axes = [
  ["drawdown", "고점 대비 하락", "%"],
  ["rsi_weekly", "주간 RSI", ""],
  ["rsi_daily", "일간 RSI", ""],
  ["vix_dev", "VIX", "%"],
  ["dist_200", "200일선", "%"],
  ["sentiment", "공포탐욕", ""],
];
const format = (value) => value.toFixed(2);
const signed = (value) => (value >= 0 ? "+" : "−") + format(Math.abs(value));
const range = (entry) => format(entry.lower) + "–" + format(entry.upper);

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function svg(tag, attributes, label) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (label) node.textContent = label;
  return node;
}

function link(label, url) {
  const node = element("a", label);
  node.href = url;
  node.target = "_blank";
  node.rel = "noopener";
  return node;
}

function radarPoint(index, score) {
  const angle = index * Math.PI / 3 - Math.PI / 2;
  const radius = 133 * score / 100;
  return [220 + Math.cos(angle) * radius, 177 + Math.sin(angle) * radius];
}

function drawRadar(entry) {
  const points = (values) => values.map((value, i) => value === null ? null : radarPoint(i, value).join(",")).filter(Boolean).join(" ");
  const rings = [25, 50, 75, 100].map((score) => svg("polygon", {
    points: points(axes.map(() => score)), class: "radar-grid",
  }));
  const spokes = axes.map((_, i) => {
    const [x, y] = radarPoint(i, 100);
    return svg("line", {x1: 220, y1: 177, x2: x, y2: y, class: "radar-axis"});
  });
  const labels = axes.map(([key, label], i) => {
    const [x, y] = radarPoint(i, 123);
    return svg("text", {x, y: y + 5, "text-anchor": "middle", class: "radar-label"},
      entry.components[key].score === null ? label + " · 미확인" : label);
  });
  const shapes = [];
  if (entry.video_components) {
    shapes.push(svg("polygon", {
      points: points(axes.map(([key]) => entry.video_components[key])), class: "radar-video",
    }));
  }
  const complete = entry.total !== null;
  const overlay = entry.video_components ? " radar-overlay" : "";
  const partial = complete ? "" : " radar-partial";
  shapes.push(svg(complete ? "polygon" : "polyline", {
    points: points(axes.map(([key]) => entry.components[key].score)),
    class: "radar-calc" + overlay + partial,
  }));
  byId("radar-grid").replaceChildren(...rings, ...spokes);
  byId("radar-shape").replaceChildren(...shapes);
  byId("radar-labels").replaceChildren(...labels);
  byId("video-legend").hidden = !entry.video_components;
  byId("radar-note").textContent = complete ? "" : "공포탐욕 제외";
}

function drawComponents(entry) {
  const rows = axes.map(([key, label, unit]) => {
    const part = entry.components[key];
    const row = document.createElement("tr");
    const name = element("th", label);
    name.scope = "row";
    row.append(name);
    row.insertCell().textContent = part.value === null ? "미확인" : format(part.value) + unit;
    row.insertCell().textContent = (part.weight * 100).toFixed(0) + "%";
    row.insertCell().textContent = entry.video_components?.[key] ?? "—";
    row.insertCell().textContent = part.score === null ? "—" : format(part.score);
    row.insertCell().textContent = part.score === null ? "—" : format(part.score * part.weight);
    return row;
  });
  byId("verification-components").replaceChildren(...rows);
}

function showCase(entry, sources) {
  const hasTotal = entry.total !== null;
  byId("case-title").textContent = "TQQQ 특이점지수 " + entry.reference + "점";
  byId("case-date").textContent = entry.date + " 미국장 종가" + (entry.date === "2026-10-09" ? " · ‘일주일 전’에서 역산" : "");
  byId("video-score").replaceChildren(document.createTextNode(String(entry.reference)), element("small", "점"));
  const actual = byId("calculated-score");
  actual.replaceChildren(document.createTextNode(hasTotal ? format(entry.total) : range(entry)), element("small", "점"));
  actual.classList.toggle("is-range", !hasTotal);
  byId("score-delta").textContent = hasTotal
    ? "차이 " + signed(entry.total - entry.reference) + "점 · 정수 반올림 " + entry.rounded + "점"
    : "심리 마감값 미확인 · 가능한 점수 범위";
  byId("case-market").textContent = "TQQQ $" + format(entry.price) + " · 연중 고점 대비 −" + format(entry.drawdown) + "% · VIX " + format(entry.vix);
  const fear = byId("case-fear");
  fear.textContent = hasTotal ? "공포탐욕 원점수 " + format(entry.fear) + " · " : "공포탐욕 마감값을 확인할 수 없어 범위로 표시했습니다.";
  if (entry.fear_source) fear.append(link(entry.fear_kind, entry.fear_source));

  const note = byId("case-note");
  if (entry.video_components) {
    note.textContent = "영상의 여섯 항목을 가중합하면 " + format(entry.video_weighted_total)
      + "점입니다. 웹 계산기에 영상의 심리 원점수 30과 VIX 환산 79점을 함께 적용하면 "
      + format(entry.with_video_fear_and_vix_total) + "점으로, 정수 반올림 시 73점입니다.";
    note.append(document.createElement("br"), link("후속편 계산 예시 ↗", sources.example));
  } else if (entry.date === "2026-03-27") {
    note.textContent = "직전 주 RSI를 대신 적용하면 " + format(entry.previous_week_total)
      + "점입니다. 95점에 가까워지지만 영상의 주봉 적용 시점과 여섯 원값은 공개 자료에서 확인되지 않았습니다.";
  } else if (!hasTotal) {
    note.textContent = "가격·VIX 다섯 항목을 고정하고 심리 기여도를 0~10점으로 바꾼 범위입니다. "
      + "영상 점수와 일치하려면 필요한 심리 원점수는 " + format(entry.implied_fear) + "입니다.";
  } else {
    note.textContent = entry.date === "2026-10-09"
      ? "영상은 이 날짜를 ‘일주일 전’이라고만 언급합니다. 10월 16일에서 7일을 뺀 10월 9일을 대조했습니다."
      : "당일 확인된 심리값과 가격·VIX로 계산했습니다. 영상의 당일 세부 입력값과 비교할 수 있는 자료는 확인되지 않았습니다.";
  }
  for (const button of document.querySelectorAll(".case-tabs button")) {
    button.setAttribute("aria-pressed", String(button.dataset.case === entry.date));
  }
  drawRadar(entry);
  drawComponents(entry);
}

function drawLedger(records) {
  const complete = records.filter(({total}) => total !== null);
  const matches = complete.filter((entry) => entry.rounded === entry.reference).length;
  byId("ledger-verification").textContent = "21건 중 " + complete.length + "건의 총점을 재계산했습니다. 정수 반올림 기준 "
    + matches + "건 일치 · " + (complete.length - matches) + "건 차이 · " + (records.length - complete.length) + "건 심리값 미확인.";
  const tables = [records.slice(0, 11), records.slice(11)].map((group) => {
    const panel = element("div", undefined, "video-panel");
    const table = document.createElement("table");
    const header = table.createTHead().insertRow();
    for (const label of ["매수일", "영상 점수", "계산기", "1년 뒤", "2년 뒤"]) {
      const cell = element("th", label);
      cell.scope = "col";
      header.append(cell);
    }
    const body = table.createTBody();
    for (const entry of group) {
      const row = body.insertRow();
      const button = element("button", entry.date);
      button.type = "button";
      button.dataset.case = entry.date;
      row.insertCell().append(button);
      row.insertCell().textContent = entry.reference;
      const comparison = row.insertCell();
      if (entry.total === null) {
        comparison.append(element("small", range(entry)));
      } else {
        comparison.append(document.createTextNode(format(entry.total)), element("small", signed(entry.total - entry.reference)));
      }
      for (const value of entry.returns) {
        const cell = row.insertCell();
        cell.textContent = value === null ? "—" : (value >= 0 ? "+" : "−") + Math.abs(value) + "%";
        cell.className = value === null ? "" : value >= 0 ? "positive" : "negative";
      }
    }
    panel.append(table);
    return panel;
  });
  byId("ledger-tables").replaceChildren(...tables);
}

function drawMarch(entry, prices) {
  const first = prices.findIndex(({date}) => date === entry.date);
  const second = prices.findIndex(({date}) => date === "2026-03-30");
  const bottom = prices[second].close;
  const move = (bottom / prices[first].close - 1) * 100;
  byId("march-caption").textContent = "영상 95점 · 계산기 " + format(entry.total) + "점 · 수정종가 $" + format(entry.price);
  byId("march-summary").textContent = "3월 30일 수정종가 $" + format(bottom) + " · 3월 27일 대비 " + signed(move) + "%";

  const high = Math.ceil((Math.max(...prices.map(({close}) => close)) + 4) / 10) * 10;
  const low = Math.floor((Math.min(...prices.map(({close}) => close)) - 4) / 10) * 10;
  const x = (i) => 54 + (i / (prices.length - 1)) * 608;
  const y = (value) => 217 - ((value - low) / (high - low)) * 192;
  const grid = [];
  for (let value = 40; value <= 80; value += 20) {
    const height = y(value);
    grid.push(svg("line", {x1: 54, x2: 662, y1: height, y2: height, class: "chart-guide"}));
    grid.push(svg("text", {x: 45, y: height + 5, "text-anchor": "end", class: "march-label"}, "$" + value));
  }
  for (const [prefix, label] of [["2025-12", "12월"], ["2026-02", "26년 2월"], ["2026-06", "26년 6월"]]) {
    const i = prices.findIndex(({date}) => date.startsWith(prefix));
    grid.push(svg("text", {x: x(i), y: 258, "text-anchor": "middle", class: "march-label"}, label));
  }
  byId("march-grid").replaceChildren(...grid);
  byId("march-line").replaceChildren(svg("polyline", {
    points: prices.map(({close}, i) => x(i).toFixed(1) + "," + y(close).toFixed(1)).join(" "), class: "march-line",
  }));
  const markers = [];
  for (const [i, label, color, dx, dy, anchor] of [
    [first, "3/27 · 영상 95점", "#f3cf64", -7, -16, "end"],
    [second, "3/30 · 저점", "#ff8098", 8, 22, "start"],
  ]) {
    const position = y(prices[i].close);
    markers.push(svg("circle", {cx: x(i), cy: position, r: 6, fill: color, stroke: "#161b22", "stroke-width": 2}));
    markers.push(svg("text", {x: x(i) + dx, y: position + dy, fill: color, "text-anchor": anchor, class: "march-marker-label"}, label));
  }
  byId("march-markers").replaceChildren(...markers);
}

function writeFindings(october, march, snapshot) {
  const findings = [
    ["10월 16일 · 심리 입력", "영상의 심리 환산 70점은 원점수 30입니다. CNN 일별 원자료 "
      + format(october.fear) + "를 쓰면 심리 기여도가 7.00점에서 " + format((100 - october.fear) * .1)
      + "점으로 올라갑니다. VIX 환산도 영상 79점과 계산기 " + format(october.components.vix_dev.score) + "점으로 차이가 있습니다."],
    ["3월 27일 · 주봉 시점", "당일 완료 주봉 RSI " + format(march.components.rsi_weekly.value)
      + "로는 " + format(march.total) + "점입니다. 직전 완료 주봉 RSI " + format(march.previous_week_rsi)
      + "를 적용하면 " + format(march.previous_week_total) + "점입니다. 영상이 사용한 주봉 시점은 확인되지 않았습니다."],
    ["3월 27일 · 고점 기간", "수정종가는 영상과 같은 $" + format(march.price) + "입니다. 연초 이후 고점 대비 −"
      + format(march.drawdown) + "%, 최근 252거래일 고점 대비 −" + format(march.rolling_drawdown)
      + "%입니다. 영상의 −35%는 후자에 가깝지만 두 낙폭 모두 점수 상한인 100에 도달합니다."],
    ["대조 기준", "웹앱의 연초 이후 최고 수정종가, Wilder 14일·14주 RSI와 당일을 포함한 VIX 50거래일 평균을 사용했습니다. "
      + "영상의 TQQQ 매수 사례는 90점 기준이며, 심리값을 확보한 날짜만 총점을 표기했습니다."],
  ];
  byId("method-findings").replaceChildren(...findings.map(([heading, body]) => {
    const paragraph = document.createElement("p");
    paragraph.append(element("strong", heading), document.createTextNode(" · " + body));
    return paragraph;
  }));
  byId("verified-at").textContent = "원자료 대조일 " + snapshot.verified_at + " · CNN 날짜별 데이터 시작 " + snapshot.coverage + " · 이전 구간은 확인된 CNNMoney 보존본 사용";
}

async function loadVerification() {
  try {
    const response = await fetch("./assets/video-verification.json");
    if (!response.ok) throw new Error("검증 자료를 불러올 수 없습니다.");
    const snapshot = await response.json();
    const allDates = new Map([...snapshot.records, ...snapshot.highlights].map((entry) => [entry.date, entry]));
    const october = allDates.get("2026-10-16");
    const march = allDates.get("2026-03-27");
    drawLedger(snapshot.records);
    if (snapshot.march_prices) {
      drawMarch(march, snapshot.march_prices);
    } else {
      byId("march-chart").setAttribute("hidden", "");
      byId("march-caption").textContent = "영상 95점 · 계산기 " + format(march.total) + "점 · 수정종가 $" + format(march.price);
      byId("march-summary").textContent = "3월 30일 수정종가 $" + format(snapshot.march_bottom) + " · 3월 27일 대비 "
        + signed((snapshot.march_bottom / march.price - 1) * 100) + "%";
    }
    writeFindings(october, march, snapshot);
    showCase(october, snapshot.sources);
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-case]");
      if (!button) return;
      showCase(allDates.get(button.dataset.case), snapshot.sources);
      if (button.closest("#ledger")) byId("case-title").focus();
    });
    for (const id of ["verification-content", "ledger", "march", "method-check"]) byId(id).hidden = false;
    byId("verification-status").hidden = true;
  } catch (error) {
    console.error(error);
    byId("verification-status").textContent = "검증 자료를 불러올 수 없습니다. 페이지를 새로고침해 주세요.";
  }
}

loadVerification();
