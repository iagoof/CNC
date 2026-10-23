import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_MATERIALS } from '../src/data/initialData';

test('Benchmark sequential save vs writeBatch for materials seeding', async () => {
  const userId = 'user-bench-123';
  const materials = INITIAL_MATERIALS;

  // Simulate network roundtrip latency per operation (e.g. 15ms)
  const LATENCY_MS = 15;

  // Sequential: Each material save requires a transaction or setDoc roundtrip
  const startSequential = performance.now();
  for (const mat of materials) {
    await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
  }
  const durationSequential = performance.now() - startSequential;

  // WriteBatch: All material documents are committed in a single roundtrip
  const startBatch = performance.now();
  await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
  const durationBatch = performance.now() - startBatch;

  console.log(`Sequential seeding time (${materials.length} materials): ${durationSequential.toFixed(2)}ms`);
  console.log(`WriteBatch seeding time (${materials.length} materials): ${durationBatch.toFixed(2)}ms`);
  console.log(`Speedup factor: ${(durationSequential / durationBatch).toFixed(2)}x`);

  assert(durationBatch < durationSequential, 'Batch write should be significantly faster than sequential writes');
  assert(durationSequential / durationBatch >= 3.0, 'Batch write should be at least 3x faster than sequential writes');
});
