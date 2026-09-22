import { Injectable } from '@nestjs/common';
import { AuthSessionRepository } from '../repositories/authSession.repository';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly sessions: AuthSessionRepository) {}
  async execute(sessionId: string): Promise<null> {
    await this.sessions.revoke(sessionId, 'logout');
    return null;
  }
}
