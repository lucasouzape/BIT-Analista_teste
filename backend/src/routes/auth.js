'use strict';

const express = require('express');
const { verificarSenha } = require('../senha');
const { criarSessao, encerrarSessao, exigirAutenticacao } = require('../auth');

function rotasAuth(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const usuario = String(req.body?.usuario || '').trim();
    const senha = String(req.body?.senha || '');
    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Informe usuário e senha.' });
    }

    const registro = db.prepare(
      'SELECT id, usuario, nome, perfil, senha_hash FROM usuarios WHERE usuario = ? AND ativo = 1'
    ).get(usuario);

    if (!registro || !verificarSenha(senha, registro.senha_hash)) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }

    criarSessao(db, res, registro.id);
    res.json({ id: registro.id, usuario: registro.usuario, nome: registro.nome, perfil: registro.perfil });
  });

  router.post('/logout', (req, res) => {
    encerrarSessao(db, req, res);
    res.status(204).end();
  });

  router.get('/me', exigirAutenticacao(db), (req, res) => {
    res.json(req.usuario);
  });

  return router;
}

module.exports = rotasAuth;
