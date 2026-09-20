export function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n');
}

export function downloadCSV(filename, rows) {
  const csv = toCSV(rows);
  if (!csv) return;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function toHTMLTable(headers, rows) {
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// lower-cased aliases kept for new self-service pages
export const toCsv = toCSV;
export const downloadCsv = downloadCSV;

export const formatPhp = (value, locale = 'en-PH') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);

export const printElementAsPdf = (element, title = '') => {
  const source = element?.outerHTML || '';
  const height = Math.max(800, (element?.scrollHeight || 800) + 100);
  const win = window.open('', '_blank', `width=900,height=${height}`);
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title || 'Print'}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .print-sub { color: #555; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; }
    .totals td { font-weight: 600; background: #f3f4f6; }
    @media print {
      body { margin: 16mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <table class="no-print" style="margin-bottom:16px;border:0"><tr><td style="border:0">
    <button style="padding:8px 16px;font-size:13px;cursor:pointer" onclick="window.print()">Print / Save as PDF</button>
    <button style="padding:8px 16px;font-size:13px;cursor:pointer;margin-left:8px" onclick="window.close()">Close</button>
  </td></tr></table>
  ${source}
</body>
</html>`);
  win.document.close();
};