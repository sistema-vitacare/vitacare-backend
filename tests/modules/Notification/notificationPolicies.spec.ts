import {
  DELIVERY_LEASE_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  retryDelaySeconds,
} from '@/modules/Notification/policies/deliveryRetry.policy';
import { notificationMessage } from '@/modules/Notification/policies/notificationMessage.policy';
import { isAllowedPushEndpoint } from '@/modules/Notification/policies/pushEndpoint.policy';

describe('notificationMessage', () => {
  it.each([
    ['critical', 'Alerta crítico', 'Crítico'],
    ['warning', 'Alerta de atenção', 'Atenção'],
    ['info', 'Alerta informativo', 'Informativo'],
  ] as const)(
    'valor registrado %s: tipo e severidade, sem valor clinico',
    (severity, title, label) => {
      expect(
        notificationMessage({
          source: 'reading',
          severity,
          patientName: 'Maria Sintetica',
          appUrl: 'https://app.example.com',
        }),
      ).toEqual({
        title,
        body: `Paciente: Maria Sintetica · Severidade: ${label}`,
        subject: `VitaCare: ${title}`,
        text: `Paciente: Maria Sintetica · Severidade: ${label}\nAcesse o VitaCare para ver os detalhes: https://app.example.com`,
        url: 'https://app.example.com',
      });
    },
  );

  it('ausencia e lembrete tem titulo proprio; sem link o texto termina em ponto', () => {
    expect(
      notificationMessage({
        source: 'absence',
        severity: 'warning',
        patientName: 'Jose Sintetico',
      }),
    ).toEqual({
      title: 'Ausência de registro',
      body: 'Paciente: Jose Sintetico · Severidade: Atenção',
      subject: 'VitaCare: Ausência de registro',
      text: 'Paciente: Jose Sintetico · Severidade: Atenção\nAcesse o VitaCare para ver os detalhes.',
      url: null,
    });
    expect(
      notificationMessage({
        source: 'medication_reminder',
        severity: 'info',
        patientName: 'Jose Sintetico',
      }).title,
    ).toBe('Lembrete de medicamento');
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
