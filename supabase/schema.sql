-- Contas e placar compartilhado do flow-games (Supabase, projeto jylkqxmfbjrtnuwqcmry).
-- Registro do que foi aplicado via MCP apply_migration (nome: contas_placar_inicial).
-- Leitura pública; nenhuma escrita direta nas tabelas: toda escrita passa pelas RPC
-- security definer abaixo, que usam auth.uid().

-- ---------------------------------------------------------------- tabelas

create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar     text not null default 'icone:🦊'
             check (avatar ~ '^(icone:.{1,8}|foto:[0-9]{1,16})$'),
  created_at timestamptz not null default now()
);

create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.placar (
  user_id    uuid not null references auth.users (id) on delete cascade,
  jogo       text not null check (jogo in ('termo', 'game2048')),
  valor      int  not null default 0,
  extra      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, jogo)
);

create index placar_ranking_idx on public.placar (jogo, valor desc, updated_at asc);

-- ---------------------------------------------------------------- RLS e grants

alter table public.profiles enable row level security;
alter table public.placar   enable row level security;

create policy profiles_leitura_publica on public.profiles
  for select to anon, authenticated using (true);

create policy placar_leitura_publica on public.placar
  for select to anon, authenticated using (true);

revoke all on public.profiles, public.placar from anon, authenticated;
grant select on public.profiles, public.placar to anon, authenticated;

-- ---------------------------------------------------------------- RPC: perfil

