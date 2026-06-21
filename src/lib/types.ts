import type { BadgeLevel } from './levels';

// Mirrors the `partner_center_directory` view (migration 0004).
export interface DirectoryCenter {
  id: string;
  name: string;
  state: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  recognized_at: string | null;
}

// Mirrors the return of `verify_certificate(serial)` (migration 0006).
export interface CertificateVerification {
  serial: string;
  level: BadgeLevel;
  issued_on: string;
  center_name: string | null;
  candidate_name: string;
  is_valid: boolean;
  revoked_on: string | null;
  replaced_by_serial: string | null;
}

// Matches the `my_state` enum order (migration 0002).
export const MALAYSIAN_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor',
  'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
] as const;
