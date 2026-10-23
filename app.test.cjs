const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");

const source = readFileSync(`${__dirname}/app.js`, "utf8");

function start(mode = "ready", responses = []) {
  const status = { textContent: "Loading map..." };
  const elements = {
    "#map-status": status,
    "form": { addEventListener(event, handler) { this.submit = handler; }, setAttribute(name, value) { this[name] = value; } },
    "#location": { value: "Khartoum" },
    "#api-key": { value: "test-key" },
    "button": { disabled: true, setAttribute(name, value) { this[name] = value; } },
    "#search-status": { textContent: "", dataset: {} },
    "#spinner": { hidden: true },
  };
  const requests = [];
  const views = [];
  let popup;
  const events = {};
  const map = {
    setView(center, zoom) {
      views.push(Array.from(center));
      assert.equal(zoom, 11);
      return this;
    },
    openPopup(content, center) { popup = { content, center: Array.from(center) }; },
  };
  let attached = false;
  const L = {
    map(id) {
      assert.equal(id, "map");
      if (mode === "broken") throw new Error("Map setup failed");
      return map;
    },
    tileLayer(url, options) {
      assert.equal(url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
      assert.equal(options.maxZoom, 19);
      assert.ok(options.attribution.includes("https://www.openstreetmap.org/copyright"));
      return {
        on(event, handler) { events[event] = handler; },
        addTo(target) {
          assert.equal(target, map);
          assert.equal(typeof events.tileerror, "function");
          assert.equal(typeof events.load, "function");
          attached = true;
        },
      };
    },
  };
  runInNewContext(source, {
    window: { L: mode === "missing" ? undefined : L },
    L,
    URLSearchParams,
    AbortSignal,
    TypeError,
    SyntaxError,
    fetch: async (url) => {
      requests.push(new URL(url));
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return { ok: true, status: 200, json: async () => response, ...response?.http };
    },
    document: {
      querySelector: (selector) => elements[selector],
      createElement: () => ({ textContent: "", style: {} }),
    },
  });
  return { status, events, attached, elements, requests, views, get popup() { return popup; } };
}

const ready = start();
assert.ok(ready.attached);
assert.deepEqual(ready.views[0], [15.5007, 32.5599]);
ready.events.load();
assert.equal(ready.status.textContent, "");
ready.events.tileerror();
assert.match(ready.status.textContent, /tiles could not load/);
ready.events.load();
assert.match(ready.status.textContent, /tiles could not load/);
const failedFirst = start();
failedFirst.events.tileerror();
failedFirst.events.load();
assert.match(failedFirst.status.textContent, /tiles could not load/);
const missing = start("missing");
assert.equal(missing.attached, false);
assert.match(missing.status.textContent, /map could not load/);
assert.match(start("broken").status.textContent, /map could not start/);
async function checkSearch() {
  const city = { name: "Khartoum", country: "SD", lat: 15.5, lon: 32.5 };
  const weather = { main: { temp: 30, humidity: 25 }, weather: [{ description: "clear sky" }], wind: { speed: 3 } };
  const app = start("ready", [[city], weather, [city], weather]);
  assert.equal(app.elements.button.disabled, false, "search must be enabled after map setup");
  const search = () => app.elements.form.submit({ preventDefault() {} });
  const pending = search();
  assert.equal(app.elements.button.disabled, true);
  assert.equal(app.elements["#spinner"].hidden, false);
  assert.equal(app.elements.button["aria-busy"], "true");
  assert.equal(app.elements.form["aria-busy"], undefined);
  await search();
  assert.equal(app.requests.length, 1, "ignore duplicate submissions while loading");
  await pending;
  assert.equal(app.requests[0].pathname, "/geo/1.0/direct");
  assert.equal(app.requests[0].searchParams.get("q"), "Khartoum");
  assert.equal(app.requests[1].searchParams.get("lat"), "15.5");
  assert.equal(app.requests[1].searchParams.get("units"), "metric");
  assert.equal(app.requests[1].searchParams.get("appid"), "test-key");
  assert.deepEqual(app.views.at(-1), [15.5, 32.5]);
  assert.match(app.popup.content.textContent, /Khartoum.*30 °C.*clear sky.*25%.*3 m\/s/s);
  assert.equal(app.popup.content.style.whiteSpace, undefined, "popup styling must stay in CSS");
  assert.equal(app.elements.form["aria-busy"], undefined, "loading announcements must remain outside the busy element");
  assert.equal(app.elements.button["aria-busy"], "false");
  assert.equal(app.elements.button.disabled, false);
  assert.equal(app.elements["#spinner"].hidden, true);
  await search();
  assert.equal(app.requests.length, 4, "a later search must work");

  for (const [responses, message] of [
    [[[]], /No city found/],
    [[{ http: { ok: false, status: 401 } }], /API key/],
    [[{ http: { ok: false, status: 429 } }], /limit/],
    [[{ http: { ok: false, status: 500 } }], /unavailable/],
    [[new TypeError("offline")], /connection/],
    [[Object.assign(new Error(), { name: "TimeoutError" })], /timed out/],
    [[[{ ...city, lat: 999 }]], /invalid/],
    [[[city], {}], /invalid/],
    [[[city], new TypeError("offline")], /connection/],
    [[{ http: { json: async () => { throw new SyntaxError("bad JSON"); } } }], /connection/],
    [[null], /invalid/],
    [[[null]], /invalid/],
    [[[{ ...city, lat: "15.5" }]], /invalid/],
    [[[city], { ...weather, main: { temp: 30, humidity: 101 } }], /invalid/],
    [[[city], { ...weather, wind: { speed: -1 } }], /invalid/],
  ]) {
    const failed = start("ready", responses);
    await failed.elements.form.submit({ preventDefault() {} });
    assert.match(failed.elements["#search-status"].textContent, message);
    assert.equal(failed.elements.button.disabled, false);
    assert.equal(failed.elements["#spinner"].hidden, true);
    assert.equal(failed.elements.button["aria-busy"], "false");
    assert.equal(failed.popup, undefined);
    assert.equal(failed.elements["#search-status"].dataset.state, "error");
  }
  for (const selector of ["#location", "#api-key"]) {
    const empty = start();
    empty.elements[selector].value = "   ";
    await empty.elements.form.submit({ preventDefault() {} });
    assert.equal(empty.requests.length, 0);
    assert.match(empty.elements["#search-status"].textContent, /Enter/);
  }
  const safe = start("ready", [[{ ...city, name: "<img src=x onerror=alert(1)>" }], weather]);
  await safe.elements.form.submit({ preventDefault() {} });
  assert.match(safe.popup.content.textContent, /<img/);
  assert.equal(safe.popup.content.innerHTML, undefined, "API text must not become HTML");

  const nextCity = { name: "الخرطوم & London,GB", country: "SD", lat: 0, lon: 0 };
  const recovery = start("ready", [
    [city], weather, [], [nextCity],
    { main: { temp: 0, humidity: 0 }, weather: [{ description: "clear sky" }], wind: { speed: 0 } },
  ]);
  const retry = () => recovery.elements.form.submit({ preventDefault() {} });
  await retry();
  const previous = recovery.popup;
  recovery.elements["#location"].value = "missing city";
  await retry();
  assert.equal(recovery.popup, previous, "failed searches must keep the previous weather result");
  assert.deepEqual(recovery.views.at(-1), [15.5, 32.5], "failed searches must not move the map");
  recovery.elements["#location"].value = `  ${nextCity.name}  `;
  await retry();
  assert.equal(recovery.requests[3].searchParams.get("q"), nextCity.name);
  assert.deepEqual(recovery.popup.center, [0, 0]);
  assert.match(recovery.popup.content.textContent, /0 °C.*0%.*0 m\/s/s);
  assert.equal(recovery.elements["#search-status"].dataset.state, "ready");
  assert.equal(missing.elements.button.disabled, true);
  assert.equal(start("broken").elements.button.disabled, true);
  console.log("PASS: map setup and failures; weather search, units, loading, repeat submissions, validation, HTTP/network errors and safe popup text.");
}
checkSearch().catch((error) => { console.error(error); process.exitCode = 1; });
