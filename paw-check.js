// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: magic;
// Paw-Check Widget
const CACHE_FILE = "pawcheck_final.json";
const CACHE_DURATION = 10; // minutes - Used for automatic background refreshes

// Thresholds (°F)
const HOT_WARNING = 120;
const HOT_DANGER = 130; // Dogs can burn paws in 60 seconds at 120°F, faster at 130°F+
const COLD_DANGER = 35; // Risk of frostbite/hypothermia

const COLORS = {
  bg: "#101010",
  fg: "#ffffff",
  safe: "#4CD964",
  warn: "#FF9500",
  danger: "#FF3B30",
  cold: "#5AC8FA",
  subtle: "#777" // A good subtle gray for general info/labels
};

async function fetchWeather() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);

  // Check if a manual override (tap to refresh) is triggered via widget parameter
  const forceRefreshOnTap = (args.widgetParameter === "force_refresh");

  if (fm.fileExists(cachePath)) {
    const cached = JSON.parse(fm.readString(cachePath));
    const age = (Date.now() - new Date(cached.timestamp)) / 60000;

    if (!forceRefreshOnTap && age < CACHE_DURATION) { // Use cache UNLESS forceRefreshOnTap is true AND cache is fresh enough
      console.log("Using cached weather data (age: " + age.toFixed(1) + " min).");
      return cached;
    } else if (forceRefreshOnTap) {
        console.log("Force refresh detected via widget parameter. Bypassing cache.");
    } else { // Cache exists but is too old
        console.log("Cached data found, but it's too old (age: " + age.toFixed(1) + " min). Fetching new data.");
    }
  } else { // No cache file exists
      console.log("No cached data file found. Fetching new data.");
  }

  // If we reach here, either the cache was too old, a manual override was triggered, or no cache existed.
  const loc = await Location.current();
  const geo = await Location.reverseGeocode(loc.latitude, loc.longitude);
  const city = geo[0]?.locality || geo[0]?.subAdministrativeArea || "Current Location";

  // IMPORTANT: Added 'windspeed_10m' to API request for more accurate surface temp calc
  const req = new Request(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&hourly=apparent_temperature,shortwave_radiation,windspeed_10m&temperature_unit=fahrenheit&timezone=auto`);
  const res = await req.loadJSON();

  const current = res.current_weather;
  const hourIdx = res.hourly.time.findIndex(t => new Date(t).getHours() === new Date(current.time).getHours());

  const now = new Date(); // Get current date/time when data is actually fetched

  // WMO Weather interpretation codes (WWMO) lookup function
  function getWeatherDescription(code, isDay) {
    switch (code) {
      case 0: return isDay ? "Clear Sky" : "Clear Sky";
      case 1: return isDay ? "Mostly Clear" : "Mostly Clear";
      case 2: return "Partly Cloudy";
      case 3: return "Overcast";
      case 45: return "Fog";
      case 48: return "Depositing Fog";
      case 51: return "Drizzle (Light)";
      case 53: return "Drizzle (Moderate)";
      case 55: return "Drizzle (Dense)";
      case 56: return "Freezing Drizzle (Light)";
      case 57: return "Freezing Drizzle (Dense)";
      case 61: return "Rain (Slight)";
      case 63: return "Rain (Moderate)";
      case 65: return "Rain (Heavy)";
      case 66: return "Freezing Rain (Light)";
      case 67: return "Freezing Rain (Heavy)";
      case 71: return "Snow Fall (Slight)";
      case 73: return "Snow Fall (Moderate)";
      case 75: return "Snow Fall (Heavy)";
      case 77: return "Snow Grains";
      case 80: return "Rain Showers (Slight)";
      case 81: return "Rain Showers (Moderate)";
      case 82: return "Rain Showers (Violent)";
      case 85: return "Snow Showers (Slight)";
      case 86: return "Snow Showers (Heavy)";
      case 95: return "Thunderstorm"; // With slight/moderate hail
      case 96: return "Thunderstorm (Slight Hail)";
      case 99: return "Thunderstorm (Heavy Hail)";
      default: return "N/A";
    }
  }

  const weatherDescription = getWeatherDescription(current.weathercode, current.is_day === 1);

  const data = {
    city,
    air: Math.round(current.temperature),
    feels: Math.round(res.hourly.apparent_temperature[hourIdx]),
    solar: res.hourly.shortwave_radiation[hourIdx],
    wind: res.hourly.windspeed_10m[hourIdx], // Added wind speed
    day: current.is_day === 1,
    description: weatherDescription, // Added weather description
    // Format the current time for the 'updated' display string
    updated: now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false // 24-hour format
    }).replace(/,/g, ''), // Remove all commas for cleaner display
    latitude: loc.latitude,
    timestamp: now.getTime() // Store timestamp in milliseconds for cache age calculation
  };

  fm.writeString(cachePath, JSON.stringify(data));
  console.log(`New weather data fetched and cached. API current.time: ${current.time}`);
  console.log(`Display updated time (from NOW): ${data.updated}`);
  console.log(`Cache written timestamp: ${new Date(data.timestamp).toLocaleString()}`);
  return data;
}

// Updated function for more accurate surface temperature estimation
function getSurfaceTemps(airTempF, solarRadW_m2, windSpeedMPS, day) {
  let asphaltRise = 0;
  let concreteRise = 0;

  if (day && solarRadW_m2 > 50) { // Only apply rise if it's day and significant solar radiation
    // Normalize solar radiation (0 to 1, where 1000 W/m^2 is roughly peak sun)
    const normalizedSolar = Math.min(solarRadW_m2 / 1000, 1);

    // Wind influence: higher wind means less rise (more cooling)
    // Scale wind from 0 to 1, where 15 m/s (approx 33 mph) has max cooling effect
    const normalizedWind = Math.min(windSpeedMPS / 15, 1);
    const windReductionFactor = 1 - (normalizedWind * 0.5); // Max 50% reduction in rise from strong wind

    // Empirical rise factors (can be adjusted):
    // Asphalt can get 40-70F hotter than air. Let's make it solar and wind dependent.
    // Concrete typically 10-30F hotter.
    const maxAsphaltRisePotential = 70; // Max observed rise for asphalt above air temp in direct sun
    const maxConcreteRisePotential = 30; // Max observed rise for concrete above air temp in direct sun

    asphaltRise = maxAsphaltRisePotential * normalizedSolar * windReductionFactor;
    concreteRise = maxConcreteRisePotential * normalizedSolar * windReductionFactor;

    // Ensure concrete is always cooler than asphalt if solar is significant.
    // This provides a robust distinction based on real-world observation.
    if (asphaltRise > 0 && concreteRise >= asphaltRise) {
        concreteRise = asphaltRise * 0.7; // Concrete's rise is at most 70% of asphalt's rise
    }
  }

  // Calculate final surface temperatures
  let asphaltTemp = Math.round(airTempF + asphaltRise);
  let concreteTemp = Math.round(airTempF + concreteRise);

  // Safety caps: Ensure temperatures don't go wildly high or low.
  // Pavement usually doesn't exceed 160-180F even in extreme conditions.
  const absoluteMaxSurfaceTemp = 180;
  asphaltTemp = Math.min(asphaltTemp, absoluteMaxSurfaceTemp);
  concreteTemp = Math.min(concreteTemp, absoluteMaxSurfaceTemp);

  // Also ensure they are not below air temp if solar > 0 and wind is not extreme, for plausibility.
  // Only apply this if it's day and not freezing.
  if (day && airTempF > COLD_DANGER) {
      asphaltTemp = Math.max(asphaltTemp, airTempF);
      concreteTemp = Math.max(concreteTemp, airTempF);
  }


  return {
    asphalt: asphaltTemp,
    concrete: concreteTemp
  };
}

function safetyLabel(asphalt, concrete) {
  const temp = Math.max(asphalt, concrete);
  if (temp >= HOT_DANGER) return ["Ouch! Way Too Hot!", COLORS.danger];
  if (temp >= HOT_WARNING) return ["Hot Surface, Caution", COLORS.warn];
  if (temp <= COLD_DANGER) return ["Too Cold – Paw Risk", COLORS.cold];
  return ["Happy Paws – Safe!", COLORS.safe];
}

async function buildWidget() {
  const weather = await fetchWeather();
  const surf = getSurfaceTemps(weather.air, weather.solar, weather.wind, weather.day);
  const [status, statusColor] = safetyLabel(surf.asphalt, surf.concrete);

  const w = new ListWidget();
  w.backgroundColor = new Color(COLORS.bg);
  w.setPadding(10,15,10,15);

  // Title clear, prominent
  const title = w.addText("Paw-Check 🐾");
  title.font = Font.boldMonospacedSystemFont(16);
  title.textColor = new Color(COLORS.fg);

  w.addSpacer(2);

  // Status clearly labeled
  const stat = w.addText(status);
  stat.font = Font.semiboldMonospacedSystemFont(14);
  stat.textColor = new Color(statusColor);

  w.addSpacer(6);

  // Combine Air temp, Feels Like, and Weather Description
  const airAndDescription = w.addText(`Outside: ${weather.air}°F (Feels ${weather.feels}°F) | ${weather.description}`);
  airAndDescription.font = Font.regularMonospacedSystemFont(13);
  airAndDescription.textColor = new Color(COLORS.fg); // Keep the same color for consistency
  w.addSpacer(4); 


  const surfStack = w.addStack();
  surfStack.layoutHorizontally();
  surfStack.spacing = 15; // Increased spacing between the two columns

  // Asphalt Column
  const asphaltColumn = surfStack.addStack();
  asphaltColumn.layoutVertically();

  const asphaltLabel = asphaltColumn.addText("ASPHALT SURFACE");
  asphaltLabel.font = Font.regularMonospacedSystemFont(11);
  asphaltLabel.textColor = new Color(COLORS.subtle); 

  asphaltColumn.addSpacer(2);

  let asphaltValueColor = COLORS.fg; // Default to foreground color (white)
  if (surf.asphalt >= HOT_DANGER) {
    asphaltValueColor = COLORS.danger; // Red for danger
  } else if (surf.asphalt >= HOT_WARNING) {
    asphaltValueColor = COLORS.warn; // Orange for warning
  } else if (surf.asphalt <= COLD_DANGER) {
    asphaltValueColor = COLORS.cold; // Blue for cold danger
  }
  const asphaltValue = asphaltColumn.addText(`${surf.asphalt}°F`);
  asphaltValue.font = Font.semiboldMonospacedSystemFont(16);
  asphaltValue.textColor = new Color(asphaltValueColor);

  asphaltColumn.addSpacer(2);

  // "Danger: 130°F" label
  const asphaltDanger = asphaltColumn.addText(`Danger: ${HOT_DANGER}°F`);
  asphaltDanger.font = Font.regularMonospacedSystemFont(10);
  asphaltDanger.textColor = new Color(COLORS.subtle);

  surfStack.addSpacer(); // Flexible spacer to push columns apart

  // Concrete Column
  const concreteColumn = surfStack.addStack();
  concreteColumn.layoutVertically();

  const concreteLabel = concreteColumn.addText("CONCRETE SURFACE");
  concreteLabel.font = Font.regularMonospacedSystemFont(11);
  concreteLabel.textColor = new Color(COLORS.subtle);

  concreteColumn.addSpacer(2);

  // Adjusted color logic for concrete value
  let concreteValueColor = COLORS.fg; // Default to foreground color (white)
  if (surf.concrete >= HOT_DANGER) {
    concreteValueColor = COLORS.danger; // Red for danger
  } else if (surf.concrete >= HOT_WARNING) {
    concreteValueColor = COLORS.warn; // Orange for warning
  } else if (surf.concrete <= COLD_DANGER) {
    concreteValueColor = COLORS.cold; // Blue for cold danger
  }
  const concreteValue = concreteColumn.addText(`${surf.concrete}°F`); 
  concreteValue.font = Font.semiboldMonospacedSystemFont(16);
  concreteValue.textColor = new Color(concreteValueColor);

  concreteColumn.addSpacer(2);

  const concreteDanger = concreteColumn.addText(`Danger: ${HOT_DANGER}°F`);
  concreteDanger.font = Font.regularMonospacedSystemFont(10);
  concreteDanger.textColor = new Color(COLORS.subtle);

  w.addSpacer(6);

  // Location
  const locTxt = w.addText(`📍 ${weather.city}`);
  locTxt.font = Font.regularMonospacedSystemFont(11);
  locTxt.textColor = new Color(COLORS.subtle);

  // Updated and tap hint
  const footer = w.addStack();

  const updatedTxt = footer.addText(`Updated ${weather.updated}`);
  updatedTxt.font = Font.regularMonospacedSystemFont(10);
  updatedTxt.textColor = new Color(COLORS.subtle);

  footer.addSpacer();

  const refreshTxt = footer.addText("Tap to refresh");
  refreshTxt.font = Font.regularMonospacedSystemFont(10);
  refreshTxt.textColor = new Color(COLORS.subtle);

  // Set refreshAfterDate for automatic iOS refreshes (10 minutes)
  w.refreshAfterDate = new Date(Date.now() + 600000);

  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
  Script.complete();
} else {
  // If running in the Scriptable app for testing/preview
  widget.presentMedium();
}
