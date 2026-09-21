export interface EntryFee {
  id: number;
  created_at: string;
  description: string | null;
  fee: number | null;
  is_active: boolean | null;
}

export interface RaceEvent {
  id: string;
  name: string;
  event_date: string;
  late_entry_cutoff: string;
  created_at: string;
  status: boolean | null;
  gdrive_folder_id: string | null;
}

export interface RaceClass {
  id: number;
  name: string;
}

export interface Driver {
  id: string;
  auth_user_id: string | null; 
  msa_licence_no: string;
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
}