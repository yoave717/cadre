import { IndexManager } from '../../src/index-system/manager';

async function runBenchmark() {
  const projectRoot = process.cwd();
  console.log(`Benchmarking indexing for: ${projectRoot}`);

  const manager = new IndexManager(projectRoot, { useSqlite: true });

  console.log('Starting buildIndex...');
  const start = Date.now();

  const stats = await manager.buildIndex((progress) => {
    if (progress.total > 0 && progress.current % 10 === 0) {
      // console.log(`[${progress.phase}] ${progress.current}/${progress.total}`);
    }
  });

  const duration = Date.now() - start;
  console.log('Indexing completed!');
  console.log(`Time: ${duration}ms`);
  console.log(`Files: ${stats.totalFiles}`);
  console.log(`Symbols: ${stats.totalSymbols}`);
  console.log(`Size: ${stats.totalSize}`);
}

runBenchmark().catch(console.error);
