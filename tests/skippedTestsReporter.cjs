const { relative } = require('node:path');
const { infrastructureRequired } = require('./testInfrastructure.cjs');

/**
 * Nenhum teste pulado passa calado (BE-24): o resumo lista cada arquivo com
 * testes pulados e, com VITACARE_TEST_REQUIRE_INFRA=true, reprova a execucao.
 */
class SkippedTestsReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.error = undefined;
  }

  onRunComplete(_contexts, results) {
    const skipped = results.testResults
      .filter((file) => file.numPendingTests + file.numTodoTests > 0)
      .map(
        (file) =>
          `  - ${relative(this.rootDir, file.testFilePath)} (${file.numPendingTests + file.numTodoTests})`,
      );

    if (skipped.length === 0) return;

    const total = results.numPendingTests + results.numTodoTests;
    const lines = [
      '',
      `${total} teste(s) pulado(s) em ${skipped.length} arquivo(s):`,
      ...skipped,
      'As suites de banco e Redis pulam sem VITACARE_TEST_DATABASE_URL e VITACARE_TEST_REDIS_URL.',
      '',
    ];

    if (infrastructureRequired()) {
      this.error = new Error(
        'VITACARE_TEST_REQUIRE_INFRA=true nao aceita teste pulado.',
      );
      process.stderr.write(`${lines.join('\n')}${this.error.message}\n`);
      return;
    }

    process.stderr.write(`${lines.join('\n')}\n`);
  }

  getLastError() {
    return this.error;
  }
}

module.exports = SkippedTestsReporter;
