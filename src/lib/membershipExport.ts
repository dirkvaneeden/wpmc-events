import { ApplicationRow, appRef, statusMeta } from '@/lib/membershipApplications';

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const yn = (b: boolean | null | undefined) => (b ? 'Yes' : 'No');

/**
 * Builds an .xlsx of the given applications in the browser and downloads it.
 * Sheet 1 "Applications": one row per application.
 * Sheet 2 "Dependants": one row per partner / junior member.
 */
export async function downloadApplicationsXlsx(rows: ApplicationRow[], filename?: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WPMC';
  wb.created = new Date();

  // ----- Applications -----
  const ws = wb.addWorksheet('Applications', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Reference', key: 'ref', width: 12 },
    { header: 'Received', key: 'received', width: 20 },
    { header: 'Year', key: 'year', width: 7 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Status', key: 'status', width: 24 },
    { header: 'Payment received', key: 'paid', width: 16 },
    { header: 'Payment confirmed on', key: 'paid_on', width: 20 },
    { header: 'Payment confirmed by', key: 'paid_by', width: 26 },
    { header: 'Proof of payment attached', key: 'pop', width: 14 },
    { header: 'Membership no.', key: 'member_no', width: 15 },
    { header: 'Approved on', key: 'approved_on', width: 20 },
    { header: 'Surname', key: 'surname', width: 18 },
    { header: 'Name', key: 'first_name', width: 18 },
    { header: 'ID number', key: 'id_number', width: 16 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Mobile', key: 'mobile', width: 15 },
    { header: 'Tel (home)', key: 'tel_home', width: 15 },
    { header: 'Tel (work)', key: 'tel_work', width: 15 },
    { header: 'Postal address', key: 'postal', width: 30 },
    { header: 'Physical address', key: 'physical', width: 30 },
    { header: 'Category', key: 'category', width: 30 },
    { header: 'Category price', key: 'category_price', width: 14 },
    { header: 'Lounge', key: 'lounge', width: 26 },
    { header: 'Lounge price', key: 'lounge_price', width: 13 },
    { header: 'No. of dependants', key: 'dep_count', width: 12 },
    { header: 'Total due', key: 'total', width: 13 },
    { header: 'Waiver signed by', key: 'waiver', width: 22 },
    { header: 'Waiver signed on', key: 'waiver_on', width: 20 },
    { header: 'Emergency contact', key: 'emerg_name', width: 20 },
    { header: 'Emergency number', key: 'emerg_phone', width: 16 },
    { header: 'Flagged', key: 'flagged', width: 9 },
    { header: 'Flag reason', key: 'flag_reason', width: 30 },
    { header: 'Sections of interest', key: 'sections', width: 36 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];

  for (const r of rows) {
    const paid = r.status === 'payment_confirmed' || r.status === 'approved' || !!r.payment_confirmed_at;
    ws.addRow({
      ref: appRef(r.id),
      received: dt(r.created_at),
      year: r.year,
      type: r.application_type === 'renew' ? 'Renewal' : 'New',
      status: statusMeta[r.status]?.label ?? r.status,
      paid: yn(paid),
      paid_on: dt(r.payment_confirmed_at),
      paid_by: r.payment_confirmed_by ?? '',
      pop: yn(!!r.pop_url),
      member_no: r.member_no ?? '',
      approved_on: dt(r.approved_at),
      surname: r.surname,
      first_name: r.first_name,
      id_number: r.id_number ?? '',
      email: r.email,
      mobile: r.mobile ?? '',
      tel_home: r.tel_home ?? '',
      tel_work: r.tel_work ?? '',
      postal: r.postal_address ?? '',
      physical: r.physical_address ?? '',
      category: r.category_label ?? '',
      category_price: r.category_price ?? null,
      lounge: r.lounge_label ?? '',
      lounge_price: r.lounge_price ?? null,
      dep_count: (r.partners ?? []).length,
      total: Number(r.total_due),
      waiver: r.waiver_name ?? '',
      waiver_on: dt(r.waiver_accepted_at),
      emerg_name: r.emergency_name ?? '',
      emerg_phone: r.emergency_phone ?? '',
      flagged: yn(r.flagged),
      flag_reason: r.flag_reason ?? '',
      sections: (r.sections ?? []).join(', '),
      notes: r.admin_notes ?? '',
    });
  }
  for (const key of ['category_price', 'lounge_price', 'total']) ws.getColumn(key).numFmt = '"R" #,##0.00';

  // ----- Dependants -----
  const wd = wb.addWorksheet('Dependants', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Application ref', key: 'ref', width: 14 },
    { header: 'Year', key: 'year', width: 7 },
    { header: 'Application status', key: 'status', width: 24 },
    { header: 'Payment received', key: 'paid', width: 16 },
    { header: 'Membership no.', key: 'member_no', width: 15 },
    { header: 'Main member', key: 'main', width: 28 },
    { header: 'Main member email', key: 'main_email', width: 28 },
    { header: 'Relationship', key: 'rel', width: 30 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'ID no.', key: 'id_no', width: 16 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Cell', key: 'cell', width: 15 },
    { header: 'Cost', key: 'cost', width: 13 },
    { header: 'Minor', key: 'minor', width: 8 },
    { header: 'Waiver accepted', key: 'w_ok', width: 14 },
    { header: 'Waiver signed by', key: 'w_name', width: 24 },
    { header: 'Waiver signed on', key: 'w_on', width: 20 },
  ];

  for (const r of rows) {
    const paid = r.status === 'payment_confirmed' || r.status === 'approved' || !!r.payment_confirmed_at;
    for (const p of r.partners ?? []) {
      wd.addRow({
        ref: appRef(r.id),
        year: r.year,
        status: statusMeta[r.status]?.label ?? r.status,
        paid: yn(paid),
        member_no: r.member_no ?? '',
        main: `${r.first_name} ${r.surname}`.trim(),
        main_email: r.email,
        rel: p.role,
        name: p.name,
        id_no: p.id_no,
        email: p.email,
        cell: p.cell,
        cost: typeof p.cost === 'number' ? p.cost : null,
        minor: yn(p.minor),
        w_ok: yn(p.waiver_accepted),
        w_name: p.waiver_name ?? '',
        w_on: dt(p.waiver_accepted_at),
      });
    }
  }
  wd.getColumn('cost').numFmt = '"R" #,##0.00';

  // Header styling and filters
  for (const sheet of [ws, wd]) {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF346187' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 30;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `wpmc-membership-applications-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
