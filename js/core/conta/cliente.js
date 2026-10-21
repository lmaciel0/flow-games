/**
 * Cliente Supabase da conta e do placar. Único módulo que importa o supabase-js,
 * e só no primeiro uso, para o site carregar mesmo se o arquivo falhar.
 * Todo método devolve `{ ok: true, dados? } | { ok: false, erro }` e nunca lança;
 * o erro é sempre uma mensagem em pt-BR, nunca o texto cru do servidor.
 */

import { SUPABASE_URL, SUPABASE_CHAVE } from './config.js';
import { emailSintetico } from './validar.js';
import { normalizar } from './progresso.js';

const BUCKET_AVATARES = 'avatars';

const ERRO_GENERICO = 'Algo deu errado. Tente novamente em instantes.';
const ERRO_REDE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
const ERRO_CREDENCIAIS = 'Usuário ou senha incorretos';
const ERRO_USUARIO_EXISTE = 'Esse nome de usuário já existe';
const ERRO_CADASTRO_SEM_SESSAO = 'Não foi possível criar a conta agora. Tente novamente em instantes.';
const ERRO_LIMITE = 'Muitas tentativas. Espere um pouco e tente de novo.';
const ERRO_SENHA_FRACA = 'A senha precisa ter pelo menos 6 caracteres.';
const ERRO_NAO_LOGADO = 'Entre na sua conta para continuar.';
const ERRO_VALOR = 'Valor inválido.';
const ERRO_FOTO_GRANDE = 'A imagem ficou grande demais. Tente outra.';
const ERRO_FOTO_FORMATO = 'Formato de imagem não aceito.';
const ERRO_EVENTO = 'Evento de jogo desconhecido.';

async function carregarCreateClient(...args) {
  const { createClient } = await import('../../vendor/supabase.js');
  return createClient(...args);
}

function falha(erro) {
  return { ok: false, erro };
}

function ehErroDeRede(e) {
  if (e?.name === 'AuthRetryableFetchError' || e?.status === 0) return true;
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|importing a module script failed/i
    .test(String(e?.message ?? ''));
}

function traduzir(e) {
  const codigo = String(e?.code ?? '');
  const status = Number(e?.status ?? e?.statusCode);
  if (codigo === '23505' || codigo === 'user_already_exists' || codigo === 'email_exists'
    || e?.message === 'User already registered') return ERRO_USUARIO_EXISTE;
  if (status === 429 || codigo.startsWith('over_')) return ERRO_LIMITE;
  if (codigo === 'weak_password') return ERRO_SENHA_FRACA;
  // 42501: RPC só de `authenticated` chamada sem sessão; PGRST301: JWT inválido.
  if (codigo === '28000' || codigo === '42501' || codigo === 'PGRST301') return ERRO_NAO_LOGADO;
  if (codigo === '22023' || codigo === '23514') return ERRO_VALOR;
  if (status === 413) return ERRO_FOTO_GRANDE;
  if (status === 415) return ERRO_FOTO_FORMATO;
  if (ehErroDeRede(e)) return ERRO_REDE;
  return ERRO_GENERICO;
}

// Login: qualquer recusa do Auth (4xx) vira a mesma mensagem, sem dizer se o
// usuário existe.
function traduzirLogin(e) {
  const status = Number(e?.status);
  if (status === 429 || ehErroDeRede(e)) return traduzir(e);
  if (e?.message === 'Invalid login credentials' || e?.code === 'invalid_credentials'
    || (status >= 400 && status < 500)) return ERRO_CREDENCIAIS;
  return traduzir(e);
}

function idDaSessao(sessao) {
  const id = sessao?.user?.id;
  return id ? { id } : null;
}

function linhaDoPlacar(r) {
  return {
    posicao: Number(r.posicao),
    userId: r.user_id,
    username: r.username,
    avatar: r.avatar,
    valor: Number(r.valor),
  };
}

