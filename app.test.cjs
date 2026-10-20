const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");

const source = readFileSync(`${__dirname}/app.js`, "utf8");

function start(mode = "ready") {
  const status = { textContent: "Loading map..." };
  const events = {};
  const map = {
    setView(center, zoom) {
      assert.deepEqual(Array.from(center), [15.5007, 32.5599]);
      assert.equal(zoom, 11);
      return this;
    },
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
    document: { querySelector: () => status },
  });
  return { status, events, attached };
}

const ready = start();
assert.ok(ready.attached);
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
console.log("PASS: map setup, attribution, loading state, tile failures, missing library and startup failure.");
