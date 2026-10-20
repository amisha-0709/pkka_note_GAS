import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  runSyntheticBenchmark,
  runProviderConnectivitySmokeTest,
  runLiveSyntheticSpeechBenchmark,
  benchmarkRunToCSV,
} from './services/syntheticBenchmarkSuite.ts';
import { callGnaniPrismaSTT } from './services/gnaniPrisma.ts';
import { callGnaniTimbreTTS } from './services/gnaniTimbre.ts';

describe('Benchmark Validity & Mode Distinction Tests', () => {
  test('Benchmark: Simulated regression mode runs offline fixtures and never marks as live API', async () => {
    const run = await runSyntheticBenchmark('simulated_transcript_regression');

    assert.equal(run.evaluationMode, 'simulated_transcript_regression');
    assert.equal(run.isLiveApi, false);
    assert.ok(run.sampleCount >= 10);
    assert.match(run.notes || '', /Simulated-transcript regression benchmark suite/);

    const csv = benchmarkRunToCSV(run);
    assert.match(csv, /# Evaluation Mode: simulated_transcript_regression/);
    assert.match(csv, /# Mode Description: Simulated Transcript Regression \(Offline Fixtures/);
    assert.match(csv, /# Is Live Provider Call: NO/);
  });

  test('Benchmark: Tone-based smoke test is explicitly labeled as provider connectivity, NOT speech accuracy', async () => {
    const run = await runProviderConnectivitySmokeTest();

    assert.equal(run.evaluationMode, 'provider_connectivity_smoke_test');
    assert.equal(run.isLiveApi, true);
    assert.equal(run.sampleCount, 1);
    assert.equal(run.cases[0].category, 'tone_connectivity_smoke');
    assert.equal(run.cases[0].audioCondition, 'synthetic_tone');
    assert.match(run.notes || '', /provider connectivity smoke test using a 440 Hz tone/i);

    const csv = benchmarkRunToCSV(run);
    assert.match(csv, /# Evaluation Mode: provider_connectivity_smoke_test/);
    assert.match(csv, /# Mode Description: Provider Connectivity Smoke Test \(Tone-based 440Hz/);
    assert.match(csv, /# Is Live Provider Call: YES/);
  });

  test('Benchmark: Live synthetic speech mode without pre-rendered clips discloses prerequisite instead of faking accuracy', async () => {
    const run = await runLiveSyntheticSpeechBenchmark([]);

    assert.equal(run.evaluationMode, 'live_synthetic_speech_benchmark');
    assert.equal(run.sampleCount, 0);
    assert.ok(run.prerequisites && run.prerequisites.length > 0);
    assert.match(run.notes || '', /requires pre-recorded synthetic speech clips with known ground truth/i);

    const csv = benchmarkRunToCSV(run);
    assert.match(csv, /# Evaluation Mode: live_synthetic_speech_benchmark/);
    assert.match(csv, /# Prerequisites:/);
  });

  test('Benchmark: Smoke-test, simulated regression, and live speech cannot be confused in runner', async () => {
    const simRun = await runSyntheticBenchmark(false);
    const smokeRun = await runSyntheticBenchmark(true);
    const speechRun = await runSyntheticBenchmark('live_synthetic_speech_benchmark');

    assert.notEqual(simRun.evaluationMode, smokeRun.evaluationMode);
    assert.notEqual(smokeRun.evaluationMode, speechRun.evaluationMode);
    assert.notEqual(simRun.evaluationMode, speechRun.evaluationMode);

    assert.equal(simRun.isLiveApi, false);
    assert.equal(smokeRun.isLiveApi, true);
    assert.equal(smokeRun.cases[0].audioCondition, 'synthetic_tone');
  });
});

describe('Mocked Provider Tests: Gnani Prisma STT & Timbre TTS', () => {
  const originalFetch = globalThis.fetch;

  test('Prisma Mock: HTTP 200 with empty transcript returns failure', async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ transcript: '   ' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await callGnaniPrismaSTT({
      audioBuffer: Buffer.from('RIFF1234WAVEfmt 1234data1234'),
      mimeType: 'audio/wav',
      languageCode: 'en-IN',
      format: 'transcribe',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'EMPTY_OR_UNRECOGNIZED_TRANSCRIPT');
  });

  test('Prisma Mock: HTTP 200 with invalid JSON body returns failure', async () => {
    globalThis.fetch = async () => {
      return new Response('<html><body>Error 502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await callGnaniPrismaSTT({
      audioBuffer: Buffer.from('RIFF1234WAVEfmt 1234data1234'),
      mimeType: 'audio/wav',
      languageCode: 'en-IN',
      format: 'transcribe',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'INVALID_JSON_RESPONSE');
  });

  test('Prisma Mock: HTTP 401/403 maps to GNANI_AUTH_FAILED and never exposes credentials', async () => {
    globalThis.fetch = async () => {
      return new Response('Unauthorized: Secret api-key-secret-12345678901234567890 is invalid', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      });
    };

    const res = await callGnaniPrismaSTT({
      audioBuffer: Buffer.from('RIFF1234WAVEfmt 1234data1234'),
      mimeType: 'audio/wav',
      languageCode: 'en-IN',
      format: 'transcribe',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'GNANI_AUTH_FAILED');
    assert.doesNotMatch(res.errorMessage || '', /api-key-secret-12345678901234567890/);
    assert.match(res.errorMessage || '', /\[REDACTED\]/);
  });

  test('Prisma Mock: Upstream 500 error returns GNANI_UPSTREAM_ERROR', async () => {
    globalThis.fetch = async () => {
      return new Response('Internal ASR Model Failure', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    };

    const res = await callGnaniPrismaSTT({
      audioBuffer: Buffer.from('RIFF1234WAVEfmt 1234data1234'),
      mimeType: 'audio/wav',
      languageCode: 'en-IN',
      format: 'transcribe',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'GNANI_UPSTREAM_ERROR');
  });

  test('Timbre Mock: Truncated binary audio response (< 44 bytes) returns AUDIO_TRUNCATED', async () => {
    globalThis.fetch = async () => {
      return new Response(Buffer.from('RIFF1234'), {
        status: 200,
        headers: { 'Content-Type': 'audio/wav' },
      });
    };

    const res = await callGnaniTimbreTTS({
      text: '9 8 7 6 5 4 3 2 1 0',
      languageCode: 'en-IN',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'AUDIO_TRUNCATED');
  });

  test('Timbre Mock: HTTP 200 with empty audio content returns EMPTY_AUDIO_RESPONSE', async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ audio_content: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await callGnaniTimbreTTS({
      text: '9 8 7 6 5 4 3 2 1 0',
      languageCode: 'en-IN',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'EMPTY_AUDIO_RESPONSE');
  });

  test('Timbre Mock: HTTP 500 error returns GNANI_UPSTREAM_ERROR with sanitized output', async () => {
    globalThis.fetch = async () => {
      return new Response('TTS Synthesizer engine crash error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    };

    const res = await callGnaniTimbreTTS({
      text: '9 8 7 6 5 4 3 2 1 0',
      languageCode: 'en-IN',
    });

    globalThis.fetch = originalFetch;

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'GNANI_UPSTREAM_ERROR');
  });
});
