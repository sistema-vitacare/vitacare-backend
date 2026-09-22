/**
 * Guarda de ambiente da suite de testes.
 *
 * O binario nativo do `argon2` nao e compativel com Node 20: em vez de erro,
 * o processo morre com SIGSEGV e o Jest reporta "worker process terminated",
 * sem dizer o motivo. Em maquina apertada isso derruba varios workers de uma
 * vez e leva junto a sessao do WSL. Falhar aqui, antes de qualquer worker
 * subir, troca o travamento por uma mensagem legivel.
 */
const REQUIRED_MAJOR = 22;

module.exports = () => {
  const [major] = process.versions.node.split('.');

  if (Number(major) >= REQUIRED_MAJOR) {
    return;
  }

  throw new Error(
    [
      '',
      `Node ${process.versions.node} nao roda a suite deste projeto.`,
      `O package.json exige Node >= ${REQUIRED_MAJOR} e o binario do argon2`,
      'derruba o processo com SIGSEGV nas versoes anteriores.',
      '',
      'Use a versao do .nvmrc antes de rodar os testes:',
      '  nvm use',
      '',
    ].join('\n'),
  );
};
