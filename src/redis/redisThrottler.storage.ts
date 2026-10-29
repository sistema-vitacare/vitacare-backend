import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
// O indice do pacote nao reexporta o tipo do registro.
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';

/**
 * Janela fixa atomica. KEYS[1] conta os hits, KEYS[2] marca o bloqueio.
 * Devolve { hits, ms ate a janela expirar, bloqueado (0/1), ms ate desbloquear }.
 */
const INCREMENT_SCRIPT = `
local hits_key, block_key = KEYS[1], KEYS[2]
local ttl, limit, block = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local block_ttl = redis.call('PTTL', block_key)
if block_ttl > 0 then
  return { tonumber(redis.call('GET', hits_key) or '0'), redis.call('PTTL', hits_key), 1, block_ttl }
end
local hits = redis.call('INCR', hits_key)
if hits == 1 then redis.call('PEXPIRE', hits_key, ttl) end
local hits_ttl = redis.call('PTTL', hits_key)
if hits > limit then
  redis.call('SET', block_key, '1', 'PX', block)
  return { hits, hits_ttl, 1, block }
end
return { hits, hits_ttl, 0, 0 }
`;

const toSeconds = (milliseconds: number): number =>
  Math.max(0, Math.ceil(milliseconds / 1000));

/**
 * Storage do rate limit global no Redis compartilhado. O padrao do
 * `@nestjs/throttler` guarda a contagem na memoria do processo: zera a cada
 * deploy/restart e, com mais de um processo, cada um teria o proprio balde e o
 * limite efetivo por IP
 * seria N vezes o configurado.
 *
 * Redis fora do ar NAO derruba a API: o limite global e protecao de volume, e
 * o request passa com aviso no log. O limite de abuso do login
 * (`AuthRateLimiter`) continua falhando fechado, de proposito.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly client: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;

    // Sem conexao pronta o ioredis enfileiraria o comando e retentaria por
    // segundos: o request esperaria o Redis voltar. Libera na hora.
    if (this.client.status !== 'ready') {
      return this.allow(ttl, `cliente Redis em estado ${this.client.status}`);
    }

    try {
      const [hits, hitsTtl, blocked, blockTtl] = (await this.client.eval(
        INCREMENT_SCRIPT,
        2,
        base,
        `${base}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      return {
        totalHits: hits,
        timeToExpire: toSeconds(hitsTtl),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(blockTtl),
      };
    } catch (error) {
      return this.allow(
        ttl,
        error instanceof Error ? error.message : 'erro desconhecido',
      );
    }
  }

  private allow(ttl: number, reason: string): ThrottlerStorageRecord {
    this.logger.warn(
      `Rate limit global sem Redis, request liberado: ${reason}`,
    );

    return {
      totalHits: 0,
      timeToExpire: toSeconds(ttl),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
