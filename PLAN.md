# Plan: Switch to Planetary Ephemeris for Astrological Transits

## Goal
Replace the NASA Horizons API + synthetic fallback with **astronomy-engine** (client-side VSOP87) to compute **ecliptic longitudes** for all planets. Shift the visualization from "elongation from Sun" to **planetary aspects** — showing the rise and fall of configurations like Venus-Jupiter conjunctions, Mars-Saturn squares, etc.

## Why astronomy-engine (not Swiss Ephemeris)
- Pure JS, works entirely client-side — no WASM, no data files, no server
- ~116 KB bundle, zero dependencies
- ±1 arcminute accuracy (plenty for transit visualization)
- Provides `GeoVector()` → `Ecliptic().elon` for geocentric ecliptic longitude
- MIT-like license (no GPL concerns)
- Swiss Ephemeris would require WASM + embedded data files + GPL licensing — overkill for this use case

## Architecture Changes

### 1. Install astronomy-engine
```
npm install astronomy-engine
```

### 2. New: `src/api/ephemeris.js` — replaces `horizons.js`
Compute ecliptic longitudes for all planets over a date range using astronomy-engine:
- `computePlanetLongitudes(startDate, endDate)` → returns `{ [planetName]: [{date, longitude}...] }`
- Maps planet names to astronomy-engine `Body` enum (Body.Mercury, Body.Venus, etc.)
- Steps through dates at 1-day intervals (or coarser for long ranges)
- For each date: `GeoVector(body, date, true)` → `Ecliptic(vec).elon` → 0–360° ecliptic longitude
- All computation is synchronous — no network fetches needed

### 3. New: `src/utils/aspects.js` — replaces `elongationToIntensity.js`
Core aspect computation:
- Define major aspects: conjunction (0°), opposition (180°), trine (120°), square (90°), sextile (60°)
- Each aspect has an **orb** (tolerance): conjunction ±10°, opposition ±10°, trine ±8°, square ±8°, sextile ±6°
- `computeAspectCurve(longA[], longB[], aspectAngle, orb)` → returns intensity curve (0–1)
  - Intensity = 1 when exact aspect, falls to 0 at edge of orb
  - Uses cosine falloff: `intensity = cos((separation / orb) * π/2)` for smooth curves
- `findAllAspects(planetLongitudes, selectedPairs)` → returns all active aspect curves for rendering

### 4. Update: `src/data/planets.js`
- Change IDs from NASA NAIF IDs (199, 299...) to astronomy-engine body names ('Mercury', 'Venus'...)
- Add the Sun and Moon as optional bodies (astrologically important)
- Remove `isInner` flag (no longer relevant — aspects work the same for all pairs)

### 5. Update: `src/hooks/useEphemeris.js` → `src/hooks/useTransits.js`
- Replace async fetch logic with synchronous computation
- Input: date range + selected planet pairs + selected aspect types
- Output: `{ curves, loading }` where curves contains aspect intensity over time
- Still use module-level cache for computed longitudes
- Loading state driven by computation time (use `requestIdleCallback` or chunked computation if slow)

### 6. Update: `src/components/Controls/` — aspect & pair selection
- Replace planet toggles with **planet pair** selection (e.g., Venus-Jupiter, Mars-Saturn)
- Add **aspect type** toggles (conjunction, opposition, trine, square, sextile)
- Each pair + aspect combo gets its own curve on the canvas
- Color the curve by blending the two planets' colors

### 7. Update: `src/components/Canvas/useCanvasRenderer.js`
- Y-axis now represents aspect intensity (0 = out of orb, 1 = exact aspect)
- Each curve labeled with pair + aspect type (e.g., "♀☌♃" for Venus conjunct Jupiter)
- Peak markers show exact aspect dates
- Update title watermark from "ELONGATION INTENSITY" to "TRANSIT INTENSITY" or similar
- Legend shows planet pairs with aspect glyphs

### 8. Update: `src/App.jsx`
- Wire new hooks and controls together
- Default selection: a few interesting pairs (Venus-Jupiter, Mars-Saturn, Sun-Moon)
- Update default date range to include current year

### 9. Delete: `src/api/horizons.js`
No longer needed — all computation is local.

## Data Flow (New)

```
User selects date range + planet pairs + aspect types
  ↓
useTransits hook computes ecliptic longitudes (astronomy-engine)
  ↓
For each pair + aspect: compute angular separation over time
  ↓
Map separation to intensity curve (1 at exact, 0 outside orb)
  ↓
Pass curves to Canvas renderer
  ↓
Draw glowing curves with peak markers at exact aspects
```

## Implementation Order
1. Install astronomy-engine, write `ephemeris.js`, verify longitudes
2. Write `aspects.js` with aspect computation logic
3. Update `planets.js` with new IDs and add Sun/Moon
4. Create `useTransits.js` hook
5. Update Controls for pair/aspect selection
6. Update Canvas renderer for new data shape
7. Update App.jsx to wire everything together
8. Remove old horizons.js and elongationToIntensity.js
