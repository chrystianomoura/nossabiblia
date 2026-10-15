import { ArrowRight } from 'lucide-react';
import Navbar from './Navbar';
import OpenBibleCard from './OpenBibleCard';
import BenefitsCards from './BenefitsCards';
import Link from './Link';
import { readPath } from '../lib/router';

export default function Home({
  theme,
  onToggleTheme,
  onOpenSearch,
  previewTranslation,
  onPreviewTranslationChange,
}) {
  return (
    <div className="home">
      <Navbar
        onOpenSearch={onOpenSearch}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main id="main" className="home-main">
        <div className="home-grid">
          <section className="home-col home-col--left" aria-label="Apresentação">
            <div className="home-col-body">
              <div>
                <h1 className="hero-title">Lâmpada para os meus pés é a tua palavra.</h1>
                <p className="hero-subtitle">
                  Com a Nossa Bíblia, você tem uma experiência de leitura limpa, acessível e feita para
                  fortalecer o seu momento com Deus todos os dias.
                </p>
              </div>

              <div className="home-benefits">
                <BenefitsCards />
              </div>
            </div>

            <div className="home-cta">
              <Link to="/cadastrar" className="btn-primary">
                <span>Criar Conta Gratuita</span>
                <span className="btn-arrow" aria-hidden="true">
                  <ArrowRight size={16} />
                </span>
              </Link>
            </div>
          </section>

          <section className="home-col home-col--right" aria-label="Amostra de leitura">
            <OpenBibleCard
              translation={previewTranslation}
              onTranslationChange={onPreviewTranslationChange}
            />

            <div className="home-cta">
              <Link to={readPath('genesis', 1, previewTranslation)} className="btn-primary">
                <span>Começar a Ler Agora</span>
                <span className="btn-arrow" aria-hidden="true">
                  <ArrowRight size={16} />
                </span>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
