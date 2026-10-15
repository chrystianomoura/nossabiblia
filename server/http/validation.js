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
