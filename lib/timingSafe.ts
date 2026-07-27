/**
 * Comparación de strings en tiempo constante.
 *
 * `a === b` corta en el primer byte distinto, así que el tiempo de respuesta
 * filtra cuántos caracteres del prefijo son correctos. Con suficientes intentos
 * eso permite reconstruir la contraseña carácter por carácter.
 *
 * No se usa `crypto.timingSafeEqual` de Node porque este código también corre en
 * el Edge runtime (middleware), donde `node:crypto` no está disponible.
 */
export function equalsSeguro(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);

  // El largo sí se filtra (es inevitable sin hashear antes), pero se recorre
  // igual el máximo de los dos para no cortar temprano por diferencia de tamaño.
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;

  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }

  return diff === 0;
}
