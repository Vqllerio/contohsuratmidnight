/* ============================================================
   Client-side decryption (Web Crypto API)
   Exposes: window.LetterCrypto.decrypt(payload, code)
   ============================================================ */

(function () {
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // ⬇️ Normalize: trim whitespace + lowercase, so "ValenLove2026!X",
  //    "valenlove2026!x", and " ValenLove2026!X " all produce the same key.
  function normalizeCode(code) {
    return String(code || '').trim().toLowerCase();
  }

  async function deriveKey(code, saltBytes, iterations) {
    const normalized = normalizeCode(code);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalized),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  async function decrypt(payload, code) {
    if (!payload || !code) throw new Error('Missing payload or code');
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Browser tidak mendukung Web Crypto API');
    }

    const ct   = b64ToBytes(payload.ct);
    const iv   = b64ToBytes(payload.iv);
    const salt = b64ToBytes(payload.salt);
    const iter = payload.iter || 250000;

    const key = await deriveKey(code, salt, iter);

    try {
      const plaintextBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ct
      );
      const text = new TextDecoder().decode(plaintextBuf);
      return JSON.parse(text);
    } catch (err) {
      // GCM auth failure = wrong code
      throw new Error('INVALID_CODE');
    }
  }

  window.LetterCrypto = { decrypt };
})();