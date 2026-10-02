// The dashboard's attendance export as a designed, printable report (opens a print window: "Save as PDF").
// Self-contained HTML so it prints the same everywhere and needs no PDF library. Every number is
// computed by the dashboard from the same attendance records its cards use, so the report and the
// screen cannot disagree.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const fmtLong = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);

function chartSvg(rows) {
  const W = 700;
  const H = 150;
  const pad = { l: 28, r: 6, t: 8, b: 22 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(1, ...rows.map((r) => r.records));
  const slot = innerW / rows.length;
  const barW = Math.min(26, slot * 0.62);

  const bars = rows.map((r, i) => {
    const x = pad.l + slot * i + (slot - barW) / 2;
    let y = pad.t + innerH;
    const seg = (n, color) => {
      if (!n) return '';
      const h = (n / max) * innerH;
      y -= h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1.5"/>`;
    };
    const label = rows.length <= 14 || i % 2 === 0
      ? `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="8" fill="#6b7280">${esc(fmtDay(r.key).split(',')[1]?.trim() || r.key.slice(5))}</text>`
      : '';
    return seg(r.onTime, '#10b981') + seg(r.late, '#f59e0b') + seg(r.earlyLeave, '#3b82f6') + seg(r.absent, '#ef4444') + label;
  }).join('');

  const grid = [0, 0.5, 1].map((f) => {
    const gy = pad.t + innerH - f * innerH;
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${gy}" y2="${gy}" stroke="#e5e7eb" stroke-width="0.6"/><text x="${pad.l - 4}" y="${gy + 3}" text-anchor="end" font-size="8" fill="#9ca3af">${Math.round(max * f)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily attendance">${grid}${bars}</svg>`;
}

export function openAttendanceReport({ rows, days, preparedBy = '' }) {
  const total = rows.reduce((a, r) => ({
    records: a.records + r.records, onTime: a.onTime + r.onTime, late: a.late + r.late,
    earlyLeave: a.earlyLeave + r.earlyLeave, absent: a.absent + r.absent, onLeave: a.onLeave + r.onLeave, attended: a.attended + r.attended,
  }), { records: 0, onTime: 0, late: 0, earlyLeave: 0, absent: 0, onLeave: 0, attended: 0 });

  const from = rows[0]?.key;
  const to = rows[rows.length - 1]?.key;
  const rate = pct(total.attended, total.records);
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

  const tile = (label, value, sub, color) => `
    <div class="tile"><div class="tile-bar" style="background:${color}"></div>
      <div class="tile-label">${esc(label)}</div><div class="tile-value">${esc(value)}</div><div class="tile-sub">${esc(sub)}</div></div>`;

  const bodyRows = rows.map((r) => `
    <tr class="${r.records ? '' : 'empty'}">
      <td>${esc(fmtDay(r.key))}</td><td class="n">${r.records}</td>
      <td class="n">${r.onTime}</td><td class="n">${r.late}</td><td class="n">${r.earlyLeave}</td><td class="n">${r.absent}</td><td class="n">${r.onLeave}</td>
      <td class="n strong">${r.records ? `${r.rate}%` : '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Attendance report - ${esc(from)} to ${esc(to)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 24px; background: #fff; }
  .bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
  .bar button { padding:8px 14px; font-size:13px; cursor:pointer; border:1px solid #d1d5db; background:#fff; border-radius:8px; margin-left:8px; }
  .bar button.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
  header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #2563eb; padding-bottom:12px; margin-bottom:18px; }
  .brand { font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#2563eb; }
  h1 { font-size:24px; margin:4px 0 2px; }
  .range { font-size:13px; color:#4b5563; }
  .meta { text-align:right; font-size:11px; color:#6b7280; line-height:1.6; }
  .tiles { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:18px; }
  .tile { position:relative; border:1px solid #e5e7eb; border-radius:10px; padding:12px 12px 10px; overflow:hidden; }
  .tile-bar { position:absolute; left:0; top:0; bottom:0; width:4px; }
  .tile-label { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; font-weight:600; }
  .tile-value { font-size:22px; font-weight:700; margin:4px 0 2px; }
  .tile-sub { font-size:10px; color:#6b7280; }
  h2 { font-size:13px; margin:0 0 8px; text-transform:uppercase; letter-spacing:.06em; color:#374151; }
  .legend { display:flex; gap:14px; font-size:10px; color:#4b5563; margin:4px 0 14px; }
  .legend i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#f3f4f6; text-align:left; padding:7px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#4b5563; border-bottom:1px solid #d1d5db; }
  td { padding:6px 8px; border-bottom:1px solid #eef0f3; }
  .n { text-align:right; font-variant-numeric:tabular-nums; } th.n { text-align:right; }
  .strong { font-weight:700; } tr.empty td { color:#9ca3af; }
  tr.total td { border-top:2px solid #111827; background:#f9fafb; font-weight:700; }
  .note { margin-top:14px; font-size:10px; color:#6b7280; line-height:1.6; }
  footer { margin-top:18px; padding-top:8px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; display:flex; justify-content:space-between; }
  thead { display: table-header-group; } tr { page-break-inside: avoid; }
  @media print { .bar { display:none; } body { padding:0; } }
</style></head><body>
  <div class="bar"><span style="font-size:12px;color:#6b7280">Choose “Save as PDF” as the destination in the print window.</span>
    <span><button class="primary" onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></span></div>

  <header>
    <div><div class="brand">WorkForce Pro</div><h1>Attendance Report</h1>
      <div class="range">${esc(fmtLong(from))} – ${esc(fmtLong(to))} · last ${days} days</div></div>
    <div class="meta">Generated ${esc(generated)}${preparedBy ? `<br>Prepared by ${esc(preparedBy)}` : ''}<br>Source: attendance records (clock-in / clock-out)</div>
  </header>

  <div class="tiles">
    ${tile('Attendance rate', `${rate}%`, `${total.attended} attended of ${total.records} records`, '#2563eb')}
    ${tile('On time', total.onTime, `${pct(total.onTime, total.records)}% of records`, '#10b981')}
    ${tile('Late', total.late, `${pct(total.late, total.records)}% of records`, '#f59e0b')}
    ${tile('Early leave', total.earlyLeave, `${pct(total.earlyLeave, total.records)}% of records`, '#3b82f6')}
    ${tile('Absent', total.absent, `${pct(total.absent, total.records)}% of records`, '#ef4444')}
  </div>

  <h2>Daily attendance</h2>
  ${chartSvg(rows)}
  <div class="legend"><span><i style="background:#10b981"></i>On time</span><span><i style="background:#f59e0b"></i>Late</span><span><i style="background:#3b82f6"></i>Early leave</span><span><i style="background:#ef4444"></i>Absent</span></div>

  <h2>Day by day</h2>
  <table>
    <thead><tr><th>Date</th><th class="n">Records</th><th class="n">On time</th><th class="n">Late</th><th class="n">Early leave</th><th class="n">Absent</th><th class="n">On leave</th><th class="n">Rate</th></tr></thead>
    <tbody>${bodyRows}
      <tr class="total"><td>Total</td><td class="n">${total.records}</td><td class="n">${total.onTime}</td><td class="n">${total.late}</td><td class="n">${total.earlyLeave}</td><td class="n">${total.absent}</td><td class="n">${total.onLeave}</td><td class="n">${rate}%</td></tr>
    </tbody>
  </table>

  <p class="note"><strong>How to read this:</strong> one record = one employee's attendance for one day. <em>Attendance rate</em> = records where the employee attended (on time, late or left early) ÷ all records × 100. Days with no records are shown as “—”, never skipped.</p>
  <footer><span>WorkForce Pro · Attendance Report</span><span>${esc(from)} to ${esc(to)}</span></footer>
</body></html>`;

  const win = window.open('', '_blank', 'width=980,height=900');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the window a moment to lay out before the print dialog opens.
  setTimeout(() => { try { win.print(); } catch { /* the Print button is still there */ } }, 400);
  return true;
}
