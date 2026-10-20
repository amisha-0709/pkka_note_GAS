import test from 'node:test';
import assert from 'node:assert/strict';
import {
  luhnCheck,
  validateIMEI,
  validateEmail,
  validateSerial,
  validateName,
  validateOrderId,
  validateMobileNumber,
  validatePin,
  scanSensitiveData,
  detectEntitiesFromTranscript,
  formatReadBackLine,
} from '../lib/fieldEngine.ts';
import {
  createCandidate,
  applyAgentAction,
  detectCustomerVerbalConfirm,
  detectSpokenCorrection,
  applySpokenCorrection,
} from '../lib/candidateLifecycle.ts';

// ---------------------------------------------------------------------
// 1. IMEI & Luhn Tests
// ---------------------------------------------------------------------
test('IMEI: Valid 15-digit IMEI passes Luhn check', () => {
  // 490154203237518 is a mathematically valid 15-digit Luhn IMEI
  const result = validateIMEI('four nine zero one five four two zero three two three seven five one eight');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, '490154203237518');
  assert.equal(result.status, 'valid_candidate');
});

test('IMEI: Invalid Luhn checksum is rejected (15 digits with corrupted check digit)', () => {
  // 490154203237519 is 15 digits but ends in 9 instead of 8
  const result = validateIMEI('490154203237519');
  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid_candidate');
  assert.match(result.validationMessage, /Luhn checksum validation/i);
});

test('IMEI: Rejects wrong length (14 or 16 digits)', () => {
  const result14 = validateIMEI('49015420323751');
  assert.equal(result14.valid, false);
  assert.match(result14.validationMessage, /Expected exactly 15 digits/i);

  const result16 = validateIMEI('4901542032375188');
  assert.equal(result16.valid, false);
});

// ---------------------------------------------------------------------
// 2. Email Validation Tests
// ---------------------------------------------------------------------
test('Email: Assembles spoken email tokens ("at the rate", "dot", "gmail dot com")', () => {
  const result = validateEmail('john dot doe at the rate gmail dot com');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, 'john.doe@gmail.com');
  // Per spec: Low STT reliability, so always needs_review
  assert.equal(result.status, 'needs_review');
  assert.ok(result.warnings.some((w) => w.includes('Low STT reliability')));
});

test('Email: Rejects invalid email without domain or @', () => {
  const result = validateEmail('johndoe gmail dot com');
  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid_candidate');
});

// ---------------------------------------------------------------------
// 3. Serial Number & Ambiguity Warning Tests
// ---------------------------------------------------------------------
test('Serial: Validates alphanumeric serial and flags ambiguous characters (0/O, 1/I)', () => {
  const result = validateSerial('S E R 0 1 A B C');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, 'SER01ABC');
  // Flags '0' or 'O', and '1' or 'I'
  assert.ok(result.warnings.some((w) => w.includes("Contains '0' or 'O'")));
  assert.ok(result.warnings.some((w) => w.includes("Contains '1' or 'I'")));
  assert.equal(result.status, 'needs_review'); // Warnings make it needs_review
});

test('Serial: NATO phonetics resolution in serial', () => {
  const result = validateSerial('Sierra Echo Romeo Kilo Lima Bravo Zulu Alpha');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, 'SERKLBZA');
});

// ---------------------------------------------------------------------
// 4. Name with Spelling Tests
// ---------------------------------------------------------------------
test('Name: Prioritizes explicit letter spelling sequence', () => {
  const result = validateName('My name is Rahul, spelled Romeo Alfa Hotel Uniform Lima');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, 'RAHUL');
});

test('Name: Extracts standard spoken name and title-cases it', () => {
  const result = validateName('my name is priya sharma');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, 'Priya Sharma');
});

// ---------------------------------------------------------------------
// 5. Order ID Tests
// ---------------------------------------------------------------------
test('Order ID: Matches default ORD + digits format', () => {
  const result = validateOrderId('O R D 1 2 3 4 5 6 7 8');
  assert.equal(result.valid, true);
  assert.equal(result.normalizedCandidate, 'ORD12345678');
});

