import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  sessionIdleSeconds: 1800,
  sessionAbsoluteSeconds: 43200,
  firstAccessSeconds: 600,
  recoverySeconds: 900,
  loginWindowSeconds: 900,
  loginBlockSeconds: 900,
  recoveryWindowSeconds: 3600,
}));
