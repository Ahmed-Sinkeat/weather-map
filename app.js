const mapStatus = document.querySelector("#map-status");
const form = document.querySelector("form");
const locationInput = document.querySelector("#location");
const keyInput = document.querySelector("#api-key");
const searchButton = document.querySelector("button");
const searchStatus = document.querySelector("#search-status");
const spinner = document.querySelector("#spinner");
let map;

if (!window.L) {
  mapStatus.textContent = "The map could not load. Check your connection and reload the page.";
} else {
  try {
    map = L.map("map").setView([15.5007, 32.5599], 11);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    tiles.on("tileerror", () => {
      mapStatus.textContent = "Some map tiles could not load. Check your connection and reload the page.";
    });
    tiles.on("load", () => {
      if (mapStatus.textContent === "Loading map...") mapStatus.textContent = "";
    });
    tiles.addTo(map);
    searchButton.disabled = false;
  } catch {
    map = undefined;
    mapStatus.textContent = "The map could not start. Reload the page to try again.";
  }
}

async function request(path, params) {
  const response = await fetch(`https://api.openweathermap.org/${path}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new Error("Check your OpenWeatherMap API key; it may be invalid or not active yet.");
  if (response.status === 429) throw new Error("OpenWeatherMap request limit reached. Try again later.");
  if (!response.ok) throw new Error("Weather service is unavailable. Try again later.");
  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!map || searchButton.disabled) return;
  const city = locationInput.value.trim();
  const appid = keyInput.value.trim();
  if (!city || !appid) {
    searchStatus.dataset.state = "error";
    searchStatus.textContent = "Enter a city and your OpenWeatherMap API key.";
    return;
  }

  searchButton.disabled = true;
  spinner.hidden = false;
  searchButton.setAttribute("aria-busy", "true");
  searchStatus.dataset.state = "loading";
  searchStatus.textContent = "Loading weather...";
  try {
    const locations = await request("geo/1.0/direct", { q: city, limit: 1, appid });
    if (!Array.isArray(locations)) throw new Error("Weather service returned invalid location data.");
    if (!locations.length) throw new Error("No city found. Check the spelling or add a country code, e.g. London,GB.");
    const { lat, lon, name, country } = locations[0] ?? {};
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 || typeof name !== "string") {
      throw new Error("Weather service returned invalid location data.");
    }
    const weather = await request("data/2.5/weather", { lat, lon, units: "metric", appid });
    const temperature = weather?.main?.temp;
    const humidity = weather?.main?.humidity;
    const description = weather?.weather?.[0]?.description;
    const wind = weather?.wind?.speed;
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity < 0 || humidity > 100 ||
        typeof description !== "string" || !Number.isFinite(wind) || wind < 0) {
      throw new Error("Weather service returned invalid weather data.");
    }

    const place = typeof country === "string" ? `${name}, ${country}` : name;
    const content = document.createElement("div");
    content.className = "weather-popup";
    content.textContent = `${place}\n${Math.round(temperature)} °C · ${description}\nHumidity: ${humidity}%\nWind: ${wind} m/s\nWeather: OpenWeatherMap`;
    map.setView([lat, lon], 11);
    map.openPopup(content, [lat, lon]);
    searchStatus.dataset.state = "ready";
    searchStatus.textContent = `Current weather for ${place}.`;
  } catch (error) {
    searchStatus.dataset.state = "error";
    searchStatus.textContent = error.name === "TimeoutError"
      ? "The request timed out. Try again."
      : error instanceof TypeError || error instanceof SyntaxError
        ? "Could not load weather. Check your connection and try again."
        : error.message;
  } finally {
    searchButton.disabled = false;
    spinner.hidden = true;
    searchButton.setAttribute("aria-busy", "false");
  }
});
