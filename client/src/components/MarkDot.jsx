// Bolinha da cor da marcação, só para mostrar (na busca): não é botão, tocar no cartão continua abrindo o leitor.
export default function MarkDot({ color }) {
  return <span className="mark-badge" data-mark={color} role="img" aria-label={`Marcado de ${color}`} />;
}
