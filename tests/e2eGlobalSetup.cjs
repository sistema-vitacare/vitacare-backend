const ensureNodeVersion = require('./ensureNodeVersion.cjs');
const { assertTestInfrastructure } = require('./testInfrastructure.cjs');

module.exports = async () => {
  ensureNodeVersion();
  await assertTestInfrastructure();
};
