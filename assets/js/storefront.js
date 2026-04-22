(function () {
  const SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_uKwxlDCAxSOzus7W96aF9w_m2iDE2QA';

  const CATEGORY_LABEL = {
    bath: 'BANYO',
    forge: 'ATES CUKURU',
    industrial: 'MODULER RAF',
  };

  const CATEGORY_META = {
    bath: { page: 'bath.html', name: 'BANYO Koleksiyonu', label: 'BANYO' },
    forge: { page: 'forge.html', name: 'KAMP Koleksiyonu', label: 'ATES CUKURU' },
    industrial: { page: 'industrial.html', name: 'Sanayi Koleksiyonu', label: 'MODULER RAF & TAKIM ARABASI' },
  };

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function waLink(text) {
    return `https://wa.me/905320540019?text=${encodeURIComponent(String(text || ''))}`;
  }

  function isConfigured() {
    return (
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_URL !== 'https://YOUR_PROJECT_REF.supabase.co' &&
      SUPABASE_ANON_KEY !== 'YOUR_PUBLIC_ANON_KEY'
    );
  }

  function getSupabase() {
    if (!isConfigured() || !window.supabase || typeof window.supabase.createClient !== 'function') {
      return null;
    }
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function injectStorefrontStyles() {
    if (document.getElementById('blaene-storefront-styles')) return;
    const style = document.createElement('style');
    style.id = 'blaene-storefront-styles';
    style.textContent = `
      .blaene-price-line {
        margin-top: 0.45rem;
        font-size: 0.86rem;
        font-weight: 600;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
      }
      .blaene-price-current {
        font-size: 1.02em;
        font-weight: 800;
        color: #dc2626;
      }
      .blaene-price-old {
        text-decoration: line-through;
        color: #6b7280;
      }
      .blaene-discount-badge {
        background: #ef4444;
        color: #fff;
        border-radius: 999px;
        padding: 0.1rem 0.48rem;
        font-size: 0.68rem;
        font-weight: 700;
      }
      .blaene-stock-line {
        margin-top: 0.35rem;
        font-size: 0.68rem;
        color: #64748b;
      }
      .blaene-add-cart {
        margin-top: 0.5rem;
        width: 100%;
        border: 1px solid #E07020;
        background: #E07020;
        color: #fff;
        border-radius: 14px;
        padding: 0.95rem 1rem;
        font-size: 0.75rem;
        font-weight: 700;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.03em;
        text-transform: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transform: translateZ(0);
      }
      .blaene-add-cart:hover:not([disabled]) {
        border-color: #C05810;
        background: #C05810;
      }
      .blaene-add-cart:active:not([disabled]) {
        transform: scale(0.985);
      }
      .blaene-add-cart.bump {
        animation: blaene-cart-bump 240ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }
      @keyframes blaene-cart-bump {
        0% { transform: scale(1); }
        45% { transform: scale(1.06); }
        100% { transform: scale(1); }
      }
      .blaene-add-cart[disabled] {
        cursor: not-allowed;
        border-color: #d1d5db;
        background: #f3f4f6;
        color: #6b7280;
      }
      .blaene-add-cart.secondary {
        width: 100%;
        margin-top: 0;
        padding: 0.95rem 1rem;
        font-size: 0.75rem;
        letter-spacing: 0.03em;
        text-transform: none;
      }
      .blaene-product-price {
        margin: 0.4rem 0 0.25rem;
        font-size: 1rem;
        font-weight: 600;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 0.55rem;
        flex-wrap: wrap;
      }
      .blaene-product-stock {
        margin: 0.25rem 0 0.35rem;
        font-size: 0.82rem;
        color: #334155;
      }
      .blaene-product-head-commerce {
        margin-top: -0.8rem;
        margin-bottom: 1rem;
      }
      .blaene-product-head-commerce .blaene-product-price {
        margin-top: 0;
        margin-bottom: 0.2rem;
      }
      .blaene-product-head-commerce .blaene-product-stock {
        margin-top: 0;
      }
      .blaene-product-cart-slot {
        margin: 0 0 1.35rem;
      }
      .blaene-product-cart-slot .blaene-add-cart.secondary {
        width: 100%;
        border-radius: 14px;
        letter-spacing: 0.03em;
        text-transform: none;
      }
    `;
    document.head.appendChild(style);
  }

  function toPublicProduct(row) {
    const variantsRaw = Array.isArray(row.variants)
      ? row.variants
      : (typeof row.variants === 'string' && row.variants
          ? safelyParseArray(row.variants)
          : []);
    const variants = variantsRaw
      .map((variant) => {
        if (!variant || typeof variant !== 'object') return null;
        const images = Array.isArray(variant.images)
          ? variant.images.filter(Boolean)
          : (typeof variant.images === 'string' && variant.images
              ? safelyParseArray(variant.images).filter(Boolean)
              : []);
        return {
          ...variant,
          label: String(variant.label || '').trim(),
          color: String(variant.color || '').trim(),
          images,
        };
      })
      .filter(Boolean);

    const colorGroups = {};
    variants.forEach((variant) => {
      const colorKey = String(variant?.color || variant?.label || '').trim();
      const variantImages = Array.isArray(variant?.images) ? variant.images.filter(Boolean) : [];
      if (colorKey && variantImages.length) {
        colorGroups[colorKey] = variantImages;
      }
    });

    const fallbackFromVariant = Object.values(colorGroups).flat().filter(Boolean);
    const baseImages = Array.isArray(row.images)
      ? row.images.filter(Boolean)
      : (typeof row.images === 'string' && row.images
          ? safelyParseArray(row.images).filter(Boolean)
          : []);
    const images = baseImages.length
      ? baseImages
      : (fallbackFromVariant.length ? fallbackFromVariant : ['logo/sitelogo.png']);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      material: row.material || '',
      thickness: row.thickness || '-',
      dims: row.dims || '-',
      description: row.description || '',
      price: row.price === null || row.price === undefined ? null : Number(row.price),
      price_visible: toBoolean(row.price_visible, false),
      images,
      variants,
      colorGroups,
      active: toBoolean(row.active, true),
      stock_quantity: Number.isFinite(Number(row.stock_quantity)) ? Math.max(0, Number(row.stock_quantity)) : 0,
      display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : 0,
      discount_percent: Number.isFinite(Number(row.discount_percent)) ? Number(row.discount_percent) : null,
      discount_promo_id: row.discount_promo_id ? String(row.discount_promo_id) : null,
    };
  }

  function safelyParseArray(value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return fallback;
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
    }
    if (value === null || value === undefined) return fallback;
    return Boolean(value);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function animateAddCartButton(button) {
    if (!button) return;
    button.classList.remove('bump');
    void button.offsetWidth;
    button.classList.add('bump');
    window.setTimeout(function () {
      button.classList.remove('bump');
    }, 260);
  }

  function normalizeDiscountPercent(value) {
    const parsed = Number(String(value ?? '').replace(',', '.').trim());
    if (!Number.isFinite(parsed)) return null;
    if (parsed <= 0) return null;
    return Math.min(95, Math.max(0, Math.round(parsed * 100) / 100));
  }

  function resolveSalePrice(product) {
    const basePrice = Number(product?.price || 0);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return { price: null, originalPrice: null, discountPercent: null };
    }
    const discountPercent = normalizeDiscountPercent(product?.discount_percent);
    if (!discountPercent) {
      return { price: basePrice, originalPrice: null, discountPercent: null };
    }
    const discounted = Math.max(0, Math.round((basePrice * (1 - discountPercent / 100)) * 100) / 100);
    return {
      price: discounted,
      originalPrice: basePrice,
      discountPercent,
    };
  }

  function extractPromotionCodeKey(row) {
    const scope = String(row?.target_scope || '').trim().toLowerCase();
    const targetValue = String(row?.target_value || '').trim().toUpperCase();
    const codeValue = String(row?.code || '').trim().toUpperCase();
    if (scope === 'product_code' && targetValue) return targetValue;
    if (codeValue.startsWith('PRD-')) return codeValue.replace(/^PRD-/, '');
    return '';
  }

  async function loadPromotionDiscountMap(client) {
    if (!client) return {};
    const { data, error } = await client
      .from('promotions')
      .select('id,code,target_scope,target_value,discount_type,discount_value,is_active')
      .eq('is_active', true)
      .eq('discount_type', 'percent')
      .gt('discount_value', 0)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error || !Array.isArray(data)) return {};

    const map = {};
    data.forEach((row) => {
      const key = extractPromotionCodeKey(row);
      const percent = normalizeDiscountPercent(row?.discount_value);
      if (!key || !percent || map[key]) return;
      map[key] = {
        id: String(row?.id || ''),
        percent,
      };
    });
    return map;
  }

  function getActiveSort() {
    return document.querySelector('.sort-tab.active')?.dataset?.sort || 'new';
  }

  function sortProducts(list) {
    const sorted = [...list];
    const sort = getActiveSort();
    if (sort === 'az') {
      sorted.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    } else if (sort === 'thick') {
      sorted.sort((a, b) => parseFloat(String(b.thickness)) - parseFloat(String(a.thickness)));
    } else {
      sorted.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    }
    return sorted;
  }

  function injectCardCommerce(products) {
    const cart = window.BlaeneCart;
    const cards = document.querySelectorAll('#product-grid .product-card');
    if (!cards.length) return;

    const byCode = new Map(products.map((product) => [String(product.code), product]));

    cards.forEach((card) => {
      const code = card.querySelector('.card-code')?.textContent?.trim();
      if (!code) return;
      const product = byCode.get(code);
      if (!product) return;

      const info = card.querySelector('.card-info');
      if (!info) return;

      info.querySelector('.blaene-price-line')?.remove();
      info.querySelector('.blaene-stock-line')?.remove();
      info.querySelector('.blaene-add-cart')?.remove();

      const stock = Math.max(0, Number(product.stock_quantity || 0));
      const colorKeys = Object.keys(product.colorGroups || {});
      const defaultColor = colorKeys[0] || '';
      const defaultImages = defaultColor && Array.isArray(product.colorGroups?.[defaultColor])
        ? product.colorGroups[defaultColor]
        : [];
      const cartImage = defaultImages[0] || product.images?.[0] || 'logo/sitelogo.png';
      const canSell = stock > 0 && product.price_visible && Number.isFinite(product.price) && product.price > 0;
      const sale = canSell ? resolveSalePrice(product) : null;

      if (canSell && sale) {
        const priceEl = document.createElement('p');
        priceEl.className = 'blaene-price-line';
        if (sale.originalPrice && sale.discountPercent) {
          priceEl.innerHTML = `
            <span class="blaene-price-current">${escapeHtml(formatPrice(sale.price))}</span>
            <span class="blaene-price-old">${escapeHtml(formatPrice(sale.originalPrice))}</span>
            <span class="blaene-discount-badge">%${escapeHtml(sale.discountPercent)} indirim</span>
          `;
        } else {
          priceEl.textContent = formatPrice(sale.price);
        }
        info.appendChild(priceEl);
      }

      if (stock <= 0) {
        const stockEl = document.createElement('p');
        stockEl.className = 'blaene-stock-line';
        stockEl.textContent = 'Yakında gelecek';
        info.appendChild(stockEl);
      }

      if (canSell || stock <= 0) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'blaene-add-cart';
        addBtn.textContent = canSell ? 'Sepete Ekle' : 'Yakında gelecek';
        addBtn.disabled = !canSell;
        addBtn.dataset.track = 'add_to_cart';
        addBtn.dataset.trackProductCode = String(product.code || '').trim().toUpperCase();
        addBtn.dataset.trackProductName = String(product.name || '').trim();
        addBtn.dataset.trackLabel = `Sepete ekle: ${String(product.code || '').trim().toUpperCase()}`;
        addBtn.dataset.productCode = product.code;
        addBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!cart || !canSell || !sale) return;
          animateAddCartButton(addBtn);
          cart.addItem({
            code: product.code,
            name: product.name,
            price: sale.price,
            image: cartImage,
            category: product.category,
            color: defaultColor || '',
            stock: stock,
          }, 1);
        });
        info.appendChild(addBtn);
      }
    });
  }

  function watchProductGrid(products) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    injectCardCommerce(products);

    const observer = new MutationObserver(function () {
      injectCardCommerce(products);
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  function guessCategoryFromPath() {
    const path = location.pathname.toLowerCase();
    if (path.endsWith('/bath.html') || path.endsWith('bath.html')) return 'bath';
    if (path.endsWith('/forge.html') || path.endsWith('forge.html')) return 'forge';
    if (path.endsWith('/industrial.html') || path.endsWith('industrial.html')) return 'industrial';
    return null;
  }

  function resolveCategoryMeta(product) {
    const key = String(product?.category || '').toLowerCase();
    if (CATEGORY_META[key]) return { key, ...CATEGORY_META[key] };

    const code = String(product?.code || '').toUpperCase();
    if (code.startsWith('FRG')) return { key: 'forge', ...CATEGORY_META.forge };
    if (code.startsWith('MDL')) return { key: 'industrial', ...CATEGORY_META.industrial };
    return { key: 'bath', ...CATEGORY_META.bath };
  }

  async function enrichProductWithVariants(client, product) {
    if (!client || !product?.id) return product;
    if (Object.keys(product.colorGroups || {}).length) return product;

    const { data, error } = await client
      .from('product_variants')
      .select('label,color,images,active,display_order')
      .eq('product_id', product.id)
      .eq('active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error || !Array.isArray(data) || !data.length) return product;

    const enriched = toPublicProduct({
      ...product,
      variants: data,
    });
    return Object.keys(enriched.colorGroups || {}).length ? enriched : product;
  }

  async function syncCategoryPage(client, category) {
    if (!client || !category) return;

    const { data, error } = await client
      .from('products')
      .select('id, code, name, category, material, thickness, dims, description, price, price_visible, images, variants, active, stock_quantity, display_order')
      .eq('category', category)
      .eq('active', true)
      .eq('archived', false)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[blaene-storefront] syncCategoryPage error:', error);
      return;
    }
    if (!Array.isArray(data)) {
      console.warn('[blaene-storefront] syncCategoryPage: unexpected response shape');
      return;
    }

    const products = data.map(toPublicProduct);
    const promoMap = await loadPromotionDiscountMap(client);
    products.forEach((product) => {
      const key = String(product.code || '').trim().toUpperCase();
      const entry = promoMap[key];
      if (!entry) return;
      product.discount_percent = entry.percent;
      product.discount_promo_id = entry.id;
    });
    window.BLAENE_REMOTE_PRODUCTS = products;

    if (typeof window.renderProducts === 'function') {
      window.renderProducts(sortProducts(products));

      document.querySelectorAll('.sort-tab').forEach((tab) => {
        tab.addEventListener('click', function () {
          setTimeout(function () {
            const current = Array.isArray(window.BLAENE_REMOTE_PRODUCTS)
              ? window.BLAENE_REMOTE_PRODUCTS
              : products;
            window.renderProducts(sortProducts(current));
            injectCardCommerce(current);
          }, 0);
        });
      });
    }

    watchProductGrid(products);
  }

  function renderSimpleProductView(product) {
    const main = document.getElementById('main-content');
    if (!main) return;

    const categoryMeta = resolveCategoryMeta(product);
    const colorGroups = product.colorGroups || {};
    const colorKeys = Object.keys(colorGroups);
    const images = Array.isArray(product.images) && product.images.length ? product.images : ['logo/sitelogo.png'];
    const detailName = escapeHtml(product.name || '-');
    const detailCode = escapeHtml(product.code || '-');
    const passBadgeHtml = categoryMeta.key === 'bath'
      ? '<img class="gallery-pass-badge" src="logo/PAS.png" alt="PAS" loading="lazy" decoding="async" style="position:absolute;top:10px;right:10px;width:88px;height:auto;z-index:4;pointer-events:none;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));">'
      : '';

    const teklifMsg = `Merhaba, ${product.code} urunu icin fiyat teklifi almak istiyorum.`;
    const bilgiMsg = `Merhaba, ${product.code} urunu hakkinda bilgi almak istiyorum.`;
    const dxfMsg = `Merhaba, ${product.code} urunu icin DXF teknik cizim dosyasini talep ediyorum.`;
    const stepMsg = `Merhaba, ${product.code} urununun STEP dosyasini talep ediyorum.`;

    document.title = `Blaene ${String(product.code || '').trim()} - ${String(product.name || '').trim()}`;

    const bcCode = document.getElementById('bc-code');
    if (bcCode) bcCode.textContent = String(product.code || '-');
    const bcCat = document.getElementById('bc-cat');
    if (bcCat) {
      bcCat.textContent = categoryMeta.label;
      bcCat.setAttribute('href', categoryMeta.page);
    }

    ['nav-bath', 'nav-forge', 'nav-industrial'].forEach((id) => {
      document.getElementById(id)?.classList.remove('active');
    });
    const navId = categoryMeta.key === 'forge'
      ? 'nav-forge'
      : (categoryMeta.key === 'industrial' ? 'nav-industrial' : 'nav-bath');
    document.getElementById(navId)?.classList.add('active');

    document.getElementById('header-teklif')?.setAttribute('href', waLink(teklifMsg));
    document.getElementById('wa-float-link')?.setAttribute('href', waLink(bilgiMsg));

    const badges = categoryMeta.key === 'forge'
      ? ['ST37 Celik', 'Lazer Kesim', 'Ozel Uretim']
      : (categoryMeta.key === 'industrial'
          ? ['1.5mm Sac', 'Tekerlekli', 'Lazer Kesim']
          : ['304 Kalite', 'Lazer Kesim', 'Muhendislik Onayli']);

    const renderThumbsHtml = (list) =>
      list
        .map((src, index) => `
          <div class="gallery-thumb${index === 0 ? ' active' : ''}" data-idx="${index}">
            <img src="${escapeHtml(src)}" alt="${detailCode} gorsel ${index + 1}" loading="lazy">
          </div>`)
        .join('');

    const variantButtonsHtml = colorKeys.length
      ? colorKeys
          .map((color, index) => `<button class="variant-btn${index === 0 ? ' active' : ''}" data-color="${escapeHtml(color)}">${escapeHtml(color)}</button>`)
          .join('')
      : (categoryMeta.key === 'bath'
          ? `<button class="variant-btn active" data-variant="krom">Krom</button><button class="variant-btn" data-variant="siyah">Siyah</button>`
          : (categoryMeta.key === 'forge'
              ? `<button class="variant-btn active" data-variant="siyah">Siyah</button>`
              : '<button class="variant-btn active">Standart</button>'));

    main.innerHTML = `
      <div class="product-layout">
        <div class="img-col">
          <div class="gallery-main" id="gallery-main-area">
            ${passBadgeHtml}
            <img class="gallery-main-img" id="gallery-img" src="${escapeHtml(images[0])}" alt="${detailCode} - ${detailName}" loading="eager">
            <button class="gallery-arrow gallery-arrow-prev" id="gallery-prev" aria-label="Önceki gorsel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button class="gallery-arrow gallery-arrow-next" id="gallery-next" aria-label="Sonraki gorsel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button class="zoom-btn" aria-label="Gorseli buyut">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
          </div>
          <div class="gallery-thumbs" id="gallery-thumbs" ${images.length <= 1 ? 'style="display:none"' : ''}>${renderThumbsHtml(images)}</div>
        </div>
        <div class="info-col">
          <p class="info-eyebrow">${escapeHtml(categoryMeta.name)}</p>
          <h1 class="info-code">${detailCode}</h1>
          <h2 class="info-name">${detailName}</h2>
          <div id="blaene-product-head-commerce" class="blaene-product-head-commerce"></div>
          <div class="info-divider"></div>

          <p class="sub-label">${colorKeys.length ? 'Renk' : 'Yuzey'}</p>
          <div class="variant-btns">${variantButtonsHtml}</div>
          <div id="blaene-product-cart-slot" class="blaene-product-cart-slot"></div>

          <table class="specs-table" aria-label="Urun ozellikleri">
            <tbody>
              <tr><td>Urun</td><td>${detailName}</td></tr>
              <tr><td>Malzeme</td><td>${escapeHtml(product.material || '-')}</td></tr>
              <tr><td>Kalinlik</td><td>${escapeHtml(product.thickness || '-')}</td></tr>
              <tr><td>Olculer</td><td>${escapeHtml(product.dims || '-')}</td></tr>
              <tr><td>Kategori</td><td>${escapeHtml(categoryMeta.label)}</td></tr>
              <tr><td>Standart</td><td>DFMA Uyumlu</td></tr>
            </tbody>
          </table>

          <div class="tech-section">
            <p class="sub-label">Teknik Dosyalar</p>
            <div class="tech-btns">
              <a href="${waLink(dxfMsg)}" class="tech-btn" target="_blank" rel="noopener noreferrer">DXF Talep Et</a>
              <a href="${waLink(stepMsg)}" class="tech-btn" target="_blank" rel="noopener noreferrer">STEP Talep Et</a>
            </div>
          </div>

          <div class="cta-section">
            <a href="${waLink(teklifMsg)}" class="cta-primary" target="_blank" rel="noopener noreferrer">Teklif Al</a>
            <a href="${waLink(bilgiMsg)}" class="cta-secondary" target="_blank" rel="noopener noreferrer">Bilgi Al</a>
          </div>

          <div class="badge-row">
            ${badges.map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="back-section">
        <a href="${escapeHtml(categoryMeta.page)}" class="back-to-collection">Koleksiyona Don</a>
      </div>
    `;

    let currentImgIdx = 0;

    function getCurrentImages() {
      const activeColor = document.querySelector('.variant-btn.active[data-color]')?.dataset.color;
      if (activeColor && Array.isArray(colorGroups[activeColor]) && colorGroups[activeColor].length) {
        return colorGroups[activeColor];
      }
      return images;
    }

    function setMainImg(src) {
      const img = document.getElementById('gallery-img');
      if (!img) return;
      img.src = src;
    }

    function updateArrows(total) {
      const prev = document.getElementById('gallery-prev');
      const next = document.getElementById('gallery-next');
      if (!prev || !next) return;
      prev.disabled = false;
      next.disabled = false;
      prev.style.display = total <= 1 ? 'none' : '';
      next.style.display = total <= 1 ? 'none' : '';
    }

    function buildThumbs(list) {
      const thumbsEl = document.getElementById('gallery-thumbs');
      if (!thumbsEl) return;
      if (list.length <= 1) {
        thumbsEl.style.display = 'none';
        thumbsEl.innerHTML = '';
        return;
      }
      thumbsEl.style.display = '';
      thumbsEl.innerHTML = renderThumbsHtml(list);
    }

    function goToImg(idx) {
      const list = getCurrentImages();
      if (!list.length) return;
      currentImgIdx = ((idx % list.length) + list.length) % list.length;
      setMainImg(list[currentImgIdx]);
      document.querySelectorAll('.gallery-thumb').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === currentImgIdx);
      });
      updateArrows(list.length);
    }

    document.getElementById('gallery-main-area')?.addEventListener('click', function (event) {
      if (event.target.closest('#gallery-prev')) {
        goToImg(currentImgIdx - 1);
        return;
      }
      if (event.target.closest('#gallery-next')) {
        goToImg(currentImgIdx + 1);
        return;
      }
    });

    document.getElementById('gallery-thumbs')?.addEventListener('click', function (event) {
      const thumb = event.target.closest('.gallery-thumb');
      if (!thumb) return;
      const idx = Number.parseInt(String(thumb.dataset.idx || '0'), 10);
      if (!Number.isFinite(idx)) return;
      goToImg(idx);
    });

    document.querySelector('.variant-btns')?.addEventListener('click', function (event) {
      const btn = event.target.closest('.variant-btn');
      if (!btn) return;
      document.querySelectorAll('.variant-btn').forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');

      const imageEl = document.getElementById('gallery-img');
      const color = String(btn.dataset.color || '').trim();
      if (color && Array.isArray(colorGroups[color]) && colorGroups[color].length) {
        const groupImages = colorGroups[color];
        currentImgIdx = 0;
        buildThumbs(groupImages);
        goToImg(0);
        imageEl?.classList.remove('siyah');
        return;
      }

      currentImgIdx = 0;
      buildThumbs(images);
      goToImg(0);

      const tone = String(btn.dataset.variant || '').trim();
      if (tone === 'siyah') {
        imageEl?.classList.add('siyah');
      } else {
        imageEl?.classList.remove('siyah');
      }
    });

    let lbImages = [];
    let lbIndex = 0;

    function updateLightbox() {
      const lightboxImg = document.getElementById('lightbox-img');
      const lightboxCounter = document.getElementById('lightbox-counter');
      const lightboxPrev = document.getElementById('lightbox-prev');
      const lightboxNext = document.getElementById('lightbox-next');
      if (!lightboxImg || !lightboxCounter || !lightboxPrev || !lightboxNext) return;
      lightboxImg.src = lbImages[lbIndex] || '';
      lightboxCounter.textContent = lbImages.length > 1 ? `${lbIndex + 1} / ${lbImages.length}` : '';
      lightboxPrev.disabled = lbIndex === 0;
      lightboxNext.disabled = lbIndex >= lbImages.length - 1;
    }

    function openLightbox(list, index) {
      const lightbox = document.getElementById('lightbox');
      if (!lightbox) return;
      lbImages = Array.isArray(list) ? list : [];
      lbIndex = Math.min(Math.max(index, 0), Math.max(lbImages.length - 1, 0));
      updateLightbox();
      lightbox.classList.add('open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      const lightbox = document.getElementById('lightbox');
      if (!lightbox) return;
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    document.getElementById('gallery-main-area')?.addEventListener('click', function (event) {
      if (!event.target.closest('.zoom-btn') && event.target.id !== 'gallery-img') return;
      const list = getCurrentImages();
      const currentSrc = document.getElementById('gallery-img')?.src || '';
      const idx = list.findIndex((src) => currentSrc.includes(String(src).split('/').pop() || ''));
      openLightbox(list, Math.max(0, idx));
    });

    document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox')?.addEventListener('click', function (event) {
      if (event.target?.id === 'lightbox') closeLightbox();
    });
    document.getElementById('lightbox-prev')?.addEventListener('click', function () {
      if (lbIndex > 0) {
        lbIndex -= 1;
        updateLightbox();
      }
    });
    document.getElementById('lightbox-next')?.addEventListener('click', function () {
      if (lbIndex < lbImages.length - 1) {
        lbIndex += 1;
        updateLightbox();
      }
    });
    document.addEventListener('keydown', function (event) {
      const lightbox = document.getElementById('lightbox');
      if (!lightbox?.classList.contains('open')) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft' && lbIndex > 0) {
        lbIndex -= 1;
        updateLightbox();
      }
      if (event.key === 'ArrowRight' && lbIndex < lbImages.length - 1) {
        lbIndex += 1;
        updateLightbox();
      }
    });

    buildThumbs(getCurrentImages());
    goToImg(0);
  }

  function injectProductCommerce(product) {
    const cart = window.BlaeneCart;
    const stock = Math.max(0, Number(product.stock_quantity || 0));
    const canSell = stock > 0 && product.price_visible && Number.isFinite(product.price) && product.price > 0;

    let headTarget = document.getElementById('blaene-product-head-commerce');
    if (!headTarget) {
      const infoName = document.querySelector('.info-name');
      if (infoName && infoName.parentElement) {
        headTarget = document.createElement('div');
        headTarget.id = 'blaene-product-head-commerce';
        headTarget.className = 'blaene-product-head-commerce';
        infoName.insertAdjacentElement('afterend', headTarget);
      }
    }

    const ctaSection = document.querySelector('.cta-section');
    const cartSlot = document.getElementById('blaene-product-cart-slot');
    if (ctaSection) {
      ctaSection.querySelector('.blaene-add-cart')?.remove();
    }
    if (cartSlot) {
      cartSlot.querySelector('.blaene-add-cart')?.remove();
    }

    const fallbackTarget = document.getElementById('blaene-simple-product-commerce');
    const addToCartTarget = cartSlot || ctaSection || fallbackTarget || headTarget;
    if (!addToCartTarget) return;
    addToCartTarget.querySelector('.blaene-add-cart')?.remove();

    if (headTarget) {
      headTarget.querySelector('.blaene-product-price')?.remove();
      headTarget.querySelector('.blaene-product-stock')?.remove();
    }

    const sale = canSell ? resolveSalePrice(product) : null;
    if (canSell && sale) {
      const priceEl = document.createElement('div');
      priceEl.className = 'blaene-product-price';
      if (sale.originalPrice && sale.discountPercent) {
        priceEl.innerHTML = `
          <span class="blaene-price-current">${escapeHtml(formatPrice(sale.price))}</span>
          <span class="blaene-price-old">${escapeHtml(formatPrice(sale.originalPrice))}</span>
          <span class="blaene-discount-badge">%${escapeHtml(sale.discountPercent)} indirim</span>
        `;
      } else {
        priceEl.textContent = formatPrice(sale.price);
      }
      if (headTarget) {
        headTarget.appendChild(priceEl);
      } else {
        addToCartTarget.prepend(priceEl);
      }
    }

    if (stock <= 0) {
      const stockEl = document.createElement('div');
      stockEl.className = 'blaene-product-stock';
      stockEl.textContent = 'Yakında gelecek';
      if (headTarget) {
        headTarget.appendChild(stockEl);
      } else {
        addToCartTarget.prepend(stockEl);
      }
    }

    if (canSell || stock <= 0) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'blaene-add-cart secondary';
      addBtn.textContent = canSell ? 'Sepete Ekle' : 'Yakında gelecek';
      addBtn.disabled = !canSell;
      addBtn.dataset.track = 'add_to_cart';
      addBtn.dataset.trackProductCode = String(product.code || '').trim().toUpperCase();
      addBtn.dataset.trackProductName = String(product.name || '').trim();
      addBtn.dataset.trackLabel = `Sepete ekle: ${String(product.code || '').trim().toUpperCase()}`;
      addBtn.addEventListener('click', function () {
        if (!cart || !canSell || !sale) return;
        animateAddCartButton(addBtn);
        const activeColor = String(document.querySelector('.variant-btn.active[data-color]')?.dataset?.color || '').trim();
        const selectedImages = activeColor && Array.isArray(product.colorGroups?.[activeColor])
          ? product.colorGroups[activeColor]
          : [];
        const selectedImage =
          selectedImages[0] ||
          document.getElementById('gallery-img')?.getAttribute('src') ||
          product.images?.[0] ||
          'logo/sitelogo.png';
        cart.addItem({
          code: product.code,
          name: product.name,
          price: sale.price,
          image: selectedImage,
          category: product.category,
          color: activeColor || '',
          stock: stock,
        }, 1);
      });
      addToCartTarget.appendChild(addBtn);
    }
  }

  async function syncProductPage(client) {
    if (!client) return;

    const params = new URLSearchParams(location.search);
    const code = String(params.get('code') || '').trim();
    if (!code) return;

    let { data, error } = await client
      .from('products')
      .select('id, code, name, category, material, thickness, dims, description, price, price_visible, images, variants, active, stock_quantity, display_order')
      .eq('code', code)
      .eq('active', true)
      .eq('archived', false)
      .maybeSingle();

    if (!data && !error) {
      const fallback = await client
        .from('products')
        .select('id, code, name, category, material, thickness, dims, description, price, price_visible, images, variants, active, stock_quantity, display_order')
        .ilike('code', code)
        .eq('active', true)
        .eq('archived', false)
        .limit(1);
      if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length) {
        data = fallback.data[0];
      } else if (fallback.error) {
        error = fallback.error;
      }
    }

    if (error) {
      console.error('[blaene-storefront] syncProductPage error:', error);
      return;
    }
    if (!data) return;

    let product = toPublicProduct(data);
    product = await enrichProductWithVariants(client, product);
    try {
      const promoMap = await loadPromotionDiscountMap(client);
      const key = String(product.code || '').trim().toUpperCase();
      if (promoMap[key]) {
        product.discount_percent = promoMap[key].percent;
        product.discount_promo_id = promoMap[key].id;
      }
    } catch {
      // ignore promotion lookup errors on product detail
    }

    if (document.querySelector('.not-found')) {
      renderSimpleProductView(product);
    }

    injectProductCommerce(product);
  }

  async function init() {
    injectStorefrontStyles();

    const client = getSupabase();
    const category = guessCategoryFromPath();

    if (category) {
      await syncCategoryPage(client, category);
      return;
    }

    const path = location.pathname.toLowerCase();
    if (path.endsWith('/product.html') || path.endsWith('product.html')) {
      await syncProductPage(client);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
