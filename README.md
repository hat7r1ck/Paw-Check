# Paw-Check Widget
<table>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/adea2b36-00d9-4ab4-ae9e-2524424168d2" alt="Paw-Check Screenshot" width="260">
      <br>
      <sub><b>Paw-Check Screenshot</b></sub>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/840dcd61-2f30-4fc9-be75-d3e8d3f2d210" alt="My Dogs" width="260">
      <br>
      <sub><b>My Pups</b></sub>
    </td>
  </tr>
</table>

---

## Overview
Paw-Check is a Scriptable widget for iOS designed for dog owners who care deeply about their pet’s wellbeing. The widget helps you decide if it is safe for your dog’s paws to walk outside by using real-time, location-aware weather data. Inspired by concern for my dogs in extreme climates, like the intense Arizona summer, Paw-Check provides surface temperature estimates for both asphalt and concrete that dynamically adjust to conditions anywhere in the world.

### Purpose
Paw-Check was created out of genuine love for dogs and respect for all who prioritize their pets’ safety. The logic is as reliable and consistent as possible, regardless of location or season, because every dog deserves safe walks and every paw deserves comfort.

> [!WARNING]
> Always use the 7-second hand test on the pavement to double-check safety.
> 
> *If the pavement feels too hot or cold for your hand, it’s not safe for paws.*

### Key Features
* **Science-Based Calculation:** Estimates pavement temperature using air temperature, solar radiation, and wind speed.[^1]
* **Truly Local:** Uses your device’s GPS to fetch weather specific to your location, wherever you are.
* **Separate Warnings:** Shows temperature estimates for both asphalt and concrete surfaces.
* **Clear Safety Alerts:** Color-coded labels indicate danger, caution, cold, or safe based on veterinary guidelines.[^3] [^5]
* **Smart Caching:** Updates automatically every 10 minutes with the option to refresh instantly.
* **Weather Details:** Tells you the current sky condition according to international standards.

---
### Setup
1. Install **Scriptable** from the App Store

2. **Add the widget script**
   Either drop `Paw-Check.js` file into the iCloud Scriptable folder, or open Scriptable, tap **+**, paste the code, and name it `Paw-Check`.

3. **Add a Scriptable widget**

   * Long press the home screen, tap **+**, search for *Scriptable*, then add a medium-sized widget to your home screen.
   * Long‑press the new widget and choose **Edit Widget**.

4. **Configure widget options**

   * **Script**: select `Paw-Check`
   * **When Interacting**: change default ("Open App") to **Run Script**
   * (Optional) **Parameter**: set to `force_refresh` to enable tap-to-refresh behavior.

5. **Initial run**
   Open Scriptable and run `Paw-Check` manually to grant permissions and initialize cache.

---

### How It Works
1. The widget collects local weather data: air temperature, sunlight intensity, and wind speed.[^1]
2. It runs a physics-informed model to estimate how much hotter (or colder) the ground is compared to the air.[^1] [^2]
3. Calculations only apply warming if it is daylight and there is enough sunlight.
4. It compares the higher of the two surface temperatures to recommended safety thresholds and displays a clear warning or reassurance.[^3] [^5]
5. No temperatures or thresholds are hard-coded for a specific city or season. All values can adapt instantly based on your real local conditions.

---

