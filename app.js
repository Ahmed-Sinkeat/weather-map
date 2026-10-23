const mapStatus = document.querySelector("#map-status");
const form = document.querySelector("form");
const locationInput = document.querySelector("#location");
const keyInput = document.querySelector("#api-key");
const searchButton = document.querySelector("button");
const searchStatus = document.querySelector("#search-status");
const spinner = document.querySelector("#spinner");
let map;
let marker;
let lastGeocodeAt = 0;
const locationsByQuery = new Map();

if (!window.L) {
  mapStatus.textContent = "The map could not load. Check your connection and reload the page.";
} else {
  try {
    map = L.map("map").setView([15.5007, 32.5599], 6);
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

async function request(url, params, service = "Weather") {
  const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (service === "Weather" && response.status === 401) throw new Error("Check your OpenWeatherMap API key; it may be invalid or not active yet.");
  if (response.status === 429) throw new Error(`${service} request limit reached. Try again later.`);
  if (!response.ok) throw new Error(`${service} service is unavailable. Try again later.`);
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
    let locations = locationsByQuery.get(city);
    if (!locations) {
      // shortcut: one Nominatim request/second per tab; use a shared limiter for multiple users.
      const delay = 1000 - (Date.now() - lastGeocodeAt);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      lastGeocodeAt = Date.now();
      locations = await request("https://nominatim.openstreetmap.org/search", {
        q: city, format: "jsonv2", limit: 1,
      }, "Location");
    }
    if (!Array.isArray(locations)) throw new Error("Location service returned invalid location data.");
    if (!locations.length) throw new Error("No city found. Check the spelling or include a country, e.g. London, United Kingdom.");
    const location = locations[0];
    const lat = Number(location?.lat);
    const lon = Number(location?.lon);
    const place = location?.display_name;
    if (typeof location?.lat !== "string" || !location.lat.trim() ||
        typeof location?.lon !== "string" || !location.lon.trim() ||
        !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 ||
        typeof place !== "string" || !place.trim()) {
      throw new Error("Location service returned invalid location data.");
    }
    locationsByQuery.set(city, locations);
    const weather = await request("https://api.openweathermap.org/data/2.5/weather", { lat, lon, units: "metric", appid });
    const temperature = weather?.main?.temp;
    const humidity = weather?.main?.humidity;
    const description = weather?.weather?.[0]?.description;
    const wind = weather?.wind?.speed;
    const clouds = weather?.clouds?.all;
    const icon = weather?.weather?.[0]?.icon;
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity < 0 || humidity > 100 ||
        typeof description !== "string" || !Number.isFinite(wind) || wind < 0 ||
        !Number.isFinite(clouds) || clouds < 0 || clouds > 100 ||
        typeof icon !== "string" || !/^(01|02|03|04|09|10|11|13|50)[dn]$/.test(icon)) {
      throw new Error("Weather service returned invalid weather data.");
    }

    const content = document.createElement("div");
    content.className = "weather-popup";
    const text = `${place}\n${Math.round(temperature)} °C · ${description}\nHumidity: ${humidity}%\nWind: ${wind} m/s\nClouds: ${clouds}%\nWeather: OpenWeatherMap`;
    const details = document.createElement("p");
    details.textContent = text;
    const image = document.createElement("img");
    image.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    image.alt = description;
    image.width = 100;
    image.height = 100;
    const share = document.createElement("button");
    share.type = "button";
    share.textContent = "Share Weather";
    share.addEventListener("click", async () => {
      share.disabled = true;
      try {
        if (navigator.share) {
          await navigator.share({ title: `Weather for ${place}`, text });
          searchStatus.textContent = "Weather shared.";
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          searchStatus.textContent = "Weather copied to clipboard.";
        } else {
          throw new Error("Sharing unavailable");
        }
        searchStatus.dataset.state = "ready";
      } catch (error) {
        if (error.name !== "AbortError") {
          searchStatus.dataset.state = "error";
          searchStatus.textContent = "Could not share weather. Select and copy the weather text instead.";
        }
      } finally {
        share.disabled = false;
      }
    });
    content.append(details, image, share);
    const nextMarker = L.marker([lat, lon]).bindPopup(content, { autoPan: false }).addTo(map);
    marker?.remove();
    marker = nextMarker;
    map.flyTo([lat, lon], 11, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    marker.openPopup();
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
