import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Workbook } from 'exceljs';
import type { Row } from 'exceljs';
import { REPORT_SELECT, ReportEntry, groupByClass, reportFileName, sumPaid, vehicleText } from '@/lib/classReport';
import { getPaymentState, paymentStateMeta } from '@/lib/paymentState';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MONEY = '"R"#,##0.00';

function styleHeader(row: Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF354A5F' } };
    cell.alignment = { vertical: 'middle' };
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    // Runs as the caller, so normal RLS applies to everything below
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData } = await caller.auth.getUser(token);
    if (!userData?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { data: admin } = await caller
      .from('admin_users')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json({ error: 'Only admins can download reports.' }, { status: 403 });
    }

    const eventId = req.nextUrl.searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
    }

    const { data: event } = await caller
      .from('events')
      .select('id, name, event_date')
      .eq('id', eventId)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const { data, error } = await caller.from('event_entries').select(REPORT_SELECT).eq('event_id', eventId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries = (data ?? []) as unknown as ReportEntry[];
    const groups = groupByClass(entries);

    const workbook = new Workbook();
    workbook.creator = 'WPMC Race Entry';
    workbook.created = new Date();

    // ---- Sheet 1: entries by class (flat, filterable) ----
    const sheet = workbook.addWorksheet('Entries by class', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Class', key: 'class', width: 26 },
      { header: 'Race #', key: 'race', width: 10 },
      { header: 'Driver', key: 'driver', width: 28 },
      { header: 'Vehicle', key: 'vehicle', width: 28 },
      { header: 'Sub class', key: 'subclass', width: 20 },
      { header: 'Sponsor', key: 'sponsor', width: 24 },
      { header: 'Fee rate', key: 'rate', width: 24 },
      { header: 'Fee (R)', key: 'fee', width: 12 },
      { header: 'Paid (R)', key: 'paid', width: 12 },
      { header: 'Payment status', key: 'status', width: 16 },
      { header: 'Late entry', key: 'late', width: 11 },
      { header: 'MSA licence no.', key: 'licence', width: 18 },
      { header: 'WPMC member no.', key: 'member', width: 18 },
      { header: 'Mobile', key: 'mobile', width: 16 },
      { header: 'Email', key: 'email', width: 30 },
    ];
    styleHeader(sheet.getRow(1));

    for (const group of groups) {
      for (const e of group.entries) {
        const row = sheet.addRow({
          class: group.className,
          race: e.race_number,
          driver: e.drivers?.full_name ?? '',
          vehicle: vehicleText(e.vehicles),
          subclass: e.race_subclasses?.name ?? '',
          sponsor: e.sponsor ?? '',
          rate: e.entryFee?.description ?? '',
          fee: e.fee_amount,
          paid: sumPaid(e),
          status: paymentStateMeta[getPaymentState(e.status, e.pop_url_driver, e.fee_amount)].label,
          late: e.is_late_entry ? 'Yes' : 'No',
          licence: e.drivers?.msa_licence_no ?? '',
          member: e.drivers?.wpmc_member_no ?? '',
          mobile: e.drivers?.mobile ?? '',
          email: e.drivers?.email ?? '',
        });
        row.getCell('fee').numFmt = MONEY;
        row.getCell('paid').numFmt = MONEY;
      }
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

    // ---- Sheet 2: summary per class ----
    const summary = workbook.addWorksheet('Summary');
    summary.getColumn(1).width = 30;
    for (let i = 2; i <= 6; i++) summary.getColumn(i).width = 16;

    summary.addRow([event.name]).font = { bold: true, size: 14 };
    summary.addRow([`Event date: ${event.event_date}`]);
    summary.addRow([`Report generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`]);
    summary.addRow([]);
    styleHeader(summary.addRow(['Class', 'Entries', 'Paid', 'POP received', 'Awaiting POP', 'No payment due']));

    for (const g of groups) {
      summary.addRow([g.className, g.entries.length, g.paid, g.popReceived, g.awaiting, g.noPayment]);
    }
    summary.addRow([
      'Total',
      entries.length,
      groups.reduce((s, g) => s + g.paid, 0),
      groups.reduce((s, g) => s + g.popReceived, 0),
      groups.reduce((s, g) => s + g.awaiting, 0),
      groups.reduce((s, g) => s + g.noPayment, 0),
    ]).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${reportFileName(event.name, event.event_date)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}