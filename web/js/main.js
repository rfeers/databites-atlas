// main.js - entry point, wires everything together

import { LEVELS, VARIABLES, DEFAULT_VARIABLE, VARIABLE_MAP, DEFAULT_YEAR } from './config.js';
import { initMap, addLevel, recolorLevel, setActiveLevel, setupHover, setupClick, addRoadsOverlay, raiseOverlays } from './map.js';

// app state
let activeVar   = DEFAULT_VARIABLE;
let activeLevel = 'provinces';
let geoCache    = {};
let dataCache   = {};

const CITIES = [
  { name: 'Barcelona', center: [2.1734, 41.3851], zoom: 12 },
  { name: 'Girona',    center: [2.8214, 41.9794], zoom: 12 },
  { name: 'Lleida',    center: [0.6200, 41.6148], zoom: 12 },
  { name: 'Tarragona', center: [1.2445, 41.1189], zoom: 12 },
  { name: 'Manresa',   center: [1.8264, 41.7285], zoom: 12 },
  { name: 'Sabadell',  center: [2.1078, 41.5433], zoom: 12 },
];

async function loadGeo(levelId) {
  if (geoCache[levelId]) return geoCache[levelId];
  const res  = await fetch(`geo/${levelId}.geojson`);
  const json = await res.json();
  geoCache[levelId] = json;
  window._geoCache  = geoCache;
  return json;
}

async function loadData(levelId) {
  if (dataCache[levelId]) return dataCache[levelId];
  const res  = await fetch(`data/${levelId}.json`);
  const json = await res.json();
  dataCache[levelId] = json;
  return json;
}

// ── Minimap ────────────────────────────────────────────────
const CATALONIA_BOUNDS = [[0.15, 40.52], [3.34, 42.86]];

function getViewportGeoJSON(map) {
  const b  = map.getBounds();
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();

  // clamp to Catalonia bounds so the box never exceeds the minimap
  const minLng = Math.max(sw.lng, CATALONIA_BOUNDS[0][0]);
  const minLat = Math.max(sw.lat, CATALONIA_BOUNDS[0][1]);
  const maxLng = Math.min(ne.lng, CATALONIA_BOUNDS[1][0]);
  const maxLat = Math.min(ne.lat, CATALONIA_BOUNDS[1][1]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

function initMinimap(mainMap) {
  const CAT_BOUNDS = [[0.15, 40.52], [3.34, 42.86]];

  const minimap = new maplibregl.Map({
    container:          'minimap',
    style: {
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } }],
    },
    bounds:             CAT_BOUNDS,
    fitBoundsOptions:   { padding: 10 },
    interactive:        false,
    attributionControl: false,
  });

  function getClampedViewport() {
    const b = mainMap.getBounds();
    const minLng = Math.max(b.getWest(),  CAT_BOUNDS[0][0]);
    const minLat = Math.max(b.getSouth(), CAT_BOUNDS[0][1]);
    const maxLng = Math.min(b.getEast(),  CAT_BOUNDS[1][0]);
    const maxLat = Math.min(b.getNorth(), CAT_BOUNDS[1][1]);
    const valid  = minLng < maxLng && minLat < maxLat;
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [valid ? [
          [minLng, minLat], [maxLng, minLat],
          [maxLng, maxLat], [minLng, maxLat],
          [minLng, minLat],
        ] : []],
      },
    };
  }

  minimap.on('load', async () => {
    const res = await fetch('geo/catalonia.geojson');
    const geo = await res.json();

    minimap.addSource('catalonia', { type: 'geojson', data: geo });
    minimap.addLayer({
      id: 'catalonia-fill', type: 'fill', source: 'catalonia',
      paint: { 'fill-color': '#1c2a1e', 'fill-opacity': 1 },
    });
    minimap.addLayer({
      id: 'catalonia-border', type: 'line', source: 'catalonia',
      paint: { 'line-color': '#4a7c59', 'line-width': 1 },
    });

    minimap.addSource('viewport', { type: 'geojson', data: getClampedViewport() });
    minimap.addLayer({
      id: 'viewport-fill', type: 'fill', source: 'viewport',
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.1 },
    });
    minimap.addLayer({
      id: 'viewport-border', type: 'line', source: 'viewport',
      paint: { 'line-color': '#ffffff', 'line-width': 1.5 },
    });

    const update = () => {
      const src = minimap.getSource('viewport');
      if (src) src.setData(getClampedViewport());
    };
    mainMap.on('move', update);
    mainMap.on('zoom', update);
    update();
  });

  minimap.on('click', (e) => {
    mainMap.flyTo({ center: e.lngLat, zoom: mainMap.getZoom() });
  });
}