#### 1. Weather Input Data
Pulled from [Open-Meteo](https://open-meteo.com/ "https://open-meteo.com/")’s GPS-based API:
- `air` – current air temperature (°F)
- `solarRadW_m2` – solar radiation (W/m²)
- `windSpeedMPS` – 10 m wind speed (m/s)
- `day` – daylight indicator (`true/false`)
- `description` – human-readable WMO code

---

#### 2. Surface Temperature Model
**Normalize Input Factors** [^1] [^2]
```javascript
const normalizedSolar = Math.min(solarRadW_m2 / 1000, 1);  // Full sun = 1000 W/m
const normalizedWind  = Math.min(windSpeedMPS / 15, 1);    // 15 m/s = strong wind
const windReductionFactor = 1 - (normalizedWind * 0.5);    // Wind reduces rise by up to 50%
```

**Compute Surface Rise**
```javascript
const maxAsphaltRise = 70;
const maxConcreteRise = 30;

let asphaltRise = maxAsphaltRise * normalizedSolar * windReductionFactor;
let concreteRise = maxConcreteRise * normalizedSolar * windReductionFactor;
```
* Asphalt heats 40–70°F above air in full sun[^1]
* Concrete typically rises 10–30°F[^1]

**Enforce Material Relationship**
```javascript
if (concreteRise >= asphaltRise) {
  concreteRise = asphaltRise * 0.7;
}
```
* Concrete capped at 70% of asphalt[^1]

**Clamp Final Temperature**
```javascript
asphaltTemp = Math.round(airTempF + asphaltRise);
concreteTemp = Math.round(airTempF + concreteRise);

asphaltTemp = Math.min(asphaltTemp, 180);
concreteTemp = Math.min(concreteTemp, 180);
```
* Surface temps capped at 180°F[^4]
* Below-air temps prevented during sunny daytime

**Final Conditions**
Only calculated if:
* day is true
* solarRadW_m2 > 50

---

#### 3. Risk Evaluation
Compares asphalt and concrete values against veterinary safety limits:

| **Status**           | **Temperature Range (°F)** | **Color**      | **App Says (Label Shown)**      |
|----------------------|:-------------------------:|:--------------:|:-------------------------------|
| DANGER               | ≥ 130                     | Red `#FF3B30`  | Ouch! Way Too Hot!              |
| WARNING / CAUTION    | 120–129                   | Orange `#FF9500` | Hot Surface, Caution           |
| COLD DANGER          | ≤ 35                      | Blue `#5AC8FA` | Too Cold – Paw Risk             |
| SAFE                 | 36–119                    | Green `#4CD964` | Happy Paws – Safe!              |


> [!NOTE]
> The higher of the two surface temps determines risk status.
> Veterinary experts advise paw burns can occur in under a minute when surfaces reach 120°F or higher, with risk almost instant at 130°F.[^3]
> Cold can also cause harm below 35°F.[^5]

---

### Example Calculation
If it’s 110°F outside in Arizona, with strong sunlight and a gentle wind, asphalt might reach over 160°F and concrete over 130°F. In such cases, Paw-Check will clearly warn that walking is not safe for your dog.
- **Air temp**: 110°F
- **Solar**: 900 W/m²
- **Wind**: 3 m/s

    ```javascript
    normalizedSolar = 0.9
    normalizedWind = 0.2
    windReductionFactor = 0.9
    
    asphaltRise = 70 * 0.9 * 0.9 = 56.7°F
    concreteRise = 30 * 0.9 * 0.9 = 24.3°F
    
    asphaltTemp = 110 + 56.7 = 166.7°F
    concreteTemp = 110 + 24.3 = 134.3°F
    ```

- **Result:** **DANGER** alert

---


[^1]: Hudak, P. (2022). [Hazardous Ground Temperatures When Walking Dogs](https://journals.uco.es/index.php/pet/article/view/13733), *Pet Behaviour Science*, 12, 31–42.  
    - Table 1: Asphalt 40–70 °F above air, concrete 10–30 °F above air.  
    - Supported by: Vets Now, [Why dog owners should avoid pavements and fake grass on hot days](https://www.vets-now.com/2017/06/never-walk-dogs-hot-asphalt-tarmac-pavements-artificial-grass/).

[^2]: Yavuzturk, C. & Ksaibati, K. (2002). [Assessment of Temperature Fluctuations in Asphalt Pavements](https://www.ugpti.org/resources/reports/downloads/mpc02-136.pdf), Mountain-Plains Consortium, University of Wyoming, pp. 18–19.  
    - Engineering modeling: wind convective cooling effect on pavement temperature.

[^3]: Vets Now. [Why dog owners should avoid pavements and fake grass on hot days](https://www.vets-now.com/2017/06/never-walk-dogs-hot-asphalt-tarmac-pavements-artificial-grass/).  
    - Veterinary guidance: risk of paw pad injury at ≥120°F.

[^4]: Reuters. [How concrete, asphalt and urban heat islands add to the misery of heat waves](https://www.reuters.com/graphics/CLIMATE-CHANGE/URBAN-HEAT/byvrejywdpe/).  
    - Asphalt surface temps up to 180 °F.

[^5]: ASPCA. [Cold Weather Safety Tips](https://www.aspca.org/pet-care/general-pet-care/cold-weather-safety-tips).  
    - Guidance on pet safety in cold weather.


