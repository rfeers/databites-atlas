// main.js - entry point, wires everything together

import { LEVELS, VARIABLES, DEFAULT_VARIABLE, VARIABLE_MAP, DEFAULT_YEAR } from './config.js';
import { initMap, addLevel, recolorLevel, setActiveLevel, setupHover, setupClick, addRoadsOverlay, raiseOverlays } from './map.js';

// app state
let activeVar   = DEFAULT_VARIABLE;
let activeLevel = 'provinces';
let geoCache    = {};
let dataCache   = {};

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

async function init() {
  const map = initMap();
  window._map = map;

  map.on('load', async () => {
    // load provinces first
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

    // build sidebar
    buildSidebar(map);
    setupHover(map, () => activeLevel, () => activeVar);
    setupClick(map, () => activeLevel, () => dataCache, () => VARIABLE_MAP, () => DEFAULT_YEAR);
  });
}

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

      // recolor all loaded levels
      Object.keys(dataCache).forEach(levelId => {
        recolorLevel(map, levelId, dataCache[levelId], activeVar);
      });
    });

    container.appendChild(btn);
  });
}

init();