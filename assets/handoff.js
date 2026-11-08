"use strict";

// A same-tab round trip through the user's localhost. The return data lives in a URL fragment.
(() => {
  const publicPage = "https://zangangel.github.io/crema-index-web/";
  const storageKey = "crema-local-request";
  const ports = new Set(["8765", "8766"]);
  const tokenPattern = /^[0-9a-f-]{36}$/;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const tickers = globalThis.cremaScoring.thresholds;

  function start(ticker, day, port) {
    if (!Object.hasOwn(tickers, ticker) || !ports.has(port) || (day && !datePattern.test(day))) {
      throw new Error("종목, 계산 기준일과 로컬 포트를 확인해 주세요.");
    }
    const token = crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({token, ticker, day, time: Date.now()}));
    const target = new URL("http://127.0.0.1:" + port + "/");
    target.searchParams.set("crema", token);
    target.searchParams.set("ticker", ticker);
    if (day) target.searchParams.set("date", day);
    location.assign(target.href);
  }

  function localRequest() {
    if (location.hostname !== "127.0.0.1" || !ports.has(location.port)) return null;
    const params = new URLSearchParams(location.search);
    const token = params.get("crema");
    const ticker = params.get("ticker");
    const day = params.get("date");
    if (!tokenPattern.test(token) || !Object.hasOwn(tickers, ticker) || (day && !datePattern.test(day))) return null;
    return {token, ticker, day};
  }

  function returnValues(request, result) {
    const target = new URL(publicPage);
    const metrics = Object.fromEntries((result?.components ?? [])
      .filter(({value}) => Number.isFinite(value))
      .map(({key, value}) => [key, value]));
    target.hash = new URLSearchParams({crema: JSON.stringify({
      token: request.token, ticker: request.ticker, day: result?.date ?? request.day, metrics,
      unavailable: !result,
    })}).toString();
    location.replace(target.href);
  }

  function takeValues() {
    const fragment = new URLSearchParams(location.hash.slice(1)).get("crema");
    if (!fragment) return null;
    history.replaceState(history.state, "", location.pathname + location.search);
    try {
      const request = JSON.parse(sessionStorage.getItem(storageKey));
      sessionStorage.removeItem(storageKey);
      const result = JSON.parse(fragment);
      if (!request || Date.now() - request.time > 300000 || result.token !== request.token ||
          result.ticker !== request.ticker || !Object.hasOwn(tickers, result.ticker) ||
          !result.metrics || typeof result.metrics !== "object") return null;
      if (result.unavailable ? result.day !== (request.day || null) : !datePattern.test(result.day)) return null;
      return {...result, requested: request.day};
    } catch {
      return null;
    }
  }

  globalThis.cremaHandoff = {start, localRequest, returnValues, takeValues};
})();
