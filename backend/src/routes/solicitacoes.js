'use strict';

const express = require('express');
const { transacao } = require('../db');
const { exigirPerfil } = require('../auth');

const STATUS = ['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];

// Fluxo de status permitido: ABERTO -> EM_ANDAMENTO -> CONCLUIDO,
// podendo ser CANCELADO enquanto não estiver concluído.
const TRANSICOES = {
  ABERTO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
};

const LIMITES = { titulo: 150, descricao: 4000 };

const SELECT_SOLICITACAO = `
  SELECT s.id, s.titulo, s.descricao, s.status,
         s.criado_em, s.atualizado_em, s.concluido_em,
         s.categoria_id, c.nome AS categoria,
         s.usuario_id, u.nome AS solicitante, u.usuario AS solicitante_usuario
    FROM solicitacoes s
    JOIN categorias c ON c.id = s.categoria_id
    JOIN usuarios u   ON u.id = s.usuario_id`;

function validarDados(db, corpo) {
  const titulo = String(corpo?.titulo ?? '').trim();
  const descricao = String(corpo?.descricao ?? '').trim();
  const categoriaId = Number(corpo?.categoria_id);
  const erros = [];

  if (!titulo) erros.push('Título é obrigatório.');
  else if (titulo.length > LIMITES.titulo) erros.push(`Título deve ter no máximo ${LIMITES.titulo} caracteres.`);

  if (!descricao) erros.push('Descrição é obrigatória.');
  else if (descricao.length > LIMITES.descricao) erros.push(`Descrição deve ter no máximo ${LIMITES.descricao} caracteres.`);

  if (!Number.isInteger(categoriaId) ||
      !db.prepare('SELECT 1 FROM categorias WHERE id = ? AND ativo = 1').get(categoriaId)) {
    erros.push('Categoria inválida.');
  }

  return { erros, dados: { titulo, descricao, categoriaId } };
}

function rotasSolicitacoes(db) {
  const router = express.Router();

  const podeVerTodas = (usuario) => usuario.perfil === 'ATENDENTE';

  // Busca a solicitação respeitando a visibilidade do usuário logado.
  function buscarVisivel(req, res) {
    const id = Number(req.params.id);
    const solicitacao = Number.isInteger(id)
      ? db.prepare(`${SELECT_SOLICITACAO} WHERE s.id = ?`).get(id)
      : undefined;
    if (!solicitacao || (!podeVerTodas(req.usuario) && solicitacao.usuario_id !== req.usuario.id)) {
      res.status(404).json({ erro: 'Solicitação não encontrada.' });
      return null;
    }
    return { ...solicitacao };
  }

  // Edição e exclusão: somente o solicitante e somente com status ABERTO.
  function buscarEditavel(req, res) {
    const solicitacao = buscarVisivel(req, res);
    if (!solicitacao) return null;
    if (solicitacao.usuario_id !== req.usuario.id) {
      res.status(403).json({ erro: 'Somente o solicitante pode alterar esta solicitação.' });
      return null;
    }
    if (solicitacao.status !== 'ABERTO') {
      res.status(409).json({ erro: 'Apenas solicitações com status Aberto podem ser editadas ou excluídas.' });
      return null;
    }
    return solicitacao;
  }

  router.get('/', (req, res) => {
    const filtros = [];
    const params = [];

    if (!podeVerTodas(req.usuario)) {
      filtros.push('s.usuario_id = ?');
      params.push(req.usuario.id);
    }
    if (req.query.status && STATUS.includes(req.query.status)) {
      filtros.push('s.status = ?');
      params.push(req.query.status);
    }
    if (req.query.categoria_id) {
      filtros.push('s.categoria_id = ?');
      params.push(Number(req.query.categoria_id));
    }
    if (req.query.busca) {
      filtros.push('(s.titulo LIKE ? OR s.descricao LIKE ?)');
      const termo = `%${String(req.query.busca).trim()}%`;
      params.push(termo, termo);
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const lista = db.prepare(`${SELECT_SOLICITACAO} ${where} ORDER BY s.criado_em DESC, s.id DESC`).all(...params);
    res.json(lista);
  });

  router.get('/:id', (req, res) => {
    const solicitacao = buscarVisivel(req, res);
    if (!solicitacao) return;
    solicitacao.historico = db.prepare(
      `SELECT h.id, h.acao, h.status_anterior, h.status_novo, h.comentario, h.criado_em,
              u.nome AS usuario
         FROM historico_solicitacoes h
         JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.solicitacao_id = ?
        ORDER BY h.criado_em, h.id`
    ).all(solicitacao.id);
    res.json(solicitacao);
  });

  router.post('/', (req, res) => {
    const { erros, dados } = validarDados(db, req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

    const id = transacao(db, () => {
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO solicitacoes (titulo, descricao, categoria_id, usuario_id, status)
         VALUES (?, ?, ?, ?, 'ABERTO')`
      ).run(dados.titulo, dados.descricao, dados.categoriaId, req.usuario.id);
      db.prepare(
        `INSERT INTO historico_solicitacoes (solicitacao_id, usuario_id, acao, status_novo)
         VALUES (?, ?, 'CRIACAO', 'ABERTO')`
      ).run(lastInsertRowid, req.usuario.id);
      return lastInsertRowid;
    });

    res.status(201).json(db.prepare(`${SELECT_SOLICITACAO} WHERE s.id = ?`).get(id));
  });

  router.put('/:id', (req, res) => {
    const solicitacao = buscarEditavel(req, res);
    if (!solicitacao) return;
    const { erros, dados } = validarDados(db, req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

    transacao(db, () => {
      db.prepare(
        `UPDATE solicitacoes
            SET titulo = ?, descricao = ?, categoria_id = ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).run(dados.titulo, dados.descricao, dados.categoriaId, solicitacao.id);
      db.prepare(
        `INSERT INTO historico_solicitacoes (solicitacao_id, usuario_id, acao)
         VALUES (?, ?, 'EDICAO')`
      ).run(solicitacao.id, req.usuario.id);
    });

    res.json(db.prepare(`${SELECT_SOLICITACAO} WHERE s.id = ?`).get(solicitacao.id));
  });

  router.delete('/:id', (req, res) => {
    const solicitacao = buscarEditavel(req, res);
    if (!solicitacao) return;
    db.prepare('DELETE FROM solicitacoes WHERE id = ?').run(solicitacao.id);
    res.status(204).end();
  });

  router.patch('/:id/status', exigirPerfil('ATENDENTE'), (req, res) => {
    const solicitacao = buscarVisivel(req, res);
    if (!solicitacao) return;

    const novo = String(req.body?.status || '');
    const comentario = String(req.body?.comentario || '').trim() || null;
    if (!TRANSICOES[solicitacao.status].includes(novo)) {
      return res.status(409).json({
        erro: `Transição de status inválida: ${solicitacao.status} → ${novo || '(vazio)'}.`,
      });
    }

    transacao(db, () => {
      db.prepare(
        `UPDATE solicitacoes
            SET status = ?, atualizado_em = CURRENT_TIMESTAMP,
                concluido_em = CASE WHEN ? = 'CONCLUIDO' THEN CURRENT_TIMESTAMP ELSE concluido_em END
          WHERE id = ?`
      ).run(novo, novo, solicitacao.id);
      db.prepare(
        `INSERT INTO historico_solicitacoes
           (solicitacao_id, usuario_id, acao, status_anterior, status_novo, comentario)
         VALUES (?, ?, 'STATUS', ?, ?, ?)`
      ).run(solicitacao.id, req.usuario.id, solicitacao.status, novo, comentario);
    });

    res.json(db.prepare(`${SELECT_SOLICITACAO} WHERE s.id = ?`).get(solicitacao.id));
  });

  return router;
}

module.exports = { rotasSolicitacoes, STATUS, TRANSICOES };
