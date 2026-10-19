import type { FieldProfileDefinition, FieldType } from '../types/index.ts';

export const FIELD_PROFILES: Record<FieldType, FieldProfileDefinition> = {
  mobile_number: {
    id: 'mobile_number',
    name: 'Mobile Number',
    tagline: '10-digit Indian Mobile',
    description: 'Validates 10-digit Indian mobile numbers starting with 6, 7, 8, or 9.',
    formatDescription: 'Exactly 10 numeric digits, starting with 6-9 (e.g., 9876543210).',
    sampleInput: 'Nine eight seven six five four three two one zero',
    expectedLength: 10,
    syntheticWarning: 'SYNTHETIC TEST DATA ONLY — Format validity does not prove real-world assignment, active status, or person identity.',
  },
  pin: {
    id: 'pin',
    name: 'PIN',
    tagline: '6-digit Postal / Identifier PIN',
    description: 'Validates 6-digit postal codes or identifier PINs starting with 1-9.',
    formatDescription: 'Exactly 6 numeric digits, starting with 1-9 (e.g., 560001).',
    sampleInput: 'Five six zero zero zero one',
    expectedLength: 6,
    syntheticWarning: 'SYNTHETIC TEST DATA ONLY — Never enter real banking, ATM, or confidential authentication PINs.',
  },
  service_tag: {
    id: 'service_tag',
    name: 'Service Tag',
    tagline: '7-character Alphanumeric Tag',
    description: 'Validates 7-character alphanumeric device or asset service tags.',
    formatDescription: 'Exactly 7 alphanumeric characters (A-Z, 0-9), e.g., AB74K9Q.',
    sampleInput: 'Alpha Bravo seven four Kilo nine Quebec',
    expectedLength: 7,
    syntheticWarning: 'SYNTHETIC TEST DATA ONLY — Prototype service tag profile with NATO phonetics and letter normalization.',
  },
  spelled_name: {
    id: 'spelled_name',
    name: 'Spelled Name',
    tagline: 'Letter-by-Letter Name Spelling',
    description: 'Normalizes letter-by-letter synthetic customer name spelling.',
    formatDescription: 'Alphabetic string from character-by-character speech (e.g., R-A-H-U-L).',
    sampleInput: 'R A H U L',
    syntheticWarning: 'EXPERIMENTAL — Does not claim universal name recognition. Explicit confirmation and manual fallback required.',
  },
};