// ── Jump to ─────────────────────────────────────────────────
function buildJumpTo(map) {
  const container = document.getElementById('jumpto-list');
  if (!container) return;

  CITIES.forEach(city => {
    const btn = document.createElement('button');
    btn.className   = 'jumpto-btn';
    btn.textContent = city.name;
    btn.addEventListener('click', () => {
      map.flyTo({ center: city.center, zoom: city.zoom, duration: 1000 });
    });
    container.appendChild(btn);
  });
}

// ── Featured top/bottom ──────────────────────────────────────
function updateFeatured(map) {
  const container = document.getElementById('featured-list');
  if (!container) return;

  const munData = dataCache['municipalities'];
  const munGeo  = geoCache['municipalities'];

  if (!munData || !munGeo) {
    container.innerHTML = '<div class="featured-loading">Loading...</div>';
    return;
  }

  const varCfg = VARIABLE_MAP[activeVar];

  // name lookup from geo
  const nameLookup = {};
  munGeo.features.forEach(f => {
    nameLookup[f.properties.CUMUN] = f.properties.NMUN || f.properties.CUMUN;
  });

  // collect + sort values
  const entries = Object.entries(munData)
    .map(([id, d]) => ({ id, val: d?.[activeVar]?.[DEFAULT_YEAR] }))
    .filter(e => e.val != null)
    .sort((a, b) => b.val - a.val);

  const top3 = entries.slice(0, 3);
  const bot3 = entries.slice(-3).reverse();

  function formatVal(val) {
    return varCfg.unit === 'EUR'
      ? `€${Math.round(val).toLocaleString('es-ES')}`
      : val.toFixed(varCfg.decimals);
  }

  function makeItem(entry, rankLabel, rankClass) {
    const div = document.createElement('div');
    div.className = 'featured-item';
    div.innerHTML = `
      <div class="featured-rank ${rankClass}">${rankLabel}</div>
      <div class="featured-name">${nameLookup[entry.id] || entry.id}</div>
      <div class="featured-value">${formatVal(entry.val)}</div>
    `;
    div.addEventListener('click', () => {
      const feature = munGeo.features.find(f => f.properties.CUMUN === entry.id);
      if (!feature) return;
      const coords = feature.geometry.type === 'Polygon'
        ? feature.geometry.coordinates[0]
        : feature.geometry.coordinates.flat(2);
      const lngs = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80, duration: 1000 }
      );
    });
    return div;
  }

  container.innerHTML = '';
  top3.forEach((e, i) => container.appendChild(makeItem(e, `TOP ${i + 1}`, 'top')));

  const divider = document.createElement('div');
  divider.className = 'featured-divider';
  container.appendChild(divider);

  bot3.forEach((e, i) => container.appendChild(makeItem(e, `BOT ${i + 1}`, 'bot')));
}

// ── Sidebar variable buttons ─────────────────────────────────
function buildSidebar(map) {
  const container = document.getElementById('var-list');
  if (!container) return;

  VARIABLES.forEach(v => {
    const btn = document.createElement('button');
    btn.className   = 'var-btn';
    btn.textContent = v.label_en;
    btn.dataset.id  = v.id;

    if (v.id === activeVar) btn.classList.add('active');

    btn.addEventListener('click', async () => {
      activeVar = v.id;
      document.querySelectorAll('.var-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.keys(dataCache).forEach(levelId => {
        recolorLevel(map, levelId, dataCache[levelId], activeVar);
      });

      updateFeatured(map);
    });

    container.appendChild(btn);
  });
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  const map = initMap();
  window._map = map;

  map.on('load', async () => {
    const geo  = await loadGeo('provinces');
    const data = await loadData('provinces');
    addLevel(map, 'provinces', geo, data, activeVar);
    setActiveLevel(map, 'provinces');
    addRoadsOverlay(map, '94c1fe33310f3dfe');

    // pre-load municipalities in background
    loadGeo('municipalities').then(async geo => {
      const data = await loadData('municipalities');
      addLevel(map, 'municipalities', geo, data, activeVar);
      raiseOverlays(map);
      updateFeatured(map);
    });

    // zoom switching
    const loading = new Set();
    map.on('zoom', async () => {
      const zoom   = map.getZoom();
      const active = LEVELS.find(l => zoom >= l.minZoom && zoom < l.maxZoom);
      if (!active) return;
      if (loading.has(active.id)) return;
      if (!dataCache[active.id]) {
        loading.add(active.id);
        const geo  = await loadGeo(active.id);
        const data = await loadData(active.id);
        addLevel(map, active.id, geo, data, activeVar);
        raiseOverlays(map);
        loading.delete(active.id);
      }
      setActiveLevel(map, active.id);
      activeLevel = active.id;
    });

    buildSidebar(map);
    buildJumpTo(map);
    setupHover(map, () => activeLevel, () => activeVar);
    setupClick(map, () => activeLevel, () => dataCache, () => VARIABLE_MAP, () => DEFAULT_YEAR);

    initMinimap(map);
    updateFeatured(map);
  });
}

init();
