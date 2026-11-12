import { createServer, type AddressInfo, type Socket } from 'node:net';
import type { DataSource } from 'typeorm';

export interface NoticeOrg {
  id: string;
  code: string;
}

export interface NoticeUser {
  id: string;
  email: string;
}

/**
 * Semeia organizacoes, administradores e termos direto no banco: o job so le
 * o estado persistido.
 */
export const noticeSeeder = (dataSource: DataSource) => {
  let cpfSequence = 0;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value;
  };

  const cpf = (): string => {
    cpfSequence += 1;
    const base = String(500000000 + cpfSequence * 7919);
    const digit = (digits: string, weightStart: number) => {
      const sum = [...digits].reduce(
        (total, value, index) => total + Number(value) * (weightStart - index),
        0,
      );
      const remainder = (sum * 10) % 11;

      return remainder === 10 ? 0 : remainder;
    };
    const first = digit(base, 10);

    return `${base}${first}${digit(`${base}${first}`, 11)}`;
  };

  return {
    scalar,

    async organization(
      code: string,
      { kind = 'tenant' }: { kind?: 'tenant' | 'platform' } = {},
    ): Promise<NoticeOrg> {
      const id = await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id, kind)
         VALUES ($1, $1, $1,
                 CASE WHEN $2::varchar = 'tenant'
                      THEN (SELECT id FROM usage_plans WHERE code = 'basic') END,
                 $2::varchar)
         RETURNING id AS value`,
        [code, kind],
      );

      for (const profile of ['admin', 'professional']) {
        await dataSource.query(
          `INSERT INTO access_profiles (organization_id, code, name)
           VALUES ($1, $2, $2)`,
          [id, profile],
        );
      }

      return { id, code };
    },

    async user(
      org: NoticeOrg,
      profile: 'admin' | 'professional',
      status: 'active' | 'inactive' = 'active',
    ): Promise<NoticeUser> {
      const email = `${profile}-${cpfSequence + 1}@${org.code}.test`;
      const id = await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password, deleted_at)
         SELECT $1, id, 'Usuario Sintetico', $3, $4, $5::varchar, false,
                CASE WHEN $5::varchar = 'inactive' THEN now() END
           FROM access_profiles WHERE organization_id = $1 AND code = $2
         RETURNING id AS value`,
        [org.id, profile, email, cpf(), status],
      );

      return { id, email };
    },

    /** Termo corrente novo (substitui o anterior), aberto em `createdAt`. */
    async term(
      org: NoticeOrg,
      endsAt: Date | null,
      createdAt: Date = new Date(Date.now() - 30 * 86_400_000),
    ): Promise<string> {
      await dataSource.query(
        `UPDATE organization_plan_terms SET superseded_at = now()
          WHERE organization_id = $1 AND superseded_at IS NULL`,
        [org.id],
      );

      return scalar(
        `INSERT INTO organization_plan_terms
           (organization_id, usage_plan_id, starts_at, ends_at, origin, created_at)
         VALUES ($1, (SELECT id FROM usage_plans WHERE code = 'basic'),
                 $3::timestamptz - interval '30 days', $2, 'assignment', $3)
         RETURNING id AS value`,
        [org.id, endsAt, createdAt],
      );
    },
  };
};

export type NoticeSeeder = ReturnType<typeof noticeSeeder>;

export interface FakeSmtp {
  port: number;
  /** Mensagens aceitas (cabecalhos e corpo crus). */
  messages: string[];
  /** Responde `451` aos proximos `count` envios, como um SMTP sobrecarregado. */
  failNext(count: number): void;
  close(): Promise<void>;
}

/**
 * SMTP minimo em processo, para o e2e exercitar o transporte real do projeto
 * (nodemailer) e uma recusa temporaria sem depender de servico externo.
 */
export const startFakeSmtp = async (): Promise<FakeSmtp> => {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  let failures = 0;

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    socket.write('220 fake.smtp ESMTP\r\n');

    let buffer = '';
    let data: string[] | null = null;

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      for (
        let end = buffer.indexOf('\r\n');
        end >= 0;
        end = buffer.indexOf('\r\n')
      ) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (data) {
          if (line !== '.') {
            data.push(line.startsWith('..') ? line.slice(1) : line);
            continue;
          }

          if (failures > 0) {
            failures -= 1;
            socket.write('451 4.3.0 Tente mais tarde\r\n');
          } else {
            messages.push(data.join('\n'));
            socket.write('250 2.0.0 OK\r\n');
          }
          data = null;
          continue;
        }

        const command = line.slice(0, 4).toUpperCase();

        if (command === 'EHLO' || command === 'HELO') {
          socket.write('250 fake.smtp\r\n');
        } else if (command === 'DATA') {
          data = [];
          socket.write('354 Envie\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 Tchau\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    port: (server.address() as AddressInfo).port,
    messages,
    failNext: (count) => {
      failures = count;
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

const decodeQuotedPrintable = (value: string): string =>
  Buffer.from(
    value
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      ),
    'latin1',
  ).toString('utf8');

/** Assunto (RFC 2047) e corpo (quoted-printable ou base64) legiveis. */
export const readMessage = (
  raw: string,
): { to: string; subject: string; text: string } => {
  const split = raw.indexOf('\n\n');
  const headers = raw.slice(0, split).replace(/\n[ \t]+/g, ' ');
  const body = raw.slice(split + 2);
  const header = (name: string) =>
    new RegExp(`^${name}: (.*)$`, 'im').exec(headers)?.[1] ?? '';
  const subject = header('Subject')
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(
      /=\?UTF-8\?([QB])\?(.*?)\?=/gi,
      (_, encoding: string, text: string) =>
        encoding.toUpperCase() === 'B'
          ? Buffer.from(text, 'base64').toString('utf8')
          : decodeQuotedPrintable(text.replace(/_/g, ' ')),
    );
  const encoding = header('Content-Transfer-Encoding').toLowerCase();
  const text =
    encoding === 'base64'
      ? Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
      : encoding === 'quoted-printable'
        ? decodeQuotedPrintable(body)
        : body;

  return { to: header('To'), subject, text: text.replace(/\r/g, '') };
};
