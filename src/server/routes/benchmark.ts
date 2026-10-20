import { Router } from 'express';
import {
  runSyntheticBenchmark,
  benchmarkRunToCSV,
  type BenchmarkRunOptions,
} from '../services/syntheticBenchmarkSuite.ts';
import { auditDb } from '../persistence/database.ts';
import type { BenchmarkEvaluationMode } from '../../types/index.ts';

export const benchmarkRouter = Router();

benchmarkRouter.post('/api/benchmark/run', async (req, res) => {
  try {
    const mode = (req.body?.mode ||
      (req.body?.isLiveApi === true ? 'provider_connectivity_smoke_test' : 'simulated_transcript_regression')) as BenchmarkEvaluationMode;

    const options: BenchmarkRunOptions = {
      mode,
    };

    const result = await runSyntheticBenchmark(options);

    try {
      await auditDb.saveBenchmarkRun(result);
    } catch (dbErr) {
      console.error('[Benchmark Route] Failed to persist benchmark run to auditDb:', dbErr);
    }

    res.json({
      success: true,
      benchmarkRun: result,
    });
  } catch (err) {
    console.error('[Benchmark Route Error]', err);
    res.status(500).json({
      success: false,
      errorCode: 'BENCHMARK_EXECUTION_FAILED',
      message: err instanceof Error ? err.message : 'Benchmark execution failed.',
    });
  }
});

benchmarkRouter.get('/api/benchmark/results', (req, res) => {
  const runs = auditDb.getBenchmarkRuns();
  res.json({
    success: true,
    runs,
  });
});

benchmarkRouter.get('/api/benchmark/export', (req, res) => {
  const runId = req.query.run_id as string;
  let run = runId ? auditDb.getBenchmarkRun(runId) : undefined;

  if (!run) {
    const runs = auditDb.getBenchmarkRuns();
    run = runs[0];
  }

  if (!run) {
    return res.status(404).send('No benchmark runs available to export.');
  }

  const csv = benchmarkRunToCSV(run);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="pakka_note_benchmark_${run.runId}.csv"`
  );
  res.send(csv);
});
