const mapStatus = document.querySelector("#map-status");
const form = document.querySelector("form");
const locationInput = document.querySelector("#location");
const keyInput = document.querySelector("#api-key");
const searchButton = document.querySelector("button");
const searchStatus = document.querySelector("#search-status");
const spinner = document.querySelector("#spinner");
const favoritesList = document.querySelector("#favorites");
const forecastList = document.querySelector("#forecast-list");
const forecastStatus = document.querySelector("#forecast-status");
const iconPattern = /^(01|02|03|04|09|10|11|13|50)[dn]$/;
const favoritesKey = "weathermap-favorites";
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

let favorites = [];
try {
  const saved = JSON.parse(localStorage.getItem(favoritesKey));
  if (Array.isArray(saved)) favorites = saved.filter((name) => typeof name === "string").slice(-10);
} catch {
  // Storage blocked or corrupt: start with no favorites.
}

function renderFavorites() {
  favoritesList.textContent = "";
  for (const name of favorites) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => {
      locationInput.value = name;
      form.requestSubmit();
    });
    favoritesList.append(button);
  }
}
renderFavorites();

function errorMessage(error) {
  return error.name === "TimeoutError"
    ? "The request timed out. Try again."
    : error instanceof TypeError || error instanceof SyntaxError
      ? "Could not load weather. Check your connection and try again."
      : error.message;
}

// ponytail: days are grouped by UTC date, not the city's local date; use data.city.timezone if that matters.
function renderForecast(data) {
  if (!Array.isArray(data?.list)) throw new Error("Forecast service returned invalid forecast data.");
  const days = new Map();
  for (const item of data.list) {
    const date = item?.dt_txt;
    const temp = item?.main?.temp;
    const description = item?.weather?.[0]?.description;
    const icon = item?.weather?.[0]?.icon;
    if (typeof date !== "string" || !/^\d{4}-\d\d-\d\d \d\d:/.test(date) || !Number.isFinite(temp) ||
        typeof description !== "string" || typeof icon !== "string" || !iconPattern.test(icon)) {
      throw new Error("Forecast service returned invalid forecast data.");
    }
    const day = days.get(date.slice(0, 10)) ?? { min: temp, max: temp };
    day.min = Math.min(day.min, temp);
    day.max = Math.max(day.max, temp);
    if (!day.icon || date.includes(" 12:")) Object.assign(day, { icon, description });
    days.set(date.slice(0, 10), day);
  }
  if (!days.size) throw new Error("Forecast service returned invalid forecast data.");
  forecastList.textContent = "";
  for (const [date, day] of [...days].slice(0, 5)) {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = new Date(`${date}T00:00:00Z`)
      .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const image = document.createElement("img");
    image.src = `https://openweathermap.org/img/wn/${day.icon}@2x.png`;
    image.alt = day.description;
    image.width = 50;
    image.height = 50;
    const range = document.createElement("span");
    range.textContent = `${Math.round(day.min)}–${Math.round(day.max)} °C`;
    item.append(label, image, range);
    forecastList.append(item);
  }
  forecastStatus.textContent = "";
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
        typeof icon !== "string" || !iconPattern.test(icon)) {
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
    const favorite = document.createElement("button");
    favorite.type = "button";
    const labelFavorite = () => {
      favorite.textContent = favorites.includes(city) ? "Remove favorite" : "Save favorite";
    };
    labelFavorite();
    favorite.addEventListener("click", () => {
      favorites = favorites.includes(city) ? favorites.filter((name) => name !== city) : [...favorites, city].slice(-10);
      try {
        localStorage.setItem(favoritesKey, JSON.stringify(favorites));
      } catch {
        // Not saved across visits, but still works for this one.
      }
      renderFavorites();
      labelFavorite();
    });
    content.append(details, image, share, favorite);
    const nextMarker = L.marker([lat, lon]).bindPopup(content, { autoPan: false }).addTo(map);
    marker?.remove();
    marker = nextMarker;
    map.flyTo([lat, lon], 11, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    marker.openPopup();
    searchStatus.dataset.state = "ready";
    searchStatus.textContent = `Current weather for ${place}.`;
    try {
      renderForecast(await request("https://api.openweathermap.org/data/2.5/forecast", { lat, lon, units: "metric", appid }, "Forecast"));
    } catch (error) {
      forecastList.textContent = "";
      forecastStatus.textContent = `Forecast unavailable. ${errorMessage(error)}`;
    }
  } catch (error) {
    searchStatus.dataset.state = "error";
    searchStatus.textContent = errorMessage(error);
  } finally {
    searchButton.disabled = false;
    spinner.hidden = true;
    searchButton.setAttribute("aria-busy", "false");
  }
});
