// Fixed content from the WPMC membership application form (2026).

export const SECTIONS = [
  'Classic cars',
  'Clubmans Saloons',
  'Sports & GT cars',
  'Fine cars',
  'GTi Challenge',
  'Super Cars',
  'Clubmans/Powersport/Classic Motorcycles',
  'Super Bikes, Challenge, Masters & 600',
  'V8 Masters series',
  'Single Seaters/Formula Libre',
  'Short Circuit',
  'Karting',
  'RallyCross',
  'Drifting / Spinning',
  'Drags / Gymkhana',
  'Car / Motorcycle Track Schools',
  'Robot Racing / Street2Strip',
  'BMWCCT Series',
] as const;

// Categories that include a partner (the partner details become mandatory).
export const PARTNER_CATEGORY_KEYS = ['member_partner', 'pensioner_partner', 'country_partner'];

export const BANK_DETAILS = {
  bank: 'Nedbank',
  branchName: 'Southern Peninsula',
  accountNo: '1232041807',
  branchCode: '123209',
};

export const MAX_POP_BYTES = 4 * 1024 * 1024; // Vercel limits a request body to about 4.5 MB

export const POPIA_POINTS = [
  'Personal information is collected for a specific, explicitly defined and lawful purpose related to a function or activity of the WPMC.',
  'The information will not be used in a form in which the data subject may be identified, or not be used for historical, statistical or research purposes.',
  'It will not be sold or in any manner distributed to a third party for use in mailing lists.',
  'All information collected will be processed in accordance with the WPMC privacy policy, available on written request at the Reception desk.',
];

export const PARTNER_NOTE =
  '* A partner is limited to a spouse or common-law wife or husband. Family members and relatives are not considered to be partners. The Western Province Motor Club reserves the right in its sole discretion to reject applications where this definition is not strictly applied.';

export const FREE_ENTRY_NOTE =
  'Club members are entitled to FREE entry to WPMC including the Clubhouse facilities for all National and Regional Motorsport events organised by the club, i.e. Circuit Racing, Motocross, Karting and Drag Racing. Free entrance does not include events not organised by WPMC.';

export const WAIVER_TITLE = 'Western Province Motor Club: Waiver and Indemnity Document (Rev01)';

