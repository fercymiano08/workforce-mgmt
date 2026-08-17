import { Printer, Download, FileBarChart } from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import BrandLogo from '../ui/BrandLogo';
import { downloadCSV, downloadFile, toHTMLTable } from '../../utils/export';
import { useToast } from '../../context/ToastContext';

const summaryColors = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', value: 'text-blue-900' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', value: 'text-emerald-900' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', value: 'text-amber-900' },
  red: { bg: 'bg-red-50', text: 'text-red-700', value: 'text-red-900' },
};

function SummaryCard({ item }) {
  const c = summaryColors[item.color] || summaryColors.blue;
  return (
    <div className={`${c.bg} rounded-xl p-4`}>
      <p className={`text-xs font-semibold ${c.text} uppercase tracking-wide`}>{item.label}</p>
      <p className={`text-xl font-bold ${c.value} mt-1`}>{item.value}</p>
    </div>
  );
}

function ChartSection({ chart }) {
  if (chart.type === 'pie') {
    return (
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">{chart.title}</p>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={chart.data} dataKey={chart.dataKey} nameKey={chart.nameKey} cx="50%" cy="50%" outerRadius={75} innerRadius={35} paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {chart.data.map((_, i) => <Cell key={i} fill={chart.colors?.[i % chart.colors.length] || '#3b82f6'} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{chart.title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart.data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {chart.dataKeys.map((dk, i) => (
            <Bar key={dk} dataKey={dk} fill={chart.colors?.[i] || '#3b82f6'} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ReportPreview({ report }) {
  const { toast } = useToast();
  if (!report) return null;

  const handleExport = (format) => {
    const rows = report.rows.map((r) => {
      const obj = {};
      report.cols.forEach((col, i) => { obj[col] = r[i]; });
      return obj;
    });
    const base = `report-${(report.title || 'export').toLowerCase().replace(/\s+/g, '-')}`;
    if (format === 'csv') {
      downloadCSV(`${base}.csv`, rows);
    } else if (format === 'excel') {
      downloadFile(`${base}.xls`, toHTMLTable(report.cols, report.rows), 'application/vnd.ms-excel;charset=utf-8;');
    } else {
      handlePrint();
      return;
    }
    toast.success('Export Complete', `Report exported as ${format.toUpperCase()}.`);
  };

  const handlePrint = () => {
    if (!report) return;
    const printWin = window.open('', '_blank', 'width=900,height=1100');
    if (!printWin) return;

    // Capture chart SVGs from rendered DOM before opening window
    const chartSvgs = [];
    document.querySelectorAll('#report-document .recharts-wrapper').forEach((el) => {
      const svg = el.querySelector('svg');
      if (svg) chartSvgs.push(svg.outerHTML);
    });

    const logoEl = document.querySelector('img[alt="ARCHON NELL"]');
    const logoSrc = logoEl?.src || '';

    const summaryCols = report.summary.length <= 2 ? 'repeat(2, 1fr)' : report.summary.length <= 4 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';
    const summaryColorMap = { blue: ['#eff6ff','#2563eb','#1e40af'], green: ['#ecfdf5','#059669','#065f46'], amber: ['#fffbeb','#d97706','#92400e'], red: ['#fef2f2','#dc2626','#991b1b'] };

    let summaryHtml = '';
    report.summary.forEach((item) => {
      const c = summaryColorMap[item.color] || summaryColorMap.blue;
      summaryHtml += `<div style="background:${c[0]};border-radius:10px;padding:12px 14px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${c[1]}">${item.label}</div>
        <div style="font-size:18px;font-weight:700;color:${c[2]};margin-top:3px">${item.value}</div>
      </div>`;
    });

    let tableHtml = '';
    if (report.rows.length > 0) {
      const maxRows = Math.min(report.rows.length, 30);
      tableHtml = `<table><thead><tr><th style="width:30px">#</th>${report.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
      for (let i = 0; i < maxRows; i++) {
        tableHtml += `<tr><td style="color:#94a3b8;font-size:10px">${i + 1}</td>${report.rows[i].map((cell, j) => `<td${j === 0 ? ' style="font-weight:600"' : ''}>${cell}</td>`).join('')}</tr>`;
      }
      if (report.rows.length > maxRows) {
        tableHtml += `<tr><td colspan="${report.cols.length + 1}" style="text-align:center;color:#94a3b8;font-style:italic">… and ${report.rows.length - maxRows} more records</td></tr>`;
      }
      tableHtml += '</tbody></table>';
    }

    let chartsHtml = '';
    if (chartSvgs.length > 0) {
      chartsHtml = '<div style="margin-bottom:24px">';
      chartsHtml += `<div class="section-title">Visual Analysis</div>`;
      const gridCols = chartSvgs.length >= 2 ? 'display:grid;grid-template-columns:1fr 1fr;gap:16px' : '';
      chartsHtml += `<div style="${gridCols}">`;
      chartSvgs.forEach((svg) => {
        chartsHtml += `<div style="background:#f8fafc;border-radius:8px;padding:12px"><div style="transform:scale(0.9);transform-origin:top left">${svg}</div></div>`;
      });
      chartsHtml += '</div></div>';
    }

    let insightsHtml = '';
    if (report.insights.length > 0) {
      insightsHtml = `<div style="background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;padding:16px;margin-bottom:20px">
        <div class="section-title">Key Insights</div>
        <ul style="list-style:none;padding:0;margin:0">${report.insights.map((t, i) => `<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
          <span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-top:2px">${i + 1}</span>
          <span style="font-size:11px;line-height:1.6;color:#374151">${t}</span>
        </li>`).join('')}</ul></div>`;
    }

    let recsHtml = '';
    if (report.recommendations.length > 0) {
      recsHtml = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:20px">
        <div class="section-title">Recommendations</div>
        <ul style="list-style:none;padding:0;margin:0">${report.recommendations.map((t, i) => `<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
          <span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#fde68a;color:#92400e;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-top:2px">${i + 1}</span>
          <span style="font-size:11px;line-height:1.6;color:#374151">${t}</span>
        </li>`).join('')}</ul></div>`;
    }

    const logoHtml = logoSrc ? `<img src="${logoSrc}" style="width:36px;height:36px;border-radius:8px;object-fit:contain" />` : '';

    printWin.document.write(`<!DOCTYPE html><html><head><title>${report.title}</title>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:100%;height:100%}
        body{font-family:'Poppins',sans-serif;color:#1e293b;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:white}
        @page{size:letter;margin:0}
        .page{width:216mm;min-height:279mm;margin:0;padding:5mm 4mm;display:flex;flex-direction:column}
        .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#374151;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        thead th{background:#f1f5f9;text-align:left;padding:6px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;border-bottom:2px solid #e2e8f0}
        tbody td{padding:5px 8px;font-size:10px;border-bottom:1px solid #f1f5f9;color:#334155}
        tbody tr:nth-child(even){background:#f8fafc}
        @media print{
          .page{padding:5mm 4mm}
        }
      </style>
    </head><body>
      <div class="page">
        <!-- HEADER -->
        <div style="background:linear-gradient(135deg,#0B1F3A,#3A5F9B);padding:18px 22px;border-radius:8px;color:white;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:10px">
              ${logoHtml}
              <div>
                <div style="font-size:12px;font-weight:700;letter-spacing:1.5px">ARCHON NELL INC.</div>
                <div style="font-size:9px;color:#93c5fd;margin-top:1px">Workforce Management System</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:8px;color:#93c5fd">Report Generated</div>
              <div style="font-size:10px;font-weight:600">${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
          </div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.15)">
            <div style="font-size:14px;font-weight:700">${report.title}</div>
            <div style="font-size:9px;color:#bfdbfe;margin-top:2px">${report.subtitle}</div>
            <div style="font-size:9px;color:#93c5fd;margin-top:2px">Period: ${report.period}</div>
          </div>
        </div>

        <!-- SUMMARY -->
        ${report.summary.length > 0 ? `
        <div style="margin-bottom:16px">
          <div class="section-title">Executive Summary</div>
          <div style="display:grid;grid-template-columns:${summaryCols};gap:10px">${summaryHtml}</div>
        </div>` : ''}

        <!-- CHARTS -->
        ${chartsHtml}

        <!-- TABLE -->
        ${report.rows.length > 0 ? `
        <div style="margin-bottom:16px">
          <div class="section-title">Detailed Records</div>
          ${tableHtml}
        </div>` : ''}

        <!-- INSIGHTS -->
        ${insightsHtml}

        <!-- RECOMMENDATIONS -->
        ${recsHtml}

        <!-- FILL SPACE + FOOTER -->
        <div style="flex:1"></div>
        <div style="border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between;font-size:8px;color:#9ca3af;margin-top:auto">
          <span>Confidential — Archon Nell Inc. | Workforce Management System</span>
          <span>Generated on ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>
    </body></html>`);
    printWin.document.close();
    setTimeout(() => { printWin.focus(); printWin.print(); }, 600);
  };

  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="report-preview-container">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center justify-between mb-4 no-print">
        <p className="text-sm text-gray-500">{report.rows.length} record{report.rows.length !== 1 ? 's' : ''} &middot; {report.period}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={() => handleExport('excel')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => handleExport('pdf')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Report Document */}
      <div id="report-document" className="report-document bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Company Header */}
        <div className="report-header bg-gradient-to-r from-navy-900 to-navy-700 px-8 py-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo variant="icon" className="w-10 h-10" />
              <div>
                <p className="text-sm font-bold tracking-wide">ARCHON NELL INC.</p>
                <p className="text-[11px] text-blue-200">Workforce Management System</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-blue-200">Report Generated</p>
              <p className="text-xs font-semibold">{generatedAt}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/15">
            <div className="flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-blue-300" />
              <h2 className="text-lg font-bold">{report.title}</h2>
            </div>
            <p className="text-xs text-blue-200 mt-1">{report.subtitle}</p>
            <p className="text-xs text-blue-300 mt-1">Period: {report.period}</p>
          </div>
        </div>

        {/* Report Body */}
        <div className="px-8 py-6 space-y-6">
          {/* Summary KPIs */}
          {report.summary.length > 0 && (
            <div>
              <h3 className="report-section-title text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Executive Summary</h3>
              <div className={`grid gap-3 ${report.summary.length <= 2 ? 'grid-cols-2' : report.summary.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
                {report.summary.map((item) => <SummaryCard key={item.label} item={item} />)}
              </div>
            </div>
          )}

          {/* Charts */}
          {report.charts.length > 0 && (
            <div>
              <h3 className="report-section-title text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Visual Analysis</h3>
              <div className={`grid gap-5 ${report.charts.length >= 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                {report.charts.map((chart, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4">
                    <ChartSection chart={chart} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Table */}
          {report.rows.length > 0 && (
            <div className="report-page-break">
              <h3 className="report-section-title text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Detailed Records</h3>
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-100/50">
                        <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">#</th>
                        {report.cols.map((col) => (
                          <th key={col} className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-100/50 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                          {row.map((cell, j) => (
                            <td key={j} className={`px-4 py-2.5 text-gray-900 ${j === 0 ? 'font-medium' : 'text-gray-600'}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Insights */}
          {report.insights.length > 0 && (
            <div className="report-page-break">
              <h3 className="report-section-title text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Key Insights</h3>
              <div className="bg-blue-50/50 rounded-xl p-5 border border-blue-100">
                <ul className="space-y-2.5">
                  {report.insights.map((text, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-sm text-gray-700 leading-relaxed">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div className="report-page-break">
              <h3 className="report-section-title text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Recommendations</h3>
              <div className="bg-amber-50/50 rounded-xl p-5 border border-amber-100">
                <ul className="space-y-2.5">
                  {report.recommendations.map((text, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-sm text-gray-700 leading-relaxed">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Empty State */}
          {report.rows.length === 0 && report.insights.length === 0 && (
            <div className="text-center py-12">
              <FileBarChart className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-500 mt-3">No data found for the selected period.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="report-footer bg-gray-50 border-t border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400">Confidential — Archon Nell Inc. | Workforce Management System</p>
            <p className="text-[11px] text-gray-400">Generated on {generatedAt}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
