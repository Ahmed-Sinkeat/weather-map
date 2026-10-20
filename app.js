const mapStatus = document.querySelector("#map-status");

if (!window.L) {
  mapStatus.textContent = "The map could not load. Check your connection and reload the page.";
} else {
  try {
    const map = L.map("map").setView([15.5007, 32.5599], 11);
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
  } catch {
    mapStatus.textContent = "The map could not start. Reload the page to try again.";
  }
}