export const WAIVER_PARAGRAPHS: string[] = [
  'I, the undersigned, do hereby state and agree that:',
  '1. I am aware of the potential dangers involved in the participation in motorsporting activities;',
  "2. I am further aware that Western Province Motor Club ('the Club'), in organising and permitting my participation in such activities and in establishing and enforcing safety measures in regard thereto, cannot ensure my safety and/or the adequacy of such measures. The Club for purposes of this indemnity and waiver includes its sections and all subordinate bodies, office-bearers, officials, employees and private individuals conducting activities under the auspices of, or in conjunction with, or utilising the facilities of, the Club as well as the sponsors of events.",
  '3. As such, I undertake to:',
  '(a) take all necessary safety precautions as I am aware of the risk and involved in participating in motorsporting activities;',
  '(b) exonerate all persons and bodies involved in the organisation and sponsorship of the motorsport and related activities at Killarney and elsewhere under the auspices of the Club, including Motorsport South Africa and its subordinate bodies from, and indemnify them against, any loss or damage, of whatsoever nature, which I or any others, including my dependants may suffer due to any act or omission on the part of such body or person and which was beyond the reasonable control of the Western Province Motor Club;',
  '(c) comply with all applicable safety rules and regulations of Motorsport South Africa and its subordinate bodies, club rules or regulations, and/or the direction of any official in charge of any such activity;',
  '(d) I acknowledge that in the event of my utilising any track or other facility of the Club, outside of official competition or practice, that all of the safety precautions normally in place may not be present, and that the circuits, tracks and other facilities, and in particular the safety installations relating thereto, may be in the course of modification or repair, or may have been moved. It will therefore be my duty to satisfy myself that the circuit or track can be safely utilised and to adjust my driving or riding to take into account the prevailing circumstances at the time.',
  '(e) I acknowledge that it will be my further duty to keep my dependants appraised of my participation and to ensure that they are aware of this waiver and indemnity.',
  '4. I hereby waive, for myself and my dependants, any claim which I may have against Western Province Motor Club and all persons and bodies involved in the organisation and sponsorship of the motorsport and related activities at Killarney and elsewhere under the auspices of the Club, including Motorsport South Africa and its subordinate bodies from, any loss or damage which I may suffer as a result of any injury or death as a result of any act or omission on the part of such body or person which was beyond their reasonable control;',
  '5. I indemnify Western Province Motor Club and all persons and bodies involved in the organisation and sponsorship of the motorsport and related activities at Killarney and elsewhere under the auspices of the Club, including Motorsport South Africa and its subordinate bodies against any claim by any of my dependants for any damage or loss which they may suffer as a result of any injury or death as a result of any act or omission on the part of such body or person, which was beyond their reasonable control. It is my intention that this indemnity will be binding upon my estate.',
  '6. I undertake in favour of Western Province Motor Club, that I will not in any way facilitate the use by any person of the sporting facilities of the club unless such person has signed a similar waiver and indemnity in favour of the club. In particular, and without limiting the generality of the aforegoing, I undertake not to allow the use of any vehicle, (including for this purpose, karts, motorcycles, quad bikes and other forms of motorised transport,) owned or under my control by any such person or to permit any such person to be a passenger in such vehicle while using any of the sporting facilities of the club. To the extent that I may breach the undertaking given in this paragraph I indemnify the club on the same basis set forth in five above against any claim by any such person or his or her dependants.',
];

export const MINOR_WAIVER_TEXT =
  'Minors (under 18 and never married): I, in my capacity as parent/guardian/curator, hereby acknowledge the abovementioned agreement, the contents of which are fully understood and accepted by me and by my son/daughter/ward.';

// Relationships for the partner and junior members table.
// priceKey is the price-list category that gives the cost; null means "included".
export const RELATIONSHIPS = [
  { key: 'partner', label: 'Partner', priceKey: null, minor: false },
  { key: 'student_u25', label: 'Full Time Student (Under 25)', priceKey: 'student_u25', minor: false },
  { key: 'student_u18', label: 'Full Time Student (Under 18)', priceKey: 'student_u18', minor: true },
  { key: 'under_12', label: 'Under 12', priceKey: 'under_12', minor: true },
] as const;

export type RelationshipKey = (typeof RELATIONSHIPS)[number]['key'];

export const MAX_MEMBERS = 12;
export const DRAFT_DAYS = 30;

// Categories the main member cannot pick as their own (handled as an add-on).
export const ADD_ON_CATEGORY_KEYS = ['replacement_book'];

export interface MemberRowPayload {
  relationship: RelationshipKey;
  name: string;
  id_no: string;
  email: string;
  cell: string;
  waiver_accepted: boolean;
  waiver_name: string; // typed full name (the parent or guardian for minors)
}

// Shape of the JSON the form posts to /api/membership/apply and /api/membership/draft
export interface ApplicationPayload {
  application_type: 'new' | 'renew';
  surname: string;
  first_name: string;
  id_number: string;
  email: string;
  mobile: string;
  tel_home: string;
  tel_work: string;
  fax: string;
  employer: string;
  occupation: string;
  postal_address: string;
  physical_address: string;
  main_category: string; // price-list category_key of the main member
  replacement_book: boolean;
  lounge_key: string | null;
  members: MemberRowPayload[];
  sections: string[];
  consent_email: boolean;
  consent_mobile: boolean;
  consent_newsletter: boolean;
  waiver_accepted: boolean;
  waiver_name: string;
  emergency_name: string;
  emergency_phone: string;
  is_minor: boolean;
  guardian_name: string;
  website: string; // honeypot, must stay empty
}
