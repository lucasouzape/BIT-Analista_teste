-- =====================================================================
-- Portal de Solicitações Internas - Carga de dados de demonstração
-- Executado automaticamente pelo backend somente quando a tabela
-- "usuarios" estiver vazia.
--
-- Usuários de teste (usuário / senha):
--   admin  / admin123   -> perfil ATENDENTE (vê todas e altera status)
--   maria  / senha123   -> perfil SOLICITANTE
--   joao   / senha123   -> perfil SOLICITANTE
-- As senhas são armazenadas com hash scrypt + salt (nunca em texto puro).
-- =====================================================================

INSERT INTO usuarios (usuario, nome, senha_hash, perfil) VALUES
 ('admin', 'Administrador do Portal',
  'scrypt$541812be2a078138a96a6a832e3ecec9$5f2dc8a7b3dc70aa8fd7b62cd8ec3b1a454ef748963d49f1f99abadbb80906b1ea47dfcdc910fba7434bcf8d7d5a4e982fb94c8139b55fd38ca4e58e38d31e80',
  'ATENDENTE'),
 ('maria', 'Maria Oliveira',
  'scrypt$a09c3b4f9ae4999207963bbaf432a4fd$b9767f2be7cc8b74434d6faa8fc5a188ab7b314db74586cf0f5bbbdecaab00ff54ab6db22302dda5489241032a4306a7bc79e2a59f6b652cd796a53fb3e4b650',
  'SOLICITANTE'),
 ('joao', 'João Santos',
  'scrypt$6693e9776ed49564245c4047b5ab4403$3bc9d8cebfd1b28ddd6e48c49c33691d866eecdc7e8f0ff480392e23ff7b22444d2a70d371c16b6e237149b0a5f9fe74083f8eaa35b336c013c6eb6c933da101',
  'SOLICITANTE');
