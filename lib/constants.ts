export const PALETA_TIPO: Record<string, string> = {
  ARGY:     '#636efa', // violeta
  ETF:      '#00cc96', // verde
  FCI:      '#ffa15a', // naranja
  ACCIONES: '#ef553b', // rojo
  ACCION:   '#ef553b', // rojo (alias)
  CRIPTO:   '#f5c518', // amarillo
  BONOS:    '#19d3f3', // celeste
  OTRO:     '#aaaaaa', // gris
};

export const RIESGO_COLOR: Record<string, string> = {
  'CONSERVADOR':   '#2dc653', // verde
  'MODERADO':      '#19d3f3', // celeste
  'MODERADO-ALTO': '#ffa15a', // naranja
  'AGRESIVO':      '#ef553b', // rojo
};

export const RIESGO_LABEL: Record<number, string> = {
  1: 'CONSERVADOR',
  2: 'MODERADO',
  3: 'MODERADO-ALTO',
  4: 'AGRESIVO',
};

export const RENTA_LABEL: Record<string, string> = {
  'VAR': 'VARIABLE',
};

export const GEO_LABEL: Record<string, string> = {
  'EU':   'EEUU',
  'EMER': 'EMERGENTES',
  'GLO':  'GLOBAL',
  'DES':  'DESARROLLADOS',
};

export const MONEDA_LABEL: Record<string, string> = {
  'BAD': 'BADLAR',
};

export const MONEDA_COLOR: Record<string, string> = {
  'USD':    '#3b82f6', // azul
  'PESO':   '#a78bfa', // violeta
  'ARS':    '#a78bfa', // violeta (alias)
  'CER':    '#00cc96', // verde
  'DL':     '#ffa15a', // naranja
  'BAD':    '#f5c518', // amarillo
  'BADLAR': '#f5c518', // amarillo (alias)
  'USDC':   '#ef553b', // rojo
};

export const RENTA_COLOR: Record<string, string> = {
  'VARIABLE': '#fb923c', // naranja
  'VAR':      '#fb923c',
  'FIJA':     '#19d3f3', // celeste
};

export const GEO_COLOR: Record<string, string> = {
  'ARG':           '#636efa', // violeta
  'EU':            '#00cc96', // verde
  'EEUU':          '#00cc96',
  'EMER':          '#ef553b', // rojo
  'EMERGENTES':    '#ef553b',
  'GLO':           '#ffa15a', // naranja
  'GLOBAL':        '#ffa15a',
  'DES':           '#19d3f3', // celeste
  'DESARROLLADOS': '#19d3f3',
};
