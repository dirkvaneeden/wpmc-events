export type ApplicationStatus = 'submitted' | 'payment_confirmed' | 'approved' | 'rejected';

export interface ApplicationRow {
  id: string;
  year: number;
  application_type: 'new' | 'renew';
  status: ApplicationStatus;
  surname: string;
  first_name: string;
  id_number: string | null;
  email: string;
  mobile: string | null;
  tel_home: string | null;
  tel_work: string | null;
  fax: string | null;
  employer: string | null;
  occupation: string | null;
  postal_address: string | null;
  physical_address: string | null;
  category_label: string | null;
  category_price: number | null;
  lounge_label: string | null;
  lounge_price: number | null;
  total_due: number;
  partners: { role: string; name: string; id_no: string; email: string; cell: string }[];
  sections: string[];
  consent_email: boolean;
  consent_mobile: boolean;
  consent_newsletter: boolean;
  waiver_accepted: boolean;
  waiver_name: string | null;
  waiver_accepted_at: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  guardian_name: string | null;
  pop_url: string | null;
  payment_confirmed_at: string | null;
  payment_confirmed_by: string | null;
  renew_matched: boolean | null;
  flagged: boolean;
  flag_reason: string | null;
  member_no: string | null;
  approved_at: string | null;
  approved_by: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const statusMeta: Record<ApplicationStatus, { label: string; color: string }> = {
  submitted: { label: 'Awaiting payment check', color: '#e9730c' },
  payment_confirmed: { label: 'Payment confirmed', color: '#0a6ed1' },
  approved: { label: 'Approved', color: '#2b7d2b' },
  rejected: { label: 'Rejected', color: '#bb0000' },
};

// Short reference shown to the applicant and used in emails
export function appRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export const MEMBERSHIP_BUCKET = 'membership-documents';
