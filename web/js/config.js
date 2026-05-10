// config.js - all frontend configuration

export const COLOR_SCALES = {
  // ColorBrewer OrRd - sequential, colorblind safe, for income variables
  // low value = light, high value = dark red
  sequential: ['#fef0d9', '#fdcc8a', '#fc8d59', '#d7301f'],

  // ColorBrewer PuOr - diverging, colorblind safe, for inequality variables
  // low value = orange, mid = neutral, high value = purple
  diverging: ['#e66101', '#fdb863', '#b2abd2', '#5e3c99'],
};



export const VARIABLES = [
  {
    id:       'net_income_pc',
    label_en: 'Net income per capita',
    label_es: 'Renta neta media por persona',
    label_ca: 'Renda neta mitjana per persona',
    unit:     'EUR',
    decimals: 0,
    colorScale: 'sequential',
  },
  {
    id:       'net_income_hh',
    label_en: 'Net income per household',
    label_es: 'Renta neta media por hogar',
    label_ca: 'Renda neta mitjana per llar',
    unit:     'EUR',
    decimals: 0,
    colorScale: 'sequential',
  },
  {
    id:       'mean_income_cu',
    label_en: 'Mean income per consumption unit',
    label_es: 'Media de la renta por unidad de consumo',
    label_ca: 'Mitjana de la renda per unitat de consum',
    unit:     'EUR',
    decimals: 0,
    colorScale: 'sequential',
  },
  {
    id:       'median_income_cu',
    label_en: 'Median income per consumption unit',
    label_es: 'Mediana de la renta por unidad de consumo',
    label_ca: 'Mediana de la renda per unitat de consum',
    unit:     'EUR',
    decimals: 0,
    colorScale: 'sequential',
  },
  {
    id:       'gross_income_pc',
    label_en: 'Gross income per capita',
    label_es: 'Renta bruta media por persona',
    label_ca: 'Renda bruta mitjana per persona',
    unit:     'EUR',
    decimals: 0,
    colorScale: 'sequential',
  },
  {
    id:       'gross_income_hh',
    label_en: 'Gross income per household',
    label_es: 'Renta bruta media por hogar',
    label_ca: 'Renda bruta mitjana per llar',
    unit:     'EUR',
    decimals: 0,
    colorScale: 'sequential',
  },
];

// lookup by id - used everywhere in the app
export const VARIABLE_MAP = Object.fromEntries(VARIABLES.map(v => [v.id, v]));

// geographic levels - add comarques/marques here in the future
export const LEVELS = [
  { id: 'provinces',      label_en: 'Provinces',      minZoom: 0,  maxZoom: 7.5, idCol: 'CPRO'  },
  { id: 'municipalities', label_en: 'Municipalities',  minZoom: 7.5, maxZoom: 10, idCol: 'CUMUN' },
  { id: 'tracts',         label_en: 'Census tracts',   minZoom: 10, maxZoom: 22,  idCol: 'CUSEC' },
];

export const DEFAULT_VARIABLE = 'net_income_pc';
export const DEFAULT_YEAR     = 2023;