test('Order ID: Rejects invalid prefix', () => {
  const result = validateOrderId('XYZ12345678');
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------
// 6. Sensitive Data Guard Tests
// ---------------------------------------------------------------------
test('Sensitive Data Guard: Masks valid Luhn card numbers and never stores raw digits', () => {
  // 4532 0150 0000 0007 is a valid Visa test card number (Luhn passes)
  const input = 'Here is my credit card 4532015000000007 to process payment';
  const { sanitizedText, detections } = scanSensitiveData(input);

  assert.equal(detections.length, 1);
  assert.equal(detections[0].type, 'card_luhn');
  assert.ok(detections[0].maskedSnippet.includes('•••• •••• •••• 0007'));
  assert.ok(!sanitizedText.includes('4532015000000007'));
  assert.ok(sanitizedText.includes('CARD DETECTED'));
});

test('Sensitive Data Guard: Masks Aadhaar 12-digit pattern', () => {
  const input = 'My aadhaar card is 5432 9876 1234 for identity check';
  const { sanitizedText, detections } = scanSensitiveData(input);

  assert.ok(detections.some((d) => d.type === 'aadhaar'));
  assert.ok(!sanitizedText.includes('5432 9876 1234'));
  assert.ok(sanitizedText.includes('AADHAAR DETECTED'));
});

test('Sensitive Data Guard: Masks PAN and OTP', () => {
  const input = 'PAN ABCDE1234F and my OTP is 894321';
  const { sanitizedText, detections } = scanSensitiveData(input);

  assert.ok(detections.some((d) => d.type === 'pan'));
  assert.ok(detections.some((d) => d.type === 'otp'));
  assert.ok(!sanitizedText.includes('ABCDE1234F'));
  assert.ok(!sanitizedText.includes('894321'));
});

// ---------------------------------------------------------------------
// 7. Candidate Lifecycle & Agent Actions Tests
// ---------------------------------------------------------------------
test('Candidate Lifecycle: Never auto-confirms; starts in detected or needs_review', () => {
  const candidate = createCandidate({
    callId: 'call_test_1',
    type: 'mobile',
    value: '9876543210',
    confidence: 0.95,
    segmentId: 'seg_1',
    quote: 'nine eight seven six five four three two one zero',
    speaker: 'customer',
    atMs: 1200,
  });

  assert.equal(candidate.status, 'detected');
  assert.equal(candidate.value, '9876543210');
  assert.equal(candidate.validation.passed, true);
});

test('Candidate Lifecycle: Agent confirms candidate', () => {
  const candidate = createCandidate({
    callId: 'call_test_1',
    type: 'mobile',
    value: '9876543210',
    confidence: 0.95,
    segmentId: 'seg_1',
    quote: 'call me on 9876543210',
    speaker: 'customer',
    atMs: 2000,
  });

  const res = applyAgentAction(candidate, { action: 'confirm' });
  assert.equal(res.candidate.status, 'confirmed');
  assert.equal(res.candidate.resolvedBy, 'agent');
  assert.ok(res.candidate.resolvedAt);
});

test('Candidate Lifecycle: Agent edits candidate with re-validation', () => {
  const candidate = createCandidate({
    callId: 'call_test_1',
    type: 'mobile',
    value: '9876543210',
    confidence: 0.95,
    segmentId: 'seg_1',
    quote: 'call me',
    speaker: 'customer',
    atMs: 3000,
  });

  const res = applyAgentAction(candidate, { action: 'edit', value: '9876543211' });
  assert.equal(res.candidate.status, 'edited');
  assert.equal(res.candidate.value, '9876543211');
  assert.equal(res.revalidationPassed, true);
});

test('Candidate Lifecycle: Agent dismisses candidate', () => {
  const candidate = createCandidate({
    callId: 'call_test_1',
    type: 'order_id',
    value: 'ORD12345678',
    confidence: 0.95,
    segmentId: 'seg_1',
    quote: 'order ORD12345678',
    speaker: 'customer',
    atMs: 4000,
  });

  const res = applyAgentAction(candidate, { action: 'dismiss' });
  assert.equal(res.candidate.status, 'dismissed');
});

// ---------------------------------------------------------------------
// 8. Spoken Correction Handling Tests
// ---------------------------------------------------------------------
test('Spoken Correction: "sorry last digit is 7" supersedes earlier candidate', () => {
  const original = createCandidate({
    callId: 'call_test_1',
    type: 'mobile',
    value: '9876543210',
    confidence: 0.95,
    segmentId: 'seg_1',
    quote: '9876543210',
    speaker: 'customer',
    atMs: 5000,
  });

  const { supersededCandidate, newCandidate } = applySpokenCorrection({
    existingCandidate: original,
    correctionTranscript: 'sorry, last digit is 7',
    segmentId: 'seg_2',
    speaker: 'customer',
    atMs: 7000,
  });

  assert.equal(supersededCandidate.status, 'superseded');
  assert.equal(newCandidate.value, '9876543217');
  assert.equal(newCandidate.supersedes, original.id);
  assert.equal(newCandidate.status, 'detected');
  assert.equal(newCandidate.validation.passed, true);
});

test('Spoken Correction: "no, it is 4 not 5" replaces target digit and supersedes', () => {
  const original = createCandidate({
    callId: 'call_test_1',
    type: 'postal_pin',
    value: '560005',
    confidence: 0.95,
    segmentId: 'seg_1',
    quote: '560005',
    speaker: 'customer',
    atMs: 5000,
  });

  const { supersededCandidate, newCandidate } = applySpokenCorrection({
    existingCandidate: original,
    correctionTranscript: 'no, it is 4 not 5',
    segmentId: 'seg_2',
    speaker: 'customer',
    atMs: 6500,
  });

  assert.equal(supersededCandidate.status, 'superseded');
  assert.equal(newCandidate.value, '560004');
  assert.equal(newCandidate.supersedes, original.id);
});

// ---------------------------------------------------------------------
// 9. Customer Verbal Confirmation Detection Tests
// ---------------------------------------------------------------------
test('Verbal Confirmation: Customer saying "yes that is correct" detected as soft tag only', () => {
  assert.equal(detectCustomerVerbalConfirm('yes that is correct'), true);
  assert.equal(detectCustomerVerbalConfirm('haan sahi hai'), true);
  assert.equal(detectCustomerVerbalConfirm('pakka'), true);
  // Negative responses must return false
  assert.equal(detectCustomerVerbalConfirm('no that is not right'), false);
  assert.equal(detectCustomerVerbalConfirm('nahi wrong number'), false);
});

// ---------------------------------------------------------------------
// 10. Auto Entity Detection & Collision Rules Tests
// ---------------------------------------------------------------------
test('Auto Detection: 10 digits with mobile context identified as mobile', () => {
  const text = 'You can reach me on my mobile number 9876543210';
  const detected = detectEntitiesFromTranscript(text, { context: 'customer mobile' });

  assert.ok(detected.some((d) => d.type === 'mobile' && d.value === '9876543210'));
});

test('Readback text line formatting for agent UI', () => {
  assert.equal(formatReadBackLine({ type: 'mobile', value: '9876543210' }), '98765 43210');
  assert.equal(formatReadBackLine({ type: 'postal_pin', value: '560001' }), '560 001');
  assert.equal(formatReadBackLine({ type: 'email', value: 'alex@domain.com' }), 'alex at domain dot com');
});
