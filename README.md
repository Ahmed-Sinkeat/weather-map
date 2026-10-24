# WeatherMap

A vanilla JavaScript weather map project using Leaflet, OpenStreetMap and OpenWeatherMap.

## Run

From this folder, start a local web server:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser. No dependencies need installing. Serve the page over HTTP locally or HTTPS when hosting so Nominatim receives the browser's site identification and sharing/clipboard APIs can work.

The map starts in Khartoum at zoom level 6. An internet connection is required for Leaflet, map tiles and Google Fonts. No API key is needed for the map.

A temporary OpenWeatherMap API key is prefilled in the password field. You can replace it with your own [API key](https://home.openweathermap.org/api_keys), then search for a city. New keys may need time to activate. The key is sent to OpenWeatherMap over HTTPS. The prefilled key is visible in the HTML source.

Search uses [OpenStreetMap Nominatim](https://nominatim.org/release-docs/latest/api/Search/) to find coordinates, then OpenWeatherMap's [Current Weather API](https://openweathermap.org/current). The first matching location is used; include a country (e.g. `London, United Kingdom`) to narrow the search. The API key is sent only to OpenWeatherMap.

The map animates to the result and replaces the previous marker. Its popup shows the location, temperature in Celsius, conditions, humidity, wind in metres per second, cloud coverage and the official weather icon. Reduced-motion preferences disable map animation. Failed searches keep the previous result.

The popup's **Share Weather** button opens native sharing when available, otherwise copies the weather text to the clipboard. If sharing is unavailable or permission is denied, a message explains how to copy the text manually.

Nominatim requests are limited to one per second in this page, and successful location lookups are cached for this visit. Its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) also limits total traffic across users; this direct browser setup is intended for a small coursework demo.

After each search, a **5-day forecast** (daily min/max and icon, from OpenWeatherMap's [5-day / 3-hour forecast](https://openweathermap.org/forecast5)) appears below the map. If it fails, the current weather still shows. Days are grouped by UTC date.

The popup's **Save favorite** button stores the searched city in `localStorage`; saved cities appear as quick-access buttons above the map, and the popup button toggles to **Remove favorite**.

Run the map and weather self-check with `node app.test.cjs` (Node.js 18 or newer).
