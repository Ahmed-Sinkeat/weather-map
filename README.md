# WeatherMap

A vanilla JavaScript weather map project using Leaflet, OpenStreetMap and OpenWeatherMap.

## Run

Open `index.html` in a browser. No installation is needed.

The map starts in Khartoum. An internet connection is required for Leaflet, map tiles and Google Fonts. No API key is needed for the map.

Enter an [OpenWeatherMap API key](https://home.openweathermap.org/api_keys) in the password field, then search for a city. New keys may need time to activate. The key is sent to OpenWeatherMap over HTTPS and is not stored by the app or included in the repository.

Search uses OpenWeatherMap's [Geocoding API](https://openweathermap.org/api/geocoding-api) and [Current Weather API](https://openweathermap.org/current). The first matching city is used; add a country code (e.g. `London,GB`) to narrow the search. The popup shows temperature in Celsius, conditions, humidity and wind in metres per second.

Run the map and weather self-check with `node app.test.cjs` (Node.js 18 or newer).

## Submission

Submit `index.html`, `styles.css`, `app.js`, `app.test.cjs` and this README. No build step or API key file is required. Sharing, favorites, forecasts and chat are not included.

Before submitting, enter your own key and try a valid city, an unknown city, then another valid city. Check keyboard navigation and the narrow-screen layout. Live API calls, browser appearance and screen-reader behavior have not been verified here. Review any additional Piazza requirements; they were not provided with the slides.
