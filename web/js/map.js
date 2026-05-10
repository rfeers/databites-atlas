// map.js - all MapLibre logic

import { LEVELS, VARIABLE_MAP, DEFAULT_YEAR, COLOR_SCALES } from './config.js';

// tracks which levels are loaded
const loadedLevels = new Set();

export function initMap() {
  const map = new maplibregl.Map({
    container: 'map',
    style: `https://api.protomaps.com/styles/v4/black/en.json?key=94c1fe33310f3dfe`,
//  style: `https://api.protomaps.com/styles/v4/grayscale/en.json?key=94c1fe33310f3dfe`,
//  all styles: light, white, dark, black, grayscale
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
      'fill-opacity': 0.65,
      'fill-outline-color': 'rgba(0,0,0,0)',
    },
  });

  if (levelId === 'tracts') {
    map.addLayer({
      id:     `${levelId}-line`,
      type:   'line',
      source: levelId,
      paint:  {
        'line-color':   '#ffffff',
        'line-width':   0.25,
        'line-opacity': 0.25,
      },
    });
  }

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
    if (map.getLayer(`${level.id}-line`)) {
      map.setLayoutProperty(`${level.id}-line`, 'visibility', visibility);
    }
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
  let hoveredId    = null;
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

export function setupClick(map, getActiveLevel, getAllData, getVarMap, getYear) {
  const panel    = document.getElementById('detail-panel');
  const titleEl  = document.getElementById('detail-title');
  const rowsEl   = document.getElementById('detail-rows');
  const closeBtn = document.getElementById('detail-close');

  function closePanel() {
    panel.style.display = 'none';
  }

  closeBtn.addEventListener('click', closePanel);

  LEVELS.forEach(level => {
    map.on('click', `${level.id}-fill`, (e) => {
      if (!e.features?.length) return;

      const props    = e.features[0].properties;
      const allData  = getAllData();
      const varMap   = getVarMap();
      const year     = getYear();
      const levelId  = level.id;
      const idCol    = level.idCol;
      const areaId   = props[idCol];
      const areaData = allData[levelId]?.[areaId];

      // build title
      let nameLine = '';
      let codeLine = '';
      if (levelId === 'provinces') {
        nameLine = props.province_name || props.CPRO;
        codeLine = `Province ${props.CPRO}`;
      } else if (levelId === 'municipalities') {
        nameLine = props.NMUN || props.CUMUN;
        codeLine = `Municipality ${props.CUMUN}`;
      } else {
        nameLine = props.NMUN || '';
        codeLine = `Census tract ${props.CUSEC}`;
      }

      titleEl.innerHTML = `${nameLine}<span>${codeLine}</span>`;

      const levelLookup = allData[levelId] || {};

      rowsEl.innerHTML = '';
      Object.entries(varMap).forEach(([varId, varCfg]) => {
        const val = areaData?.[varId]?.[year];

        const allVals = Object.values(levelLookup)
          .map(d => d?.[varId]?.[year])
          .filter(v => v != null);
        const min = Math.min(...allVals);
        const max = Math.max(...allVals);
        const pct = allVals.length && val != null
          ? Math.round(((val - min) / (max - min)) * 100)
          : null;

        const formatted = val != null
          ? varCfg.unit === 'EUR'
            ? `€${Math.round(val).toLocaleString('es-ES')}`
            : val.toFixed(varCfg.decimals)
          : 'No data';

        const row = document.createElement('div');
        row.className = 'detail-row';
        row.innerHTML = `
          <div class="detail-row-header">
            <div class="detail-row-label">${varCfg.label_en}</div>
            <div class="detail-row-value">${formatted}</div>
          </div>
          ${pct != null ? `
          <div class="detail-bar-track">
            <div class="detail-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="detail-row-pct">Top ${100 - pct}% in Catalonia</div>
          ` : ''}
        `;
        rowsEl.appendChild(row);
      });

      panel.style.display = 'block';
      e.stopPropagation();
    });
  });

  map.on('click', (e) => {
    if (!e.defaultPrevented) closePanel();
  });
}

export function addRoadsOverlay(map, apiKey) {
  map.addSource('protomaps-roads', {
    type: 'vector',
    url: `https://api.protomaps.com/tiles/v4.json?key=${apiKey}`,
  });

// major roads -- casing (dark border)
  map.addLayer({
    id: 'roads-major-casing',
    type: 'line',
    source: 'protomaps-roads',
    'source-layer': 'roads',
    filter: ['in', ['get', 'kind'], ['literal', ['major_road', 'highway']]],
    paint: {
      'line-color': '#e8e0d0',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 12, 6, 16, 12],
      'line-opacity': 0.5,
    },
  });

  // major roads -- fill (light top)
  map.addLayer({
    id: 'roads-major',
    type: 'line',
    source: 'protomaps-roads',
    'source-layer': 'roads',
    filter: ['in', ['get', 'kind'], ['literal', ['major_road', 'highway']]],
    paint: {
      'line-color': '#111111',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 3, 16, 7],
      'line-opacity': 0.5,
    },
  });

  // secondary roads -- casing
  map.addLayer({
    id: 'roads-secondary-casing',
    type: 'line',
    source: 'protomaps-roads',
    'source-layer': 'roads',
    filter: ['in', ['get', 'kind'], ['literal', ['medium_road', 'minor_road']]],
    paint: {
      'line-color': '#111111',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 3, 16, 7],
      'line-opacity': 0.5,
    },
  });

  // secondary roads -- fill
  map.addLayer({
    id: 'roads-secondary',
    type: 'line',
    source: 'protomaps-roads',
    'source-layer': 'roads',
    filter: ['in', ['get', 'kind'], ['literal', ['medium_road', 'minor_road']]],
    paint: {
      'line-color': '#d4ccc0',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.5, 16, 4],
      'line-opacity': 0.5,
    },
  });

  // buildings fill
  map.addLayer({
    id: 'buildings-overlay',
    type: 'fill',
    source: 'protomaps-roads',
    'source-layer': 'buildings',
    minzoom: 14,
    paint: {
      'fill-color': '#ffffff',
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.0, 15, 0.08, 16, 0.15],
    },
  });

  // building outlines
  map.addLayer({
    id: 'buildings-outline',
    type: 'line',
    source: 'protomaps-roads',
    'source-layer': 'buildings',
    minzoom: 14,
    paint: {
      'line-color': '#ffffff',
      'line-width': 0.5,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.0, 15, 0.5, 16, 0.9],
    },
  });
}

export function raiseOverlays(map) {
  const overlays = [
    'roads-major-casing', 'roads-major',
    'roads-secondary-casing', 'roads-secondary',
    'buildings-overlay', 'buildings-outline'
  ];
  overlays.forEach(id => {
    if (map.getLayer(id)) map.moveLayer(id);
  });
}