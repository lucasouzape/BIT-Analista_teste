'use strict';

const crypto = require('node:crypto');

// Formato armazenado: scrypt$<salt hex>$<hash hex>
const KEY_LENGTH = 64;

function gerarHash(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verificarSenha(senha, armazenado) {
  const partes = String(armazenado || '').split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, salt, hashHex] = partes;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(String(senha), salt, esperado.length);
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

module.exports = { gerarHash, verificarSenha };