function numero(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function rpcDoEvento(jogo, evento) {
  const tipo = evento?.tipo;
  if (jogo === 'termo' && tipo === 'vitoria') return ['registrar_vitoria_termo'];
  if (jogo === 'termo' && tipo === 'derrota') return ['registrar_derrota_termo'];
  if (jogo === 'game2048' && tipo === 'pontos' && numero(evento.valor)) {
    return ['registrar_pontos_2048', { p_pontos: Math.trunc(evento.valor) }];
  }
  if ((jogo === 'snake' || jogo === 'tetris') && tipo === 'pontos' && numero(evento.valor)) {
    return ['registrar_pontos', { p_jogo: jogo, p_pontos: Math.trunc(evento.valor) }];
  }
  if (jogo === 'minesweeper' && tipo === 'tempo' && typeof evento.nivel === 'string' && numero(evento.valor)) {
    return ['registrar_tempo_minas', { p_nivel: evento.nivel, p_segundos: Math.trunc(evento.valor) }];
  }
  if (jogo === 'tictactoe' && tipo === 'vitoria') return ['registrar_vitoria_velha'];
  if (jogo === 'blockstrike' && tipo === 'partida' && typeof evento.venceu === 'boolean') {
    return ['registrar_partida_blockstrike', { p_venceu: evento.venceu, p_kd: numero(evento.kd) ? evento.kd : 0 }];
  }
  return null;
}

export function criarCliente(fabrica = carregarCreateClient) {
  let pendente = null;

  // Cria o supabase-js uma vez; se falhar, a próxima chamada tenta de novo.
  function obter() {
    if (!pendente) {
      pendente = (async () => fabrica(SUPABASE_URL, SUPABASE_CHAVE, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      }))();
      pendente.catch(() => { pendente = null; });
    }
    return pendente;
  }

  async function executar(acao) {
    try {
      return await acao(await obter());
    } catch (e) {
      return falha(traduzir(e));
    }
  }

  async function rpcSemDados(sb, ...chamada) {
    const { error } = await sb.rpc(...chamada);
    return error ? falha(traduzir(error)) : { ok: true };
  }

  return {
    cadastrar: (usuario, senha, avatar) => executar(async (sb) => {
      const { data, error } = await sb.auth.signUp({ email: emailSintetico(usuario), password: senha });
      if (error) return falha(traduzir(error));
      // Sem sessão = o projeto pede confirmação de e-mail; sem login não há perfil.
      if (!data?.session) return falha(ERRO_CADASTRO_SEM_SESSAO);
      const id = idDaSessao(data.session) ?? (data.user?.id ? { id: data.user.id } : null);
      if (!id) return falha(ERRO_GENERICO);
      const perfil = await sb.rpc('criar_perfil', { p_username: usuario, p_avatar: avatar });
      if (perfil.error) return falha(traduzir(perfil.error));
      return { ok: true, dados: id };
    }),

    entrar: (usuario, senha) => executar(async (sb) => {
      const { data, error } = await sb.auth.signInWithPassword({
        email: emailSintetico(usuario),
        password: senha,
      });
      if (error) return falha(traduzirLogin(error));
      const id = data?.user?.id ?? data?.session?.user?.id;
      return id ? { ok: true, dados: { id } } : falha(ERRO_GENERICO);
    }),

    sair: () => executar(async (sb) => {
      const { error } = await sb.auth.signOut();
      return error ? falha(traduzir(error)) : { ok: true };
    }),

    sessaoAtual: () => executar(async (sb) => {
      const { data, error } = await sb.auth.getSession();
      if (error) return falha(traduzir(error));
      return { ok: true, dados: idDaSessao(data?.session) };
    }),

    // O ouvinte roda fora do callback do supabase-js (setTimeout): chamar o
    // cliente de dentro do callback pode travar o lock de sessão.
    aoMudarSessao: (fn) => executar(async (sb) => {
      if (typeof fn !== 'function') return falha(ERRO_GENERICO);
      const { data } = sb.auth.onAuthStateChange((_evento, sessao) => {
        const id = idDaSessao(sessao);
        setTimeout(() => {
          try {
            Promise.resolve(fn(id)).catch(() => {});
          } catch { /* ouvinte com erro não derruba o cliente */ }
        }, 0);
      });
      const assinatura = data?.subscription;
      const cancelar = () => {
        try { assinatura?.unsubscribe(); } catch { /* já cancelada */ }
      };
      return { ok: true, dados: { cancelar } };
    }),

    perfil: (id) => executar(async (sb) => {
      const { data, error } = await sb.from('profiles')
        .select('username, avatar').eq('user_id', id).maybeSingle();
      if (error) return falha(traduzir(error));
      return { ok: true, dados: data ? { username: data.username, avatar: data.avatar } : null };
    }),

    enviarFoto: (id, blob) => executar(async (sb) => {
      const { error } = await sb.storage.from(BUCKET_AVATARES)
        .upload(`${id}/avatar`, blob, { upsert: true, contentType: blob?.type });
      return error ? falha(traduzir(error)) : { ok: true };
    }),

    urlFoto: (id, versao) => executar(async (sb) => {
      const { data } = sb.storage.from(BUCKET_AVATARES).getPublicUrl(`${id}/avatar`);
      const base = data?.publicUrl;
      if (!base) return falha(ERRO_GENERICO);
      const separador = base.includes('?') ? '&' : '?';
      return { ok: true, dados: `${base}${separador}v=${encodeURIComponent(versao)}` };
    }),

    minhaPosicao: (jogo) => executar(async (sb) => {
      const { data, error } = await sb.rpc('minha_posicao', { p_jogo: jogo });
      if (error) return falha(traduzir(error));
      const linha = Array.isArray(data) && data.length ? linhaDoPlacar(data[0]) : null;
      return { ok: true, dados: linha };
    }),

    trocarAvatar: (codigo) => executar((sb) => rpcSemDados(sb, 'trocar_avatar', { p_avatar: codigo })),

    sincronizar: (progresso) => executar(async (sb) => {
      const { data, error } = await sb.rpc('sincronizar_progresso_v2', {
        p_progresso: normalizar(progresso),
      });
      if (error) return falha(traduzir(error));
      if (!data || typeof data !== 'object' || !data.termo) return falha(ERRO_GENERICO);
      return { ok: true, dados: normalizar(data) };
    }),

    registrar: (jogo, evento) => {
      let chamada = null;
      try { chamada = rpcDoEvento(jogo, evento); } catch { /* evento malformado */ }
      if (!chamada) return Promise.resolve(falha(ERRO_EVENTO));
      return executar((sb) => rpcSemDados(sb, ...chamada));
    },

    lerPlacar: (jogo, limite) => executar(async (sb) => {
      const { data, error } = await sb.rpc('ler_placar', { p_jogo: jogo, p_limite: limite });
      if (error) return falha(traduzir(error));
      return { ok: true, dados: { linhas: (Array.isArray(data) ? data : []).map(linhaDoPlacar) } };
    }),
  };
}

export const cliente = criarCliente();
