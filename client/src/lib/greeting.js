// Saudação pela hora do aparelho. Não há norma oficial (nem na ABL nem no Manual de Redação da Presidência: é costume), e a regra mais usada é:
// "bom dia" do amanhecer até o meio-dia, "boa tarde" do meio-dia até o anoitecer e "boa noite" do anoitecer em diante. O anoitecer no Brasil
// fica perto das 18 h o ano todo, então os cortes são 12 h e 18 h; a madrugada (antes das 5 h) segue "boa noite", como se diz a quem ainda não dormiu.
export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
