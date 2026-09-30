'use strict';

const crypto = require('node:crypto');

const COOKIE_NAME = 'portal_sid';
const SESSAO_HORAS = Number(process.env.SESSAO_HORAS || 8);

function lerCookies(req) {
  const cookies = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const idx = parte.indexOf('=');
    if (idx < 0) continue;
    cookies[parte.slice(0, idx).trim()] = decodeURIComponent(parte.slice(idx + 1).trim());
  }
  return cookies;
}

function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  };
}

function criarSessao(db, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sessoes (token, usuario_id, expira_em)
     VALUES (?, ?, datetime('now', ?))`
  ).run(token, usuarioId, `+${SESSAO_HORAS} hours`);
  res.cookie(COOKIE_NAME, token, { ...opcoesCookie(), maxAge: SESSAO_HORAS * 3600 * 1000 });
}

function encerrarSessao(db, req, res) {
  const token = lerCookies(req)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
  res.clearCookie(COOKIE_NAME, opcoesCookie());
}

// Retorna o usuário dono da sessão válida (não expirada) ou null.
function usuarioDaSessao(db, req) {
  const token = lerCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const usuario = db.prepare(
    `SELECT u.id, u.usuario, u.nome, u.perfil
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ? AND s.expira_em > datetime('now') AND u.ativo = 1`
  ).get(token);
  return usuario ? { ...usuario } : null;
}

function exigirAutenticacao(db) {
  return (req, res, next) => {
    const usuario = usuarioDaSessao(db, req);
    if (!usuario) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
    req.usuario = usuario;
    next();
  };
}

function exigirPerfil(perfil) {
  return (req, res, next) => {
    if (req.usuario.perfil !== perfil) {
      return res.status(403).json({ erro: 'Você não tem permissão para esta operação.' });
    }
    next();
  };
}

function limparSessoesExpiradas(db) {
  db.prepare("DELETE FROM sessoes WHERE expira_em <= datetime('now')").run();
}

module.exports = {
  criarSessao,
  encerrarSessao,
  usuarioDaSessao,
  exigirAutenticacao,
  exigirPerfil,
  limparSessoesExpiradas,
};
