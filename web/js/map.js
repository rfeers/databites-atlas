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

  if (map.getSource(levelId)) return;

  map.addSource(levelId, {
    type:      'geojson',
    data:      colored,
    promoteId: level.idCol,
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

  map.addLayer({
    id:     `${levelId}-highlight`,
    type:   'line',
    source: levelId,
    paint:  {
      'line-color':   '#ffffff',
      'line-width':   2.5,
      'line-opacity': [
        'case',
        ['boolean', ['feature-state', 'hovered'], false],
        1,
        0
      ],
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

export function setupZoomLevels(map, onZoom) {
  map.on('zoom', () => {
    const zoom = map.getZoom();
    const active = LEVELS.find(l => zoom >= l.minZoom && zoom < l.maxZoom);
    if (!active) return;
    onZoom(active.id);
  });
}

export function setupHover(map, getActiveLevel, getActiveVar) {
  const tooltip = document.getElementById('tooltip');
  let hoveredId  = null;
  let hoveredLevel = null;

  LEVELS.forEach(level => {

    map.on('mouseenter', `${level.id}-fill`, () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', `${level.id}-fill`, () => {
      map.getCanvas().style.cursor = '';
      tooltip.style.display = 'none';
      if (hoveredId !== null && hoveredLevel) {
        map.setFeatureState(
          { source: hoveredLevel, id: hoveredId },
          { hovered: false }
        );
      }
      hoveredId    = null;
      hoveredLevel = null;
    });

    map.on('mousemove', `${level.id}-fill`, (e) => {
      if (!e.features?.length) return;

      const feature = e.features[0];
      const props   = feature.properties;
      const varId   = getActiveVar();
      const varCfg  = VARIABLE_MAP[varId];
      const value   = props._value;

      // update highlight
      if (hoveredId !== null && hoveredLevel) {
        map.setFeatureState(
          { source: hoveredLevel, id: hoveredId },
          { hovered: false }
        );
      }
      hoveredId    = feature.id;
      hoveredLevel = level.id;
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: level.id, id: hoveredId },
          { hovered: true }
        );
      }

      // build name
      let name = '';
      if (level.id === 'provinces') {
        name = `${props.province_name || props.CPRO}`;
      } else if (level.id === 'municipalities') {
        name = `${props.NMUN || ''} <span class="tooltip-id">(${props.CUMUN || ''})</span>`;
      } else {
        name = `${props.NMUN || ''} <span class="tooltip-id">(${props.CUSEC || ''})</span>`;
      }

      // format value
      const formatted = value != null
        ? varCfg.unit === 'EUR'
          ? `€${Math.round(value).toLocaleString('es-ES')}`
          : value.toFixed(varCfg.decimals)
        : 'No data';

      tooltip.style.display = 'block';
      tooltip.style.left    = `${e.point.x + 14}px`;
      tooltip.style.top     = `${e.point.y - 44}px`;
      tooltip.innerHTML     = `
        <div class="tooltip-name">${name}</div>
        <div class="tooltip-value">${formatted}</div>
        <div class="tooltip-label">${varCfg.label_en}</div>
      `;
    });
  });
}