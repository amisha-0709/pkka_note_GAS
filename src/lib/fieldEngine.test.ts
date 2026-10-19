import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMobileNumber,
  validatePin,
  validateServiceTag,
  validateSpelledName,
  normalizeSpokenDigits,
  extractDigitsOnly,
  formatReadBackText,
} from './fieldEngine.ts';

test('Mobile Number: Valid 10-digit standard Indian mobile', () => {
  const res = validateMobileNumber('9876543210');
  assert.equal(res.valid, true);
  assert.equal(res.status, 'valid_candidate');
  assert.equal(res.normalizedCandidate, '9876543210');
});

test('Mobile Number: Spoken number words with spaces and hyphens', () => {
  const res = validateMobileNumber('nine eight seven six five four three two one zero');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, '9876543210');
  assert.ok(res.normalizationSteps.length > 0);
});

test('Mobile Number: Spoken multipliers like "double nine"', () => {
  const res = validateMobileNumber('double nine eight seven six five four three two one');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, '9987654321');
});

test('Mobile Number: Hindi spoken digits "nau aath saat chheh paanch char teen do ek shunya"', () => {
  const res = validateMobileNumber('nau aath saat chheh paanch char teen do ek shunya');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, '9876543210');
});

test('Mobile Number: Rejects 8-digit truncated input', () => {
  const res = validateMobileNumber('98765432');
  assert.equal(res.valid, false);
  assert.equal(res.status, 'invalid_candidate');
  assert.match(res.validationMessage, /8 digits detected/);
});

test('Mobile Number: Strips leading trunk prefix 0 on 11-digit number', () => {
  const res = validateMobileNumber('09876543210');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, '9876543210');
});

test('Mobile Number: Strips 91 country code prefix on 12-digit number', () => {
  const res = validateMobileNumber('919876543210');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, '9876543210');
});

test('Mobile Number: Rejects invalid starting digit (e.g. 5 or 1)', () => {
  const res = validateMobileNumber('5876543210');
  assert.equal(res.valid, false);
  assert.equal(res.status, 'invalid_candidate');
  assert.match(res.validationMessage, /Invalid starting digit/);
});

test('PIN: Valid 6-digit postal PIN', () => {
  const res = validatePin('560001');
  assert.equal(res.valid, true);
  assert.equal(res.status, 'valid_candidate');
  assert.equal(res.normalizedCandidate, '560001');
});

test('PIN: Rejects PIN starting with 0', () => {
  const res = validatePin('060001');
  assert.equal(res.valid, false);
  assert.equal(res.status, 'invalid_candidate');
});

test('PIN: Rejects less than 6 digits', () => {
  const res = validatePin('5600');
  assert.equal(res.valid, false);
  assert.equal(res.status, 'invalid_candidate');
});

test('Service Tag: Valid 7-character alphanumeric tag', () => {
  const res = validateServiceTag('AB74K9Q');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, 'AB74K9Q');
});

test('Service Tag: NATO phonetics resolution', () => {
  const res = validateServiceTag('Alpha Bravo seven four Kilo nine Quebec');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, 'AB74K9Q');
});

test('Service Tag: "X for Word" resolution', () => {
  const res = validateServiceTag('A for apple B for ball 7 4 K 9 Q');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, 'AB74K9Q');
});

test('Spelled Name: Valid letter sequence', () => {
  const res = validateSpelledName('R A H U L');
  assert.equal(res.valid, true);
  assert.equal(res.normalizedCandidate, 'RAHUL');
});

test('ReadBack text formatting contains natural pauses', () => {
  const readback = formatReadBackText('9876543210', 'mobile_number');
  assert.match(readback, /9 8 7 6 5/);
  assert.match(readback, /4 3 2 1 0/);
});
