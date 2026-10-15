// O texto bíblico não muda: o navegador pode guardar por um dia (e usar o antigo por até uma semana enquanto confere de novo).
// Só respostas de sucesso levam este cabeçalho; erros nunca (um erro guardado persistiria).
export const IMMUTABLE = 'public, max-age=86400, stale-while-revalidate=604800';
