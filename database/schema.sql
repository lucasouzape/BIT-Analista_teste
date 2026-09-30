-- =====================================================================
-- Portal de Solicitações Internas - Script de criação do banco de dados
-- SGBD: SQLite 3 (sintaxe SQL ANSI, facilmente portável)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Usuários do sistema
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario     VARCHAR(50)  NOT NULL UNIQUE,
    nome        VARCHAR(120) NOT NULL,
    senha_hash  VARCHAR(255) NOT NULL,
    perfil      VARCHAR(20)  NOT NULL DEFAULT 'SOLICITANTE'
                CHECK (perfil IN ('SOLICITANTE', 'ATENDENTE')),
    ativo       INTEGER      NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Sessões autenticadas (controle de sessão / logout)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes (
    token       CHAR(64)     PRIMARY KEY,
    usuario_id  INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em   DATETIME     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

-- ---------------------------------------------------------------------
-- Categorias de solicitação
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        VARCHAR(50)  NOT NULL UNIQUE,
    ativo       INTEGER      NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

-- ---------------------------------------------------------------------
-- Solicitações
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitacoes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo        VARCHAR(150) NOT NULL,
    descricao     TEXT         NOT NULL,
    categoria_id  INTEGER      NOT NULL REFERENCES categorias(id),
    usuario_id    INTEGER      NOT NULL REFERENCES usuarios(id),
    status        VARCHAR(20)  NOT NULL DEFAULT 'ABERTO'
                  CHECK (status IN ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')),
    criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concluido_em  DATETIME     NULL
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_usuario   ON solicitacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status    ON solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_categoria ON solicitacoes(categoria_id);

-- ---------------------------------------------------------------------
-- Histórico (trilha de auditoria / acompanhamento da evolução)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historico_solicitacoes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitacao_id   INTEGER      NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
    usuario_id       INTEGER      NOT NULL REFERENCES usuarios(id),
    acao             VARCHAR(20)  NOT NULL
                     CHECK (acao IN ('CRIACAO', 'EDICAO', 'STATUS')),
    status_anterior  VARCHAR(20)  NULL,
    status_novo      VARCHAR(20)  NULL,
    comentario       TEXT         NULL,
    criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historico_solicitacao ON historico_solicitacoes(solicitacao_id);

-- ---------------------------------------------------------------------
-- Carga inicial de categorias
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO categorias (nome) VALUES
    ('TI'), ('RH'), ('Compras'), ('Financeiro'), ('Infraestrutura');
