// main.js — entry point

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [1.7, 41.7],
  zoom: 7,
  minZoom: 5,
  maxZoom: 16,
});

map.on('load', () => {
  console.log('Map loaded ✓');
  loadProvinces();
});

async function loadProvinces() {
  const geoRes  = await fetch('geo/provinces.geojson');
  const geo     = await geoRes.json();

  const dataRes = await fetch('data/provinces.json');
  const data    = await dataRes.json();

  geo.features.forEach(f => {
    const id       = f.properties.CPRO;
    const areaData = data[id];
    if (areaData) {
      f.properties.net_income_pc = areaData.net_income_pc?.['2023'] ?? null;
    }
  });

  map.addSource('provinces', {
    type: 'geojson',
    data: geo,
  });

  map.addLayer({
    id:     'provinces-fill',
    type:   'fill',
    source: 'provinces',
    paint:  {
      'fill-color':   '#7b3db0',
      'fill-opacity': 0.6,
    },
  });

  map.addLayer({
    id:     'provinces-line',
    type:   'line',
    source: 'provinces',
    paint:  {
      'line-color': '#0d1117',
      'line-width': 1.5,
    },
  });

  console.log('Provinces loaded ✓', geo.features.length, 'features');
}