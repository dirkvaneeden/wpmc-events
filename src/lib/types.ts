export interface EntryFee {
  id: number;
  created_at: string;
  description: string | null;
  fee: number | null;
  is_active: boolean | null;
  event_id: string;
  subclass_id: number | null;
  captured_by: number | null;
}

export interface RaceEvent {
  id: string;
  name: string;
  event_date: string;
  end_date: string;
  late_entry_cutoff: string;
  created_at: string;
  status: boolean | null;
  gdrive_folder_id: string | null;
}

export interface RaceClass {
  id: number;
  name: string;
  event_id: string;
  no_documents_required: boolean;
}

export interface RaceSubclass {
  id: number;
  class_id: number;
  name: string;
}

export interface Driver {
  id: string;
  auth_user_id: string | null; 
  msa_licence_no: string | null;
  wpmc_member_no: string | null;
  full_name: string;
  email: string;
  mobile: string;
  tel_home: string | null;
  tel_work: string | null;
  postal_address: string;
  postal_code: string;
  emergency_contact: string;
  emergency_tel: string;
  popia_email_opt_in: boolean | null;
  popia_sms_opt_in: boolean | null;
  created_at: string;

}

export interface Vehicle {
  id: string;
  driver_id: string;
  make: string;
  model: string;
  year: number;
  engine_make: string;
  capacity: string;
  cylinders: number;
  created_at: string;
}

export interface BankDetails {
  id: number;
  bank_name: string | null;
  acc_name: string | null;
  acc_number: string | null;
  branch_code: string | null;
  pop_email: string | null;
  event_id: string;
}

export interface EventEntry {
  id: string;
  event_id: string;
  driver_id: string;
  vehicle_id: string;
  class_id: number;
  race_number: string;
  sponsor: string | null;
  entry_type: string;
  is_late_entry: boolean;
  fee_amount: number;
  gcr_accepted: boolean;
  status: string;
  created_at: string;
  pay_reference: string | null;
  entry_fee_id: number | null;
  entry_type_id: number | null;
}

export interface Payment {
  id: string;
  entry_id: string;
  amount_paid: number;
  pop_file_url: string | null;
  payment_reference: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface EventEntry {
  id: string;
  event_id: string;
  driver_id: string;
  vehicle_id: string;
  class_id: number;
  race_number: string;
  sponsor: string | null;
  entry_type: string;
  is_late_entry: boolean;
  fee_amount: number;
  gcr_accepted: boolean;
  status: string;
  created_at: string;
  pay_reference: string | null;
  entry_fee_id: number | null;
  msa_license_url: string | null;   // add this line
}

export interface AdminUser {
  id: number;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  created_at: string;
    must_change_password: boolean;
}
export interface EntryType {
  id: number;
  event_id: string;
  name: string;
  requires_payment: boolean;
  requires_documents: boolean;
  is_basic: boolean;
}

export type MembershipYear = {
  year: number;
  last_member_no: number;
  reduction_pct: number;
  rounding_mode: 'up' | 'down' | 'decimals';
  created_at: string;
  updated_at: string;
};

export type MembershipPrice = {
  id: string;
  year: number;
  category_key: string;
  label: string;
  note: string | null;
  price_group: 'membership' | 'lounge';
  price: number;
  sort_order: number;
  active: boolean;
  price_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type MembershipPriceHistory = {
  id: string;
  price_id: string;
  year: number;
  label: string;
  old_price: number | null;
  new_price: number;
  reason: 'created' | 'manual' | 'proposal_accepted' | 'proposal_rejected' | 'copied';
  changed_by: string | null;
  changed_at: string;
};

export type MembershipApplication = {
  id: string;
  year: number;
  application_type: 'new' | 'renew';
  status: 'submitted' | 'payment_confirmed' | 'approved' | 'rejected';
  surname: string;
  first_name: string;
  id_number: string | null;
  email: string;
  mobile: string | null;
  category_label: string | null;
  category_price: number | null;
  lounge_label: string | null;
  lounge_price: number | null;
  total_due: number;
  partners: { role: string; name: string; id_no: string; email: string; cell: string }[];
  sections: string[];
  pop_url: string | null;
  flagged: boolean;
  flag_reason: string | null;
  member_no: string | null;
  payment_confirmed_at: string | null;
  approved_at: string | null;
  created_at: string;
};