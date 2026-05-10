# Paw-Check Widget

Paw-Check is a Scriptable widget for iPhone that estimates **asphalt** and **concrete** surface temperature from your current weather, solar radiation, and wind speed.

It is meant to be a conservative paw-safety indicator for hot pavement conditions, especially in high-heat areas.

## How it works

The widget uses a simplified surface energy balance model instead of fixed rise-above-air constants.

$$
T_{surface} = T_{air} + \frac{\alpha_s \cdot G}{h_c + h_r}
$$

Inputs:
- Air temperature from Open-Meteo.
- Shortwave solar radiation in W/m² from Open-Meteo.
- 10 m wind speed in **m/s** from Open-Meteo.

Material properties used:

| Surface | Solar absorptance | Emissivity |
|---|---:|---:|
| Asphalt | 0.92 | 0.92 |
| Concrete | 0.62 | 0.90 |

## Safety thresholds

| Status | Surface temperature |
|---|---:|
| Safe | 36°F to 119°F |
| Caution | 120°F to 129°F |
| Danger | 130°F and above |
| Cold risk | 35°F and below |

The hot warning threshold of 120°F aligns with published burn-risk guidance used in paw-safety discussions.

## Data source

Weather data comes from [Open-Meteo](https://open-meteo.com/en/docs).

Requested fields:
- `current_weather=true`
- `hourly=apparent_temperature,shortwave_radiation,windspeed_10m`
- `temperature_unit=fahrenheit`
- `wind_speed_unit=ms`
- `timezone=auto`

## Setup

1. Install **Scriptable** on iPhone.
2. Create a new script.
3. Paste in `paw-check.js`.
4. Save the script as `Paw-Check`.
5. Add a **medium Scriptable widget** to the Home Screen.
6. Edit the widget and set:
   - **Script**: `Paw-Check`
   - **When Interacting**: `Run Script`
   - **Parameter**: `force_refresh`

## Scriptable parameter

Scriptable still exposes the widget text parameter through `args.widgetParameter`, so the refresh pattern remains valid.

The script checks:

```javascript
const forceRefreshOnTap = args.widgetParameter === "force_refresh";
```

## Notes

- This is an estimate, not a direct infrared pavement measurement.
- Real pavement can stay hotter later in the day because it stores heat.
- Always use the 7-second hand test before walking your dog.
