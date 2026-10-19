import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyConfirmationInput,
  applyCorrection,
  canTransition,
} from './confirmationStateMachine.ts';

test('Classification: Explicit English affirmations', () => {
  assert.equal(classifyConfirmationInput('yes').intent, 'confirm');
  assert.equal(classifyConfirmationInput('correct').intent, 'confirm');
  assert.equal(classifyConfirmationInput('yes that is right').intent, 'confirm');
});

test('Classification: Explicit Hindi affirmations', () => {
  assert.equal(classifyConfirmationInput('haan').intent, 'confirm');
  assert.equal(classifyConfirmationInput('sahi hai').intent, 'confirm');
  assert.equal(classifyConfirmationInput('theek hai').intent, 'confirm');
});

test('Classification: Explicit English & Hindi rejections', () => {
  assert.equal(classifyConfirmationInput('no').intent, 'reject');
  assert.equal(classifyConfirmationInput('wrong').intent, 'reject');
  assert.equal(classifyConfirmationInput('galat hai').intent, 'reject');
  assert.equal(classifyConfirmationInput('nahi').intent, 'reject');
});

test('Classification: Negation handling - "not correct" must be reject, never confirm', () => {
  assert.equal(classifyConfirmationInput('no, that is not correct').intent, 'reject');
  assert.equal(classifyConfirmationInput('not right').intent, 'reject');
});

test('Classification: Ambiguous input must classify as unclear', () => {
  assert.equal(classifyConfirmationInput('maybe nine').intent, 'unclear');
  assert.equal(classifyConfirmationInput('what was that').intent, 'unclear');
  assert.equal(classifyConfirmationInput('').intent, 'unclear');
});

test('Correction: Full replacement of candidate', () => {
  const result = applyCorrection('9876543210', 'mobile_number', {
    mode: 'full',
    correctionInput: '9988776655',
  });
  assert.equal(result.success, true);
  assert.equal(result.mergedValue, '9988776655');
});

test('Correction: Replace last 3 digits of mobile number', () => {
  // Candidate 9876543000 -> replace last 3 with 210
  const result = applyCorrection('9876543000', 'mobile_number', {
    mode: 'replace_last_n',
    lastN: 3,
    correctionInput: '210',
  });
  assert.equal(result.success, true);
  assert.equal(result.mergedValue, '9876543210');
});

test('Correction: Rejects invalid partial correction', () => {
  // Candidate 9876543210 -> replace last 2 with only 1 digit "5" -> total 9 digits -> invalid
  const result = applyCorrection('9876543210', 'mobile_number', {
    mode: 'replace_last_n',
    lastN: 2,
    correctionInput: '5',
  });
  assert.equal(result.success, false);
  assert.match(result.message, /failed validation/);
});

test('State transitions: Valid transitions allowed', () => {
  assert.equal(canTransition('idle', 'captured'), true);
  assert.equal(canTransition('captured', 'transcribing'), true);
  assert.equal(canTransition('transcribing', 'transcribed'), true);
  assert.equal(canTransition('transcribed', 'valid_candidate'), true);
  assert.equal(canTransition('valid_candidate', 'read_back'), true);
  assert.equal(canTransition('read_back', 'confirmed'), true);
  assert.equal(canTransition('read_back', 'rejected'), true);
});

test('State transitions: Invalid jumps blocked', () => {
  // Cannot jump directly from captured to confirmed without validation and read-back!
  assert.equal(canTransition('captured', 'confirmed'), false);
  assert.equal(canTransition('transcribing', 'confirmed'), false);
  assert.equal(canTransition('invalid_candidate', 'confirmed'), false);
});