-- Cria o perfil da conta logada. Falha se o perfil já existir (pk) ou se o
-- nome já estiver em uso sem diferenciar maiúsculas (profiles_username_lower_key).
create function public.criar_perfil(p_username text, p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  insert into profiles (user_id, username, avatar)
  values (v_uid, p_username, coalesce(p_avatar, 'icone:🦊'));
end $$;

create function public.trocar_avatar(p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  update profiles set avatar = p_avatar where user_id = v_uid;
  if not found then raise exception 'perfil inexistente' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- RPC: escrita de pontos
-- updated_at só muda quando valor muda: é o critério de desempate do placar
-- (quem chegou primeiro ao valor fica na frente).

-- Mescla o progresso local com o do servidor e devolve o resultado.
-- 2048: o maior. Termo: o lado com mais vitórias (empate: maior streak);
-- wins e streak vêm sempre do mesmo lado.
create function public.sincronizar_progresso(p_termo_wins int, p_termo_streak int, p_2048 int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  l_wins int := coalesce(p_termo_wins, 0);
  l_streak int := coalesce(p_termo_streak, 0);
  l_2048 int := coalesce(p_2048, 0);
  s_wins int; s_streak int; s_2048 int;
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if l_wins < 0 or l_streak < 0 or l_2048 < 0 then
    raise exception 'valores negativos' using errcode = '22023';
  end if;
  if l_2048 > 4000000 then raise exception 'pontuacao invalida' using errcode = '22023'; end if;

  select valor, coalesce((extra->>'streak')::int, 0) into s_wins, s_streak
    from placar where user_id = v_uid and jogo = 'termo';
  select valor into s_2048 from placar where user_id = v_uid and jogo = 'game2048';
  s_wins := coalesce(s_wins, 0); s_streak := coalesce(s_streak, 0); s_2048 := coalesce(s_2048, 0);

  if l_wins > s_wins or (l_wins = s_wins and l_streak > s_streak) then
    s_wins := l_wins; s_streak := l_streak;
  end if;
  s_2048 := greatest(s_2048, l_2048);

  insert into placar as p (user_id, jogo, valor, extra)
  values (v_uid, 'termo', s_wins, jsonb_build_object('streak', s_streak)),
         (v_uid, 'game2048', s_2048, '{}')
  on conflict (user_id, jogo) do update
    set valor = excluded.valor,
        extra = excluded.extra,
        updated_at = case when p.valor <> excluded.valor then now() else p.updated_at end;

  return jsonb_build_object('termo', jsonb_build_object('wins', s_wins, 'streak', s_streak),
                            'game2048', s_2048);
end $$;

create function public.registrar_vitoria_termo()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  insert into placar as p (user_id, jogo, valor, extra)
  values (v_uid, 'termo', 1, '{"streak": 1}')
  on conflict (user_id, jogo) do update
    set valor = p.valor + 1,
        extra = jsonb_build_object('streak', coalesce((p.extra->>'streak')::int, 0) + 1),
        updated_at = now();
end $$;

create function public.registrar_derrota_termo()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  insert into placar as p (user_id, jogo, valor, extra)
  values (v_uid, 'termo', 0, '{"streak": 0}')
  on conflict (user_id, jogo) do update set extra = '{"streak": 0}';
end $$;

-- Guarda o maior; ignora <= 0; erro acima de 4.000.000.
create function public.registrar_pontos_2048(p_pontos int)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_pontos is null or p_pontos <= 0 then return; end if;
  if p_pontos > 4000000 then raise exception 'pontuacao invalida' using errcode = '22023'; end if;
  insert into placar as p (user_id, jogo, valor)
  values (v_uid, 'game2048', p_pontos)
  on conflict (user_id, jogo) do update
    set valor = excluded.valor, updated_at = now()
    where p.valor < excluded.valor;
end $$;

-- ---------------------------------------------------------------- RPC: leitura do placar
-- Só quem tem valor > 0 aparece; ordem: valor desc, updated_at asc.

create function public.ler_placar(p_jogo text, p_limite int)
returns table (posicao int, user_id uuid, username text, avatar text, valor int)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by pl.valor desc, pl.updated_at asc))::int,
         pl.user_id, pr.username, pr.avatar, pl.valor
    from placar pl
    join profiles pr on pr.user_id = pl.user_id
   where pl.jogo = p_jogo and pl.valor > 0
   order by pl.valor desc, pl.updated_at asc
   limit least(greatest(coalesce(p_limite, 50), 1), 100);
$$;

-- A linha da pessoa logada com a posição real (vazio se não jogou ou valor = 0).
create function public.minha_posicao(p_jogo text)
returns table (posicao int, user_id uuid, username text, avatar text, valor int)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  return query
    select r.posicao, r.user_id, r.username, r.avatar, r.valor
      from (select (row_number() over (order by pl.valor desc, pl.updated_at asc))::int as posicao,
                   pl.user_id, pr.username, pr.avatar, pl.valor
              from placar pl
              join profiles pr on pr.user_id = pl.user_id
             where pl.jogo = p_jogo and pl.valor > 0) r
     where r.user_id = v_uid;
end $$;

-- ---------------------------------------------------------------- grants das RPC

revoke execute on function
  public.criar_perfil(text, text),
  public.trocar_avatar(text),
  public.sincronizar_progresso(int, int, int),
  public.registrar_vitoria_termo(),
  public.registrar_derrota_termo(),
  public.registrar_pontos_2048(int),
  public.minha_posicao(text),
  public.ler_placar(text, int)
from public, anon, authenticated;

grant execute on function
  public.criar_perfil(text, text),
  public.trocar_avatar(text),
  public.sincronizar_progresso(int, int, int),
  public.registrar_vitoria_termo(),
  public.registrar_derrota_termo(),
  public.registrar_pontos_2048(int),
  public.minha_posicao(text)
to authenticated;

grant execute on function public.ler_placar(text, int) to anon, authenticated;

-- ---------------------------------------------------------------- Storage: avatars
-- Bucket público (leitura pela URL pública, sem policy de listagem geral).
-- Cada pessoa só grava/atualiza o próprio <uid>/avatar. A policy de select
-- restrita ao próprio arquivo é exigida pelo upsert do Storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_ler_proprio on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

create policy avatars_inserir_proprio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

create policy avatars_atualizar_proprio on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');
