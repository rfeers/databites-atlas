// map.js - all MapLibre logic

import { LEVELS, VARIABLE_MAP, DEFAULT_YEAR, COLOR_SCALES } from './config.js';

// tracks which levels are loaded
const loadedLevels = new Set();

export function initMap() {
  const map = new maplibregl.Map({
    container: 'map',
    style:     'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json',
//  style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json', light version
    center:    [1.7, 41.7],
    zoom:      7,
    minZoom:   5,
    maxZoom:   16,
  });
  return map;
}

export function addLevel(map, levelId, geo, data, varId) {
  const level  = LEVELS.find(l => l.id === levelId);
  const varCfg = VARIABLE_MAP[varId];

  const colored = joinAndColor(geo, data, level.idCol, varId, varCfg, DEFAULT_YEAR);

  map.addSource(levelId, {
    type: 'geojson',
    data: colored,
  });

  map.addLayer({
    id:     `${levelId}-fill`,
    type:   'fill',
    source: levelId,
    paint:  {
      'fill-color':   ['coalesce', ['get', '_color'], '#1a1a2e'],
      'fill-opacity': 0.55,
    },
  });

  map.addLayer({
    id:     `${levelId}-line`,
    type:   'line',
    source: levelId,
    paint:  {
      'line-color': '#0d1117',
      'line-width': levelId === 'tracts' ? 0.3 : 1,
    },
  });

  loadedLevels.add(levelId);
}

export function recolorLevel(map, levelId, data, varId) {
  if (!loadedLevels.has(levelId)) return;

  const level  = LEVELS.find(l => l.id === levelId);
  const varCfg = VARIABLE_MAP[varId];
  const source = map.getSource(levelId);
  if (!source) return;

  const geo     = source._data;
  const colored = joinAndColor(geo, data, level.idCol, varId, varCfg, DEFAULT_YEAR);
  source.setData(colored);
}

function joinAndColor(geo, data, idCol, varId, varCfg, year) {
  const values = [];
  geo.features.forEach(f => {
    const id    = f.properties[idCol];
    const entry = data[id];
    const val   = entry?.[varId]?.[year];
    if (val != null) values.push(val);
  });

  if (values.length === 0) return geo;

  const min     = Math.min(...values);
  const max     = Math.max(...values);
  const scale   = COLOR_SCALES[varCfg.colorScale];
  const colorFn = chroma.scale(scale).domain([min, max]);

  const features = geo.features.map(f => {
    const id    = f.properties[idCol];
    const entry = data[id];
    const val   = entry?.[varId]?.[year];
    return {
      ...f,
      properties: {
        ...f.properties,
        _value: val ?? null,
        _color: val != null ? colorFn(val).hex() : '#1a1a2e',
      },
    };
  });

  return { ...geo, features };
}

export function setActiveLevel(map, levelId) {
  LEVELS.forEach(level => {
    if (!loadedLevels.has(level.id)) return;
    const visibility = level.id === levelId ? 'visible' : 'none';
    map.setLayoutProperty(`${level.id}-fill`, 'visibility', visibility);
    map.setLayoutProperty(`${level.id}-line`, 'visibility', visibility);
  });
}

export function setupZoomLevels(map, dataCache, varId, onLevelChange) {
  map.on('zoom', () => {
    const zoom   = map.getZoom();
    const active = LEVELS.find(l => zoom >= l.minZoom && zoom < l.maxZoom);
    if (!active) return;
    if (!loadedLevels.has(active.id)) {
      addLevel(map, active.id, window._geoCache[active.id], dataCache, varId);
    }
    setActiveLevel(map, active.id);
    onLevelChange(active.id);
  });
}