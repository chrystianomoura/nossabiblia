# DNS de `nossabiblia.party` (zona na Cloudflare)

Tudo aqui é público (é DNS). Para refazer a zona, crie os registros abaixo; o proxy laranja só nos dois `AAAA`.
Estado de 15/10/2026.

| Tipo | Nome | Conteúdo | Para quê |
|---|---|---|---|
| `AAAA` (proxy) | `nossabiblia.party` | `100::` | Endereço de mentira: o tráfego é do Worker do site (ele responde antes) |
| `AAAA` (proxy) | `www` | `100::` | Idem; uma regra de redirecionamento manda `www` para o domínio principal (301) |
| `CNAME` | `api` | `nossabiblia-api.onrender.com` | A API na Render, **só DNS** (cinza): a Render precisa ver o endereço direto para emitir o certificado |
| `MX` | `nossabiblia.party` | `89 route1`, `2 route2`, `94 route3` `.mx.cloudflare.net` | E-mail de entrada (Email Routing: `contato@` vai para o Gmail da conta) |
| `TXT` | `nossabiblia.party` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | SPF do e-mail de entrada |
| `TXT` | `cf2024-1._domainkey` | `v=DKIM1; h=sha256; k=rsa; p=…` | DKIM do Email Routing (a Cloudflare gera) |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; pct=100; adkim=r; aspf=r; rua=mailto:contato@nossabiblia.party` | DMARC em quarentena (antes `p=none`) |
| `CNAME` | `send` | `send.forge.rmta.net` | Resend: retorno (return-path); só DNS |
| `CNAME` | `rsend` | `rsend-sae1.forge.rmta.net` | Resend: envio; só DNS |
| `TXT` | `resend._domainkey` | `p=MIGfMA0GCS…` | Resend: DKIM (o valor sai do painel do Resend ao adicionar o domínio) |
| `CAA` | `nossabiblia.party` | `0 issue` para `digicert.com`, `letsencrypt.org`, `pki.goog`, `ssl.com`, `sectigo.com`; `0 iodef "mailto:contato@nossabiblia.party"` | Só estas autoridades podem emitir certificado (as da Cloudflare e da Render) |

A Cloudflare ainda acrescenta sozinha, na borda, os CAA das autoridades dela (`comodoca.com` e os `issuewild`).

## Configurações da zona
- SSL/TLS **estrito**, **sempre HTTPS**, TLS mínimo **1.2**, TLS 1.3 ligado.
- **DNSSEC: ativo.** A zona está assinada e o DS está publicado no registro `.party` (conferir com `dig DS nossabiblia.party`).
- **HSTS** do site: 6 meses, sem `includeSubDomains` nem `preload` (`client/scripts/write-headers.mjs`).
- **Web Analytics** da Cloudflare (medida de visitas sem cookie) para `nossabiblia.party`, com o script no `index.html` do site compilado; a política de conteúdo libera `static.cloudflareinsights.com` e `cloudflareinsights.com`.
