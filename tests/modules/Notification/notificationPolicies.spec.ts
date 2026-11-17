import {
  DELIVERY_LEASE_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  retryDelaySeconds,
} from '@/modules/Notification/policies/deliveryRetry.policy';
import { notificationMessage } from '@/modules/Notification/policies/notificationMessage.policy';
import { isAllowedPushEndpoint } from '@/modules/Notification/policies/pushEndpoint.policy';

describe('notificationMessage', () => {
  it.each([
    ['critical', 'Alerta crítico', 'Crítico', '#B42318'],
    ['warning', 'Alerta de atenção', 'Atenção', '#B54708'],
    ['info', 'Alerta informativo', 'Informativo', '#175CD3'],
  ] as const)(
    'valor registrado %s: tipo e severidade, sem valor clinico',
    (severity, title, label, color) => {
      const message = notificationMessage({
        source: 'reading',
        severity,
        patientName: 'Maria Sintetica',
        appUrl: 'https://app.example.com',
      });

      expect(message).toMatchObject({
        title,
        body: `Paciente: Maria Sintetica · Severidade: ${label}`,
        url: 'https://app.example.com',
      });
      expect(message.email.subject).toBe(`VitaCare: ${title}`);
      expect(message.email.text).toBe(
        [
          title,
          `Severidade: ${label}\nPaciente: Maria Sintetica`,
          'Acesse o VitaCare para ver os detalhes.',
          'Abrir no VitaCare: https://app.example.com',
          '--\nE-mail automático do VitaCare. Não responda esta mensagem.',
        ].join('\n\n'),
      );
      expect(message.email.html).toContain(`color:${color};">${label}</p>`);
      expect(message.email.html).toContain('>Abrir no VitaCare</a>');
      expect(message.email.html).toContain('href="https://app.example.com"');
    },
  );

  it('ausencia e lembrete tem titulo proprio; sem link nao ha botao', () => {
    const message = notificationMessage({
      source: 'absence',
      severity: 'warning',
      patientName: 'Jose Sintetico',
    });

    expect(message).toMatchObject({
      title: 'Ausência de registro',
      body: 'Paciente: Jose Sintetico · Severidade: Atenção',
      url: null,
    });
    expect(message.email.subject).toBe('VitaCare: Ausência de registro');
    expect(message.email.text).toContain(
      'Severidade: Atenção\nPaciente: Jose Sintetico\n\nAcesse o VitaCare para ver os detalhes.',
    );
    expect(message.email.text).not.toContain('http');
    expect(message.email.html).not.toContain('<a ');
    expect(
      notificationMessage({
        source: 'medication_reminder',
        severity: 'info',
        patientName: 'Jose Sintetico',
      }).title,
    ).toBe('Lembrete de medicamento');
  });

  it('o e-mail leva so tipo, severidade e paciente, escapado no HTML', () => {
    const { email } = notificationMessage({
      source: 'reading',
      severity: 'critical',
      patientName: '<b>Ana</b> & "Filhos"',
      appUrl: 'https://app.example.com',
    });

    expect(email.html).toContain(
      'Paciente: &lt;b&gt;Ana&lt;/b&gt; &amp; &quot;Filhos&quot;',
    );
    expect(email.html).not.toContain('<b>Ana</b>');
    expect(email.text).toContain('Paciente: <b>Ana</b> & "Filhos"');
    expect(`${email.html}\n${email.text}`).not.toMatch(
      /mmHg|bpm|mg\/dL|valor|regra|formulário|medicamento|CPF/i,
    );
  });
});

describe('tentativas de entrega', () => {
  it('cinco tentativas, reserva de dois minutos e espera crescente', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
    expect(DELIVERY_LEASE_SECONDS).toBe(120);
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([60, 300, 1800, 7200]);
  });
});

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-bl2p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
  ])('aceita servico conhecido %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.test/abc',
    'https://evilpush.apple.com/abc',
    'https://notify.windows.com.evil.test/abc',
    'https://user@fcm.googleapis.com/abc',
    'https://fcm.googleapis.com:8443/abc',
    'https://127.0.0.1/abc',
    'https://127.0.0.1;.push.apple.com/x',
    "https://db'.notify.windows.com/x",
    'https://a{b}.push.apple.com/x',
    'https://a"b.push.apple.com/x',
    'https://a`b.notify.windows.com/x',
    'nao e url',
    '',
  ])('recusa %p', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
