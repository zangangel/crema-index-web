"use strict";

// Browser equivalent of crema.web.build_result for visitor-provided CSVs.
(() => {
  const koreaTicker = "122630.KS";
  const thresholds = {SPY: 40, QQQ: 60, TQQQ: 50, SOXL: null, [koreaTicker]: null};
  const dayMs = 86400000;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const dateString = (time) => new Date(time).toISOString().slice(0, 10);

  function parseDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(time) && dateString(time) === value ? time : NaN;
  }

  function readSeries(csv, column, label) {
    const rows = (csv ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((row) => row.trim());
    const split = (row) => row.split(",").map((value) => value.trim().replace(/^"([^"]*)"$/, "$1"));
    const header = split(rows.shift() ?? "");
    const dateIndex = header.indexOf("Date");
    const valueIndex = header.indexOf(column);
    if (dateIndex < 0 || valueIndex < 0 || !rows.length || new Set(header).size !== header.length) {
      throw new Error(label + " CSV에 Date," + column + " 열과 데이터를 넣어 주세요.");
    }
    const sentiment = column === "FearGreed";
    const values = new Map();
    for (const row of rows) {
      const fields = split(row);
      const date = fields[dateIndex];
      const time = parseDay(date);
      const weekday = new Date(time).getUTCDay();
      const raw = fields[valueIndex];
      const value = Number(raw);
      const invalidNumber = !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw ?? "") || !Number.isFinite(value);
      if (fields.length !== header.length || !Number.isFinite(time) || values.has(date) || invalidNumber ||
          (sentiment ? value < 0 || value > 100 : value <= 0 || weekday === 0 || weekday === 6)) {
        throw new Error(label + " CSV의 날짜·값을 확인하세요. 날짜는 중복 없이 YYYY-MM-DD 형식이어야 하며, " +
          (sentiment ? "심리값은 0~100입니다." : "종가는 양수이고 거래일은 평일입니다."));
      }
      values.set(date, value);
    }
    return values;
  }

  function wilderRsi(closes) {
    const period = 14;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const up = Math.max(0, change);
      const down = Math.max(0, -change);
      if (i <= period) {
        gain += up / period;
        loss += down / period;
      } else {
        gain = (gain * (period - 1) + up) / period;
        loss = (loss * (period - 1) + down) / period;
      }
    }
    return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }

  function manualFear(payload, day) {
    if (payload.sentiment === undefined) return {value: null, source: null, problem: null};
    if (!Number.isFinite(payload.sentiment) || payload.sentiment < 0 || payload.sentiment > 100) {
      throw new Error("공포탐욕지수는 0부터 100 사이의 숫자를 입력하세요.");
    }
    if (!payload.sentiment_date) return {value: null, source: null, problem: null};
    if (!Number.isFinite(parseDay(payload.sentiment_date))) {
      throw new Error("공포탐욕지수 기준일을 YYYY-MM-DD로 입력하세요.");
    }
    if (payload.sentiment_date !== day) return {value: null, source: null, problem: "manual_date_mismatch"};
    return {value: payload.sentiment, source: "직접 입력", problem: null};
  }

  function calculate(payload) {
    const {ticker, mode} = payload;
    const korea = ticker === koreaTicker;
    if (!Object.hasOwn(thresholds, ticker) || mode !== "live") throw new Error("지원 종목과 데이터 모드를 선택하세요.");
    if (!payload.price_csv) throw new Error("선택한 종목의 일봉 CSV를 선택해 주세요.");
    const prices = readSeries(payload.price_csv, "Close", "ETF 일봉");
    const dates = Array.from(prices.keys()).sort();
    const closes = dates.map((date) => prices.get(date));
    if (dates.length < 200) throw new Error("200일선 계산에 필요한 최소 200거래일의 종가를 넣어 주세요.");
    const day = dates.at(-1);
    const price = closes.at(-1);
    const high = dates.reduce((peak, date) => date.slice(0, 4) === day.slice(0, 4) ? Math.max(peak, prices.get(date)) : peak, 0);
    const weekly = new Map();
    for (const date of dates) {
      const time = parseDay(date);
      const friday = dateString(time + (5 - new Date(time).getUTCDay()) * dayMs);
      if (friday <= day) weekly.set(friday, prices.get(date));
    }
    const weeklyDate = Array.from(weekly.keys()).at(-1);
    const history = dates.slice(Math.max(199, dates.length - 60)).map((date, offset) => {
      const i = Math.max(199, dates.length - 60) + offset;
      return {date, close: closes[i], average: mean(closes.slice(i - 199, i + 1))};
    });
    const volatility = payload.volatility_csv
      ? readSeries(payload.volatility_csv, "Close", korea ? "V-KOSPI 200" : "VIX")
      : new Map();
    const alignedVix = dates.slice(-50).map((date) => volatility.get(date));
    const vix = alignedVix.at(-1) ?? null;
    const vixDev = alignedVix.every(Number.isFinite) ? (vix / mean(alignedVix) - 1) * 100 : null;
    if (vixDev === null && !korea) throw new Error("VIX CSV에 ETF의 최근 50거래일과 날짜가 일치하는 종가를 넣어 주세요.");
    const fear = payload.sentiment_csv
      ? {value: readSeries(payload.sentiment_csv, "FearGreed", "심리").get(day) ?? null, source: "CSV 입력", problem: null}
      : manualFear(payload, day);
    const drawdown = (1 - price / high) * 100;
    const weeklyRsi = wilderRsi(Array.from(weekly.values()));
    const dailyRsi = wilderRsi(closes);
    const dist = (price / history.at(-1).average - 1) * 100;
    const components = [
      ["drawdown", "연중 고점 대비 낙폭", .30, drawdown, drawdown / 12 * 100],
      ["rsi_weekly", "주간 RSI", .20, weeklyRsi, (70 - weeklyRsi) / 40 * 100],
      ["vix_dev", korea ? "V-KOSPI 200 이격도" : "VIX 이격도", .15, vixDev, (vixDev + 10) / 50 * 100],
      ["dist_200", "200일선 이격도", .15, dist, (12 - dist) / 24 * 100],
      ["rsi_daily", "일간 RSI", .10, dailyRsi, (70 - dailyRsi) / 40 * 100],
      ["sentiment", korea ? "국내 시장 심리" : "공포탐욕지수", .10, fear.value, 100 - fear.value],
    ].map(([key, label, weight, value, raw]) => {
      const score = value === null ? null : Math.max(0, Math.min(100, raw));
      return {key, label, weight, value, score, contribution: score === null ? null : score * weight};
    });
    const available = components.filter(({score}) => score !== null);
    const availableScore = available.reduce((sum, {contribution}) => sum + contribution, 0);
    return {
      mode, ticker, market: korea ? "KR" : "US", date: day, weekly_date: weeklyDate,
      price, high, vix, history, components, threshold: thresholds[ticker],
      total: available.length === components.length ? Math.round(availableScore * 1e12) / 1e12 : null,
      available_score: availableScore,
      available_weight: Math.round(available.reduce((sum, {weight}) => sum + weight, 0) * 100),
      sentiment_source: fear.value === null ? null : fear.source, sentiment_problem: fear.problem,
    };
  }

  async function request(payload, signal) {
    if (payload.mode !== "demo") return calculate(payload);
    const response = await fetch("./assets/demo.json", {signal});
    if (!response.ok) throw new Error("데모 데이터를 불러오지 못했습니다.");
    return (await response.json())[payload.ticker];
  }

  globalThis.cremaPages = {calculate, request};
})();
