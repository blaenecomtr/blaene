(function () {
  function injectStyles() {
    if (document.getElementById('blaene-home-banners-style')) return;
    const style = document.createElement('style');
    style.id = 'blaene-home-banners-style';
    style.textContent = `
      .blaene-home-banners {
        max-width: 1400px;
        margin: 1.25rem auto 0;
        padding: 0 1.2rem;
      }
      .blaene-home-banners-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
        margin-bottom: 0.75rem;
      }
      .blaene-home-banners-head h3 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #1f2937;
      }
      .blaene-home-banners-track {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(260px, 1fr);
        gap: 0.8rem;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        padding-bottom: 0.25rem;
      }
      .blaene-home-banners-track::-webkit-scrollbar {
        height: 7px;
      }
      .blaene-home-banners-track::-webkit-scrollbar-thumb {
        background: rgba(15, 23, 42, 0.3);
        border-radius: 999px;
      }
      .blaene-home-banner-card {
        position: relative;
        min-height: 170px;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(15, 23, 42, 0.1);
        scroll-snap-align: start;
        background: #0f172a;
      }
      .blaene-home-banner-card img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .blaene-home-banner-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(2, 6, 23, 0.08) 0%, rgba(2, 6, 23, 0.78) 100%);
      }
      .blaene-home-banner-content {
        position: relative;
        z-index: 1;
        color: #fff;
        padding: 0.9rem;
        min-height: 170px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .blaene-home-banner-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
      }
      .blaene-home-banner-desc {
        margin: 0.35rem 0 0;
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.88);
        line-height: 1.35;
      }
      .blaene-home-banner-link {
        margin-top: 0.6rem;
        width: fit-content;
        text-decoration: none;
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.55);
        border-radius: 999px;
        padding: 0.26rem 0.62rem;
        font-size: 0.68rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .blaene-home-banner-link:hover {
        background: rgba(255, 255, 255, 0.18);
      }
      @media (max-width: 768px) {
        .blaene-home-banners {
          padding: 0 0.85rem;
        }
        .blaene-home-banners-track {
          grid-auto-columns: minmax(230px, 78vw);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render(banners) {
    const hero = document.querySelector('.hero');
    if (!hero || !Array.isArray(banners) || !banners.length) return;
    if (document.getElementById('blaene-home-banners')) return;

    injectStyles();

    const section = document.createElement('section');
    section.id = 'blaene-home-banners';
    section.className = 'blaene-home-banners';

    const cards = banners
      .map((item) => {
        const title = escapeHtml(item.title || '');
        const desc = escapeHtml(item.description || '');
        const image = escapeHtml(item.image_url || '');
        const link = String(item.link_url || '').trim();
        const href = link || '#';
        const target = link ? ' target="_self"' : '';
        return `
          <article class="blaene-home-banner-card">
            <img src="${image}" alt="${title || 'Blaene banner'}" loading="lazy" decoding="async" />
            <div class="blaene-home-banner-overlay" aria-hidden="true"></div>
            <div class="blaene-home-banner-content">
              ${title ? `<h4 class="blaene-home-banner-title">${title}</h4>` : ''}
              ${desc ? `<p class="blaene-home-banner-desc">${desc}</p>` : ''}
              <a class="blaene-home-banner-link"${target} href="${escapeHtml(href)}">Incele</a>
            </div>
          </article>
        `;
      })
      .join('');

    section.innerHTML = `
      <div class="blaene-home-banners-head">
        <h3>Slider / Banner</h3>
      </div>
      <div class="blaene-home-banners-track">${cards}</div>
    `;

    hero.insertAdjacentElement('afterend', section);
  }

  async function loadBanners() {
    try {
      const response = await fetch('/api/public/site-content?key=homepage_banners', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json().catch(() => null);
      const data = payload && typeof payload === 'object' && payload.data ? payload.data : payload;
      const banners = Array.isArray(data?.banners) ? data.banners : [];
      if (!banners.length) return;
      render(banners);
    } catch {
      // no-op
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void loadBanners();
    });
  } else {
    void loadBanners();
  }
})();

