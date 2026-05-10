// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: magic;
// Paw-Check Widget

const CACHE_FILE = "pawcheck_final.json";
const CACHE_DURATION = 10; // minutes

// Thresholds (°F)
const HOT_WARNING = 120;
const HOT_DANGER = 130;
const COLD_DANGER = 35;

// Material properties from pavement thermal literature
const ASPHALT_ALPHA = 0.92;   // solar absorptance
const CONCRETE_ALPHA = 0.62;  // solar absorptance
const ASPHALT_EPS = 0.92;     // longwave emissivity
const CONCRETE_EPS = 0.90;    // longwave emissivity
const SIGMA = 5.67e-8;        // Stefan-Boltzmann constant W/(m²·K⁴)
const ABSOLUTE_MAX_SURFACE_TEMP = 180;

const COLORS = {
  bg: "#101010",
  fg: "#ffffff",
  safe: "#4CD964",
  warn: "#FF9500",
  danger: "#FF3B30",
  cold: "#5AC8FA",
  subtle: "#777777"
};

function formatUpdatedTime(date) {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).replace(/,/g, "");
}

function getWeatherDescription(code) {
  switch (code) {
    case 0: return "Clear Sky";
    case 1: return "Mostly Clear";
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
    case 95: return "Thunderstorm";
    case 96: return "Thunderstorm (Slight Hail)";
    case 99: return "Thunderstorm (Heavy Hail)";
    default: return "Unknown";
  }
}

function getHourlyIndex(res) {
  if (!res?.current_weather?.time || !res?.hourly?.time) return -1;
  return res.hourly.time.indexOf(res.current_weather.time);
}

