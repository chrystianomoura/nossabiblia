import { Bookmark, TrendingUp, ShieldCheck } from 'lucide-react';

const BENEFITS = [
  {
    Icon: Bookmark,
    title: 'Marcações',
    description: 'Destaque versículos com cores e volte a eles quando quiser.',
  },
  {
    Icon: TrendingUp,
    title: 'Progresso diário',
    description: 'Acompanhe suas leituras em qualquer dispositivo.',
  },
  {
    Icon: ShieldCheck,
    title: 'Leitura sem distrações',
    description: 'Sem anúncios, sem interrupções, apenas o texto bíblico.',
  },
];

export default function BenefitsCards() {
  return (
    <ul className="benefits">
      {BENEFITS.map(({ Icon, title, description }) => (
        <li key={title} className="benefit">
          <span className="benefit-icon" aria-hidden="true">
            <Icon size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="benefit-title">{title}</h2>
            <p className="benefit-text">{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
