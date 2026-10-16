// Validação dos parâmetros das rotas. Cada função devolve { value } ou { error }, com a mensagem que o usuário vê. É aqui que valores
// de fora viram valores confiáveis: os serviços (server/services) só recebem o que já passou por estas funções, e é por isso que podem
// usar esses valores como chave de cache e como parâmetros de consulta sem olhar de novo.
const TRANSLATIONS = ['NAA', 'NVT'];

export function parseTranslation(raw) {
  const value = String(raw || 'NAA').toUpperCase();
  return TRANSLATIONS.includes(value) ? { value } : { error: "Tradução inválida. Escolha 'NAA' ou 'NVT'." };
}

export function parseTestament(raw) {
  if (!raw) return { value: null };
  const value = String(raw).toUpperCase();
  return ['AT', 'NT'].includes(value) ? { value } : { error: "Testamento inválido. Escolha 'AT' ou 'NT'." };
}

// Só dígitos: Number() aceitaria "1e1" (=10), " 5" e "0x10".
export function parseBookId(raw) {
  if (raw === undefined || raw === '') return { value: null };
  const value = /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 66 ? { value } : { error: 'Livro inválido. Use um número de 1 a 66.' };
}

// limit de 1 a 200 (padrão 50) e offset de 0 a 100.000 (padrão 0): passar disso não é erro, é só o teto.
export function parsePaging(query) {
  return {
    limit: Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200),
    offset: Math.min(Math.max(parseInt(query.offset, 10) || 0, 0), 100000),
  };
}

// ---- Marcações ----
export const MARK_COLORS = ['amarelo', 'verde', 'azul', 'rosa'];
export const COMMENT_MAX = 2000;

// Lista das marcações: `color` vazio = todas as cores; `order` é recent (padrão) ou canon (ordem dos livros da Bíblia).
export function parseMarkListQuery(query) {
  const color = query.color === undefined || query.color === '' ? null : String(query.color);
  if (color !== null && !MARK_COLORS.includes(color)) return { error: `Cor inválida. Use ${MARK_COLORS.join(', ')}.` };
  const order = query.order === undefined || query.order === '' ? 'recent' : String(query.order);
  if (!['recent', 'canon'].includes(order)) return { error: "Ordem inválida. Use 'recent' ou 'canon'." };
  const translation = parseTranslation(query.translation);
  if (translation.error) return { error: translation.error };
  const paging = parsePaging({ limit: query.limit ?? 20, offset: query.offset });
  return { value: { color, order, translation: translation.value, ...paging } };
}

// Inteiro positivo só com dígitos ("1e1", "0x10", " 5" e "5.0" não valem), de 1 até `max`.
export function parsePositiveInt(raw, max, label) {
  const value = /^\d{1,6}$/.test(String(raw)) ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= max ? { value } : { error: `${label} inválido.` };
}

// Corpo do PUT /bookmarks: cor obrigatória; comentário opcional (ausente = mantém o que já existe; null ou vazio = apaga); pasta ainda
// não existe (qualquer valor diferente de null é recusado em vez de ser ignorado em silêncio).
export function parseBookmarkBody(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (!MARK_COLORS.includes(b.color)) return { error: `Cor inválida. Escolha entre: ${MARK_COLORS.join(', ')}.` };
  const translation = parseTranslation(b.translation);
  if (translation.error) return { error: translation.error };
  let comment; // undefined = não mexer
  if (b.comment !== undefined) {
    if (b.comment === null || b.comment === '') comment = null;
    else if (typeof b.comment !== 'string') return { error: 'Comentário inválido.' };
    else if (b.comment.length > COMMENT_MAX) return { error: `O comentário pode ter no máximo ${COMMENT_MAX} caracteres.` };
    // eslint-disable-next-line no-control-regex
    else if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(b.comment)) return { error: 'O comentário tem caracteres que não são aceitos.' };
    else comment = b.comment;
  }
  if (b.folder_id !== undefined && b.folder_id !== null) return { error: 'Pastas ainda não estão disponíveis.' };
  return { value: { color: b.color, translation: translation.value, comment } };
}