async function fetchWeather() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  const forceRefreshOnTap = args.widgetParameter === "force_refresh";

  if (fm.fileExists(cachePath)) {
    const cached = JSON.parse(fm.readString(cachePath));
    const ageMinutes = (Date.now() - Number(cached.timestamp)) / 60000;

    if (!forceRefreshOnTap && ageMinutes < CACHE_DURATION) {
      console.log(`Using cached weather data (age: ${ageMinutes.toFixed(1)} min).`);
      return cached;
    }

    if (forceRefreshOnTap) {
      console.log("Force refresh requested via widget parameter, bypassing cache.");
    } else {
      console.log(`Cache expired (age: ${ageMinutes.toFixed(1)} min), fetching new data.`);
    }
  } else {
    console.log("No cache found, fetching new data.");
  }

  const loc = await Location.current();
  const geo = await Location.reverseGeocode(loc.latitude, loc.longitude);
  const city = geo[0]?.locality || geo[0]?.subAdministrativeArea || "Current Location";

  const req = new Request(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current_weather=true` +
    `&hourly=apparent_temperature,shortwave_radiation,windspeed_10m` +
    `&temperature_unit=fahrenheit` +
    `&wind_speed_unit=ms` +
    `&timezone=auto`
  );

  const res = await req.loadJSON();
  const current = res.current_weather;
  const hourIdx = getHourlyIndex(res);
  const now = new Date();

  const data = {
    city,
    air: Math.round(current.temperature),
    feels: hourIdx >= 0 ? Math.round(res.hourly.apparent_temperature[hourIdx]) : Math.round(current.temperature),
    solar: hourIdx >= 0 ? Number(res.hourly.shortwave_radiation[hourIdx]) : 0,
    wind: hourIdx >= 0 ? Number(res.hourly.windspeed_10m[hourIdx]) : 0,
    day: current.is_day === 1,
    description: getWeatherDescription(current.weathercode),
    updated: formatUpdatedTime(now),
    latitude: loc.latitude,
    longitude: loc.longitude,
    timestamp: now.getTime()
  };

  fm.writeString(cachePath, JSON.stringify(data));
  return data;
}

function getSurfaceTemps(airTempF, solarRadW_m2, windSpeedMPS, day) {
  let asphaltTemp = Math.round(airTempF);
  let concreteTemp = Math.round(airTempF);

  if (day && solarRadW_m2 > 50) {
    const airTempK = (airTempF - 32) * 5 / 9 + 273.15;
    const hc = 5.6 + (4.0 * Math.max(windSpeedMPS, 0));

    const hrAsphalt = 4 * ASPHALT_EPS * SIGMA * Math.pow(airTempK, 3);
    const hrConcrete = 4 * CONCRETE_EPS * SIGMA * Math.pow(airTempK, 3);

    const asphaltRiseK = (ASPHALT_ALPHA * solarRadW_m2) / (hc + hrAsphalt);
    const concreteRiseK = (CONCRETE_ALPHA * solarRadW_m2) / (hc + hrConcrete);

    asphaltTemp = Math.round(airTempF + (asphaltRiseK * 1.8));
    concreteTemp = Math.round(airTempF + (concreteRiseK * 1.8));
  }

  asphaltTemp = Math.min(asphaltTemp, ABSOLUTE_MAX_SURFACE_TEMP);
  concreteTemp = Math.min(concreteTemp, ABSOLUTE_MAX_SURFACE_TEMP);

  if (day && airTempF > COLD_DANGER) {
    asphaltTemp = Math.max(asphaltTemp, Math.round(airTempF));
    concreteTemp = Math.max(concreteTemp, Math.round(airTempF));
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
  if (temp <= COLD_DANGER) return ["Too Cold - Paw Risk", COLORS.cold];
  return ["Happy Paws - Safe!", COLORS.safe];
}

function colorForSurfaceTemp(temp) {
  if (temp >= HOT_DANGER) return COLORS.danger;
  if (temp >= HOT_WARNING) return COLORS.warn;
  if (temp <= COLD_DANGER) return COLORS.cold;
  return COLORS.fg;
}

async function buildWidget() {
  const weather = await fetchWeather();
  const surf = getSurfaceTemps(weather.air, weather.solar, weather.wind, weather.day);
  const [status, statusColor] = safetyLabel(surf.asphalt, surf.concrete);

  const w = new ListWidget();
  w.backgroundColor = new Color(COLORS.bg);
  w.setPadding(10, 15, 10, 15);

  const title = w.addText("Paw-Check 🐾");
  title.font = Font.boldMonospacedSystemFont(16);
  title.textColor = new Color(COLORS.fg);

  w.addSpacer(2);

  const stat = w.addText(status);
  stat.font = Font.semiboldMonospacedSystemFont(14);
  stat.textColor = new Color(statusColor);

  w.addSpacer(6);

  const airLine = w.addText(`Outside: ${weather.air}°F (Feels ${weather.feels}°F) | ${weather.description}`);
  airLine.font = Font.regularMonospacedSystemFont(13);
  airLine.textColor = new Color(COLORS.fg);

  w.addSpacer(4);

  const surfStack = w.addStack();
  surfStack.layoutHorizontally();
  surfStack.spacing = 15;

  const asphaltColumn = surfStack.addStack();
  asphaltColumn.layoutVertically();

  const asphaltLabel = asphaltColumn.addText("ASPHALT SURFACE");
  asphaltLabel.font = Font.regularMonospacedSystemFont(11);
  asphaltLabel.textColor = new Color(COLORS.subtle);

  asphaltColumn.addSpacer(2);

  const asphaltValue = asphaltColumn.addText(`${surf.asphalt}°F`);
  asphaltValue.font = Font.semiboldMonospacedSystemFont(16);
  asphaltValue.textColor = new Color(colorForSurfaceTemp(surf.asphalt));

  asphaltColumn.addSpacer(2);

  const asphaltDanger = asphaltColumn.addText(`Danger: ${HOT_DANGER}°F`);
  asphaltDanger.font = Font.regularMonospacedSystemFont(10);
  asphaltDanger.textColor = new Color(COLORS.subtle);

  surfStack.addSpacer();

  const concreteColumn = surfStack.addStack();
  concreteColumn.layoutVertically();

  const concreteLabel = concreteColumn.addText("CONCRETE SURFACE");
  concreteLabel.font = Font.regularMonospacedSystemFont(11);
  concreteLabel.textColor = new Color(COLORS.subtle);

  concreteColumn.addSpacer(2);

  const concreteValue = concreteColumn.addText(`${surf.concrete}°F`);
  concreteValue.font = Font.semiboldMonospacedSystemFont(16);
  concreteValue.textColor = new Color(colorForSurfaceTemp(surf.concrete));

  concreteColumn.addSpacer(2);

  const concreteDanger = concreteColumn.addText(`Danger: ${HOT_DANGER}°F`);
  concreteDanger.font = Font.regularMonospacedSystemFont(10);
  concreteDanger.textColor = new Color(COLORS.subtle);

  w.addSpacer(6);

  const locTxt = w.addText(`📍 ${weather.city}`);
  locTxt.font = Font.regularMonospacedSystemFont(11);
  locTxt.textColor = new Color(COLORS.subtle);

  const footer = w.addStack();

  const updatedTxt = footer.addText(`Updated ${weather.updated}`);
  updatedTxt.font = Font.regularMonospacedSystemFont(10);
  updatedTxt.textColor = new Color(COLORS.subtle);

  footer.addSpacer();

  const refreshTxt = footer.addText("Tap to refresh");
  refreshTxt.font = Font.regularMonospacedSystemFont(10);
  refreshTxt.textColor = new Color(COLORS.subtle);

  w.refreshAfterDate = new Date(Date.now() + (CACHE_DURATION * 60 * 1000));
  return w;
}

const widget = await buildWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
  Script.complete();
} else {
  widget.presentMedium();
}
