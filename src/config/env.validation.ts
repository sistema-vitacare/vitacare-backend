import Joi from 'joi';

const host = Joi.alternatives().try(Joi.string().hostname(), Joi.string().ip());

const bool = Joi.boolean().truthy('true').falsy('false');

export const environmentValidationSchema = Joi.object({
  // Aplicacao
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().trim().default('api'),
  API_VERSION: Joi.string().trim().default('1'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  SWAGGER_ENABLED: bool.default(true),
  SWAGGER_PATH: Joi.string().trim().default('docs'),

  // Seguranca
  CORS_ORIGINS: Joi.string().allow('').default(''),
  CORS_CREDENTIALS: bool.default(false),
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  SMTP_ENABLED: bool.default(false),
  SMTP_HOST: Joi.when('SMTP_ENABLED', {
    is: true,
    then: Joi.string().hostname().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.when('SMTP_ENABLED', {
    is: true,
    then: Joi.string().email().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  PASSWORD_RESET_URL: Joi.when('SMTP_ENABLED', {
    is: true,
    then: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  SMTP_CONNECTION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000),
  SMTP_GREETING_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000),
  SMTP_SOCKET_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000),

  // PostgreSQL externo
  DB_HOST: host.required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  DB_SCHEMA: Joi.string().default('public'),
  DB_SSL: bool.default(false),
  DB_SSL_REJECT_UNAUTHORIZED: bool.default(true),
  DB_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),
  DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  DB_MIGRATIONS_TABLE: Joi.string().default('migrations'),

  // Redis externo (cache e filas/workers)
  REDIS_HOST: host.required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_USERNAME: Joi.string().allow('').optional(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_TLS: bool.default(false),
  REDIS_CONNECT_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  REDIS_KEY_PREFIX: Joi.string().allow('').default('vitacare:'),
  QUEUE_PREFIX: Joi.string().default('vitacare'),
});
