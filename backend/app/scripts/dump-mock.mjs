import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mockDir = path.resolve(fileURLToPath(new URL('../../frontend/src/mock-data', import.meta.url)));
const outDir = path.resolve(fileURLToPath(new URL('../database/mock', import.meta.url)));

mkdirSync(outDir, { recursive: true });

const modules = {
  employees: 'employees.js',
  attendance: 'attendance.js',
  leaves: 'leaves.js',
  shifts: 'shifts.js',
  timesheets: 'timesheets.js',
  notifications: 'notifications.js',
  departments: 'departments.js',
  roles: 'roles.js',
  settings: 'settings.js',
  company: 'company.js',
  reports: 'reports.js',
  analytics: 'analytics.js',
};

function write(name, data) {
  writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`dumped ${name}.json`);
}

for (const [name, file] of Object.entries(modules)) {
  const mod = await import(pathToFileURL(path.join(mockDir, file)).href);
  const payload = {};
  for (const [key, value] of Object.entries(mod)) {
    if (key === 'default') continue;
    payload[key] = value;
  }
  if (mod.default !== undefined) payload._default = mod.default;
  write(name, payload);
}

console.log('done');
