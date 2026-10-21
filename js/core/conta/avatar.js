/**
 * Avatar da conta, guardado em profiles.avatar como texto:
 *   'icone:<emoji>'  — um dos ICONES
 *   'foto:<versao>'  — foto em avatars/<user_id>/avatar; a versão (Date.now()
 *                      do envio) serve para furar o cache da URL pública.
 * O banco aceita só '^(icone:.{1,8}|foto:[0-9]{1,16})$'; aqui a leitura é
 * ainda mais estrita e qualquer coisa estranha vira o primeiro ícone.
 */

export const ICONES = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐲', '🐱'];

const LADO_FOTO = 128;
const MAX_ENTRADA = 5_000_000;
const MAX_SAIDA = 204800;
const PADRAO_FOTO = /^foto:([0-9]{1,16})$/;

export function codificarIcone(emoji) {
  return `icone:${emoji}`;
}

export function codificarFoto(versao = Date.now()) {
  return `foto:${versao}`;
}

export function decodificarAvatar(valor) {
  if (typeof valor === 'string') {
    if (valor.startsWith('icone:')) {
      const emoji = valor.slice(6);
      if (emoji.length <= 8 && ICONES.includes(emoji)) return { tipo: 'icone', emoji };
    }
    const foto = PADRAO_FOTO.exec(valor);
    if (foto) {
      const versao = Number(foto[1]);
      if (Number.isSafeInteger(versao)) return { tipo: 'foto', versao };
    }
  }
  return { tipo: 'icone', emoji: ICONES[0] };
}

/**
 * Recorta a imagem no centro (quadrado), reduz para 128×128 e comprime em
 * WebP (ou JPEG se o navegador não gerar WebP). Rejeita com Error em pt-BR.
 */
export async function redimensionarFoto(arquivo) {
  if (!arquivo || typeof arquivo.type !== 'string' || !arquivo.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem.');
  }
  if (!(arquivo.size <= MAX_ENTRADA)) {
    throw new Error('A imagem passa de 5 MB. Escolha uma menor.');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error('Não foi possível ler essa imagem.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = LADO_FOTO;
  canvas.height = LADO_FOTO;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('Não foi possível processar a imagem neste navegador.');
  }
  const lado = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lado) / 2;
  const sy = (bitmap.height - lado) / 2;
  // Fundo branco: sem ele, PNG/GIF transparente fica preto no caminho JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
  ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  bitmap.close?.();

  let blob = await paraBlob(canvas, 'image/webp', 0.85);
  // Navegador sem encoder WebP devolve PNG (ou null) em vez de recusar.
  if (!blob || blob.type !== 'image/webp') blob = await paraBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error('Não foi possível converter a imagem.');
  if (blob.size > MAX_SAIDA) throw new Error('A imagem ficou grande demais. Tente outra.');
  return blob;
}

function paraBlob(canvas, tipo, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}
