import 'server-only';

/**
 * Client for the Audi Outcasts members API (audioutcasts.com).
 *   GET /api/v1/members?limit=500&status=active  -> { members, total }
 *   GET /api/v1/members/AO001                    -> { member }   (404 when unknown)
 * The key is read from MEMBERS_API_KEY and is only ever used on the server.
 */

const BASE_URL = (process.env.MEMBERS_API_URL ?? 'https://audioutcasts.com/api/v1/members').replace(/\/+$/, '');
const PAGE_SIZE = 500;
const MAX_PAGES = 20; // safety stop: 10 000 members

type Raw = Record<string, unknown>;

function apiKey() {
  const key = process.env.MEMBERS_API_KEY;
  if (!key) throw new Error('MEMBERS_API_KEY is not set. Add it to .env.local and to the Vercel environment variables.');
  return key;
}

async function call(url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* not JSON */ }
    throw new Error(`Member API ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as Raw;
}

// ---------------------------------------------------------------------
// Member numbers: the API uses AO001, the store uses AO-001
// ---------------------------------------------------------------------

/** "ao001", "AO-1", "AO 001" -> "AO-001". Returns null when it isn't an AO number. */
export function toStoreNumber(value: unknown): string | null {
  const m = String(value ?? '').trim().match(/^AO[\s-]?(\d{1,6})$/i);
  return m ? `AO-${m[1].padStart(3, '0')}` : null;
}

/** "AO-001" -> "AO001" for the API's lookup URL. */
export function toApiNumber(storeNumber: string) {
  return storeNumber.replace(/[\s-]/g, '').toUpperCase();
}

// ---------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------

/**
 * All members from the API. The docs show `limit` and `total` but not how to
 * ask for the next page, so this tries `offset`; if the API ignores it (the same
 * members come back), it stops and reports how many it could fetch.
 */
export async function fetchAllMembers({ activeOnly }: { activeOnly: boolean }) {
  const seen = new Map<string, Raw>();
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (activeOnly) params.set('status', 'active');
    if (page > 0) params.set('offset', String(page * PAGE_SIZE));

    const data = await call(`${BASE_URL}?${params}`);
    const members = (data?.members as Raw[] | undefined) ?? [];
    total = Number(data?.total ?? members.length);

    let added = 0;
    for (const m of members) {
      const key = String(pick(m, NUMBER_KEYS) ?? JSON.stringify(m));
      if (!seen.has(key)) { seen.set(key, m); added++; }
    }
    if (members.length < PAGE_SIZE || added === 0 || seen.size >= total) break;
  }

  return { members: [...seen.values()], total, complete: seen.size >= total };
}

/** One member by number (e.g. "AO-001" or "ao001"), or null when the API returns 404. */
export async function fetchMember(number: string) {
  const storeNumber = toStoreNumber(number);
  if (!storeNumber) throw new Error('Enter an Audi Outcasts number, e.g. AO001.');
  const data = await call(`${BASE_URL}/${encodeURIComponent(toApiNumber(storeNumber))}`);
  return (data?.member as Raw | undefined) ?? null;
}

// ---------------------------------------------------------------------
// Mapping API fields -> members table
// The API's exact field names aren't documented, so common variants are accepted.
// The import page shows the raw record so the mapping can be checked.
// ---------------------------------------------------------------------

const NUMBER_KEYS = ['member_number', 'memberNumber', 'number', 'ao_number', 'aoNumber', 'membership_number', 'code'];

function pick(m: Raw, keys: string[]): unknown {
  for (const k of keys) {
    const v = m[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}
const text = (m: Raw, keys: string[]) => {
  const v = pick(m, keys);
  return v === undefined ? null : String(v).trim();
};

export type MappedMember = {
  member_number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  email: string;
  city: string | null;
  province: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  active: boolean;
  notes: string | null;
  birthday: string | null;
};

export type MapResult = { ok: true; member: MappedMember } | { ok: false; reason: string; label: string };

export function mapApiMember(m: Raw): MapResult {
  const rawNumber = pick(m, NUMBER_KEYS);
  const member_number = toStoreNumber(rawNumber);
  const first = text(m, ['first_name', 'firstName', 'name_first']);
  const last = text(m, ['last_name', 'lastName', 'surname']);
  const name = text(m, ['name', 'full_name', 'fullName', 'display_name']) ?? ([first, last].filter(Boolean).join(' ') || null);
  const email = text(m, ['email', 'email_address', 'emailAddress'])?.toLowerCase() ?? null;
  const label = name ?? String(rawNumber ?? 'Unknown');

  if (!member_number) return { ok: false, reason: `No valid AO number (${String(rawNumber ?? 'missing')})`, label };
  if (!name) return { ok: false, reason: 'No name', label: member_number };
  if (!email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { ok: false, reason: 'No valid email', label };

  // Phone: keep as given, restoring a dropped leading 0 on 9-digit SA numbers
  let phone = text(m, ['phone', 'mobile', 'cell', 'cellphone', 'phone_number', 'phoneNumber']);
  if (phone && /^[1-9]\d{8}$/.test(phone)) phone = `0${phone}`;

  const yearRaw = Number(pick(m, ['year', 'car_year', 'carYear', 'model_year']));
  const year = Number.isInteger(yearRaw) && yearRaw > 1900 && yearRaw < 2100 ? yearRaw : null;

  const bdRaw = text(m, ['birthday', 'date_of_birth', 'dateOfBirth', 'dob']);
  const bd = bdRaw?.slice(0, 10) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const birthday = bd && /^\d{4}-\d{2}-\d{2}$/.test(bd) && bd < today && bd > '1900-01-01' ? bd : null;

  const status = text(m, ['status'])?.toLowerCase();
  const activeFlag = pick(m, ['active', 'is_active', 'isActive']);
  const active = status ? status === 'active' : activeFlag === undefined ? true : activeFlag === true || String(activeFlag) === 'true';

  return {
    ok: true,
    member: {
      member_number,
      name,
      nickname: text(m, ['nickname', 'nick_name', 'nickName']),
      phone,
      email,
      city: text(m, ['city', 'town']),
      province: text(m, ['province', 'region', 'state']),
      model: text(m, ['model', 'car', 'car_model', 'carModel', 'vehicle']),
      year,
      plate: text(m, ['plate', 'registration', 'reg', 'number_plate', 'licence_plate', 'license_plate']),
      active,
      notes: text(m, ['notes', 'note']),
      birthday,
    },
  };
}
