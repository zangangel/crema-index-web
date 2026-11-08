"use strict";

// Browser scoring shared by the manual and public CSV modes.
(() => {
  const koreaTicker = "122630.KS";
  const thresholds = {SPY: 40, QQQ: 60, TQQQ: 50, SOXL: null, [koreaTicker]: null};

  function components(values, korea) {
    const {drawdown, rsi_weekly, vix_dev, dist_200, rsi_daily, sentiment} = values;
    return [
      ["drawdown", "연중 고점 대비 낙폭", .30, drawdown, drawdown / 12 * 100],
      ["rsi_weekly", "주간 RSI", .20, rsi_weekly, (70 - rsi_weekly) / 40 * 100],
      ["vix_dev", korea ? "V-KOSPI 200 이격도" : "VIX 이격도", .15, vix_dev, (vix_dev + 10) / 50 * 100],
      ["dist_200", "200일선 이격도", .15, dist_200, (12 - dist_200) / 24 * 100],
      ["rsi_daily", "일간 RSI", .10, rsi_daily, (70 - rsi_daily) / 40 * 100],
      ["sentiment", korea ? "국내 시장 심리" : "공포탐욕지수", .10, sentiment, 100 - sentiment],
    ].map(([key, label, weight, value, raw]) => {
      const score = value === null ? null : Math.max(0, Math.min(100, raw));
      return {key, label, weight, value, score, contribution: score === null ? null : score * weight};
    });
  }

  function total(rows) {
    const sum = rows.reduce((score, row) => score + row.contribution, 0);
    return Math.round(sum * 1e12) / 1e12;
  }

  function manual(ticker, day, values) {
    if (!Object.hasOwn(thresholds, ticker)) throw new Error("지원 종목을 선택해 주세요.");
    const time = Date.parse(day + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) {
      throw new Error("입력값의 종가 기준일을 선택해 주세요.");
    }
    const weekday = new Date(time).getUTCDay();
    if (weekday === 0 || weekday === 6) throw new Error("실제 종가가 기록된 평일을 기준일로 선택해 주세요.");
    const korea = ticker === koreaTicker;
    const rows = components(values, korea);
    if (rows.some(({value}) => !Number.isFinite(value))) throw new Error("여섯 항목의 숫자를 모두 입력해 주세요.");
    for (const {key, label, value} of rows) {
      const percent = key === "vix_dev" || key === "dist_200";
      if (percent ? value < -100 : value < 0 || value > 100) {
        throw new Error(label + (percent ? "는 -100 이상의 퍼센트 숫자를 입력해 주세요." : "는 0~100 사이의 숫자를 입력해 주세요."));
      }
    }
    return {mode: "manual", ticker, market: korea ? "KR" : "US", date: day,
      total: total(rows), threshold: thresholds[ticker], components: rows,
      weekly_date: null, price: null, high: null, vix: null, history: []};
  }

  globalThis.cremaScoring = {koreaTicker, thresholds, components, total, manual};
})();
