const DATE_FORMAT_MAP = {
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
  'DD MMM YYYY': 'dd MMM yyyy',
};

const DEFAULT_DATE_FORMAT = 'MMM dd, yyyy';

let state = {
  dateFormat: DEFAULT_DATE_FORMAT,
  timeFormat: '12h',
};

export function applySystemSettings(system = {}) {
  state = {
    dateFormat: DATE_FORMAT_MAP[system.dateFormat] || DEFAULT_DATE_FORMAT,
    timeFormat: system.timeFormat === '24h' ? '24h' : '12h',
  };
}

export function getSystemDateFormat() {
  return state.dateFormat;
}

export function getSystemTimeFormat() {
  return state.timeFormat;
}
