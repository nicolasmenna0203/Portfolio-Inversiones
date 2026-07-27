import { describe, it, expect, vi, afterEach } from 'vitest';
import { crearToken, verificarToken, SESSION_MAX_AGE } from './session';

const SECRET = 'un-secreto-de-test-bien-largo';

afterEach(() => {
  vi.useRealTimers();
});

describe('crearToken / verificarToken', () => {
  it('un token recién creado verifica OK y devuelve el usuario', async () => {
    const token = await crearToken('nm', SECRET);
    expect(await verificarToken(token, SECRET)).toBe('nm');
  });

  it('rechaza el token si se verifica con otro secreto', async () => {
    const token = await crearToken('nm', SECRET);
    expect(await verificarToken(token, 'otro-secreto')).toBeNull();
  });

  it('rechaza un token con la firma alterada', async () => {
    const token = await crearToken('nm', SECRET);
    const [payload, sig] = token.split('.');
    const tampered = `${payload}.${sig.slice(0, -1)}${sig.at(-1) === 'a' ? 'b' : 'a'}`;
    expect(await verificarToken(tampered, SECRET)).toBeNull();
  });

  it('rechaza un token con el payload alterado (mismo secreto, firma vieja)', async () => {
    const tokenAdmin = await crearToken('admin', SECRET);
    const tokenUser = await crearToken('nm', SECRET);
    const [, sigAdmin] = tokenAdmin.split('.');
    const [payloadUser] = tokenUser.split('.');
    // Intento de Frankenstein: payload de un usuario + firma de otro.
    expect(await verificarToken(`${payloadUser}.${sigAdmin}`, SECRET)).toBeNull();
  });

  it('rechaza tokens malformados sin tirar excepción', async () => {
    expect(await verificarToken('', SECRET)).toBeNull();
    expect(await verificarToken('sin-punto', SECRET)).toBeNull();
    expect(await verificarToken('a.b.c', SECRET)).toBeNull();
    expect(await verificarToken('!!!.!!!', SECRET)).toBeNull();
  });

  it('expira pasado SESSION_MAX_AGE', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 0, 1));

    const token = await crearToken('nm', SECRET);
    expect(await verificarToken(token, SECRET)).toBe('nm');

    // Un segundo antes de expirar: todavía válido.
    vi.setSystemTime(Date.UTC(2026, 0, 1) + SESSION_MAX_AGE * 1000 - 1000);
    expect(await verificarToken(token, SECRET)).toBe('nm');

    // Un segundo después: ya no.
    vi.setSystemTime(Date.UTC(2026, 0, 1) + SESSION_MAX_AGE * 1000 + 1000);
    expect(await verificarToken(token, SECRET)).toBeNull();
  });
});
