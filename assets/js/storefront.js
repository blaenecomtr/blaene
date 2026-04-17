(function () {
  const SUPABASE_URL = 'https://myufpjuyfjmpbunrkozy.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_uKwxlDCAxSOzus7W96aF9w_m2iDE2QA';

  const CATEGORY_LABEL = {
    bath: 'BANYO',
    forge: 'ATES CUKURU',
    industrial: 'MODULER RAF',
  };

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
        font-weight: 700;
        color: #0f172a;
      }
      .blaene-desc-line {
        margin-top: 0.45rem;
        font-size: 0.72rem;
        color: #475569;
        line-height: 1.35;
      }
      .blaene-stock-line {
        margin-top: 0.35rem;
        font-size: 0.68rem;
        color: #64748b;
      }
      .blaene-add-cart {
        margin-top: 0.5rem;
        width: 100%;
        border: 1px solid #111827;
        background: #111827;
        color: #fff;
        border-radius: 8px;
        padding: 0.44rem 0.58rem;
        font-size: 0.72rem;
        font-family: 'Montserrat', sans-serif;
        letter-spacing: 0.04em;
        cursor: pointer;
      }
      .blaene-add-cart[disabled] {
        cursor: not-allowed;
        border-color: #d1d5db;
        background: #f3f4f6;
        color: #6b7280;
      }
      .blaene-add-cart.secondary {
        width: auto;
        padding: 0.55rem 0.85rem;
        font-size: 0.78rem;
      }
      .blaene-product-price {
        margin: 0.4rem 0 0.25rem;
        font-size: 1rem;
        font-weight: 700;
        color: #0f172a;
      }
    `;
    document.head.appendChild(style);
  }

  function toPublicProduct(row) {
    const images = Array.isArray(row.images) && row.images.length ? row.images : ['logo/sitelogo.png'];
    const variants = Array.isArray(row.variants)
      ? row.variants
      : (typeof row.variants === 'string' && row.variants
          ? safelyParseArray(row.variants)
          : []);

    const colorGroups = {};
    variants.forEach((variant) => {
      const label = String(variant?.label || '').trim();
      const variantImages = Array.isArray(variant?.images) ? variant.images.filter(Boolean) : [];
      if (label && variantImages.length) {
        colorGroups[label] = variantImages;
      }
    });

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
      price_visible: Boolean(row.price_visible),
      images,
      variants,
      colorGroups,
      active: row.active !== false,
      stock_quantity: Number.isFinite(Number(row.stock_quantity)) ? Math.max(0, Number(row.stock_quantity)) : 0,
      display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : 0,
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

  function formatPrice(value) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
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
      info.querySelector('.blaene-desc-line')?.remove();
      info.querySelector('.blaene-stock-line')?.remove();
      info.querySelector('.blaene-add-cart')?.remove();

      const descriptionText = String(product.description || '').trim();
      if (descriptionText) {
        const descEl = document.createElement('p');
        descEl.className = 'blaene-desc-line';
        descEl.textContent = descriptionText.length > 120 ? `${descriptionText.slice(0, 117)}...` : descriptionText;
        info.appendChild(descEl);
      }

      const stock = Math.max(0, Number(product.stock_quantity || 0));
      const stockEl = document.createElement('p');
      stockEl.className = 'blaene-stock-line';
      stockEl.textContent = stock > 0 ? `Stok: ${stock}` : 'Stokta yok';
      info.appendChild(stockEl);

      if (product.price_visible && Number.isFinite(product.price) && product.price > 0) {
        const priceEl = document.createElement('p');
        priceEl.className = 'blaene-price-line';
        priceEl.textContent = formatPrice(product.price);
        info.appendChild(priceEl);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'blaene-add-cart';
        addBtn.textContent = stock > 0 ? 'Sepete Ekle' : 'Tukendi';
        addBtn.disabled = stock <= 0;
        addBtn.dataset.productCode = product.code;
        addBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!cart) return;
          cart.addItem({
            code: product.code,
            name: product.name,
            price: product.price,
            image: product.images?.[0] || 'logo/sitelogo.png',
            category: product.category,
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

  async function syncCategoryPage(client, category) {
    if (!client || !category) return;

    const { data, error } = await client
      .from('products')
      .select('id, code, name, category, material, thickness, dims, description, price, price_visible, images, variants, active, stock_quantity, display_order')
      .eq('category', category)
      .eq('active', true)
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

    const categoryPage = product.category + '.html';
    const categoryText = CATEGORY_LABEL[product.category] || product.category;
    const mainImage = product.images?.[0] || 'logo/sitelogo.png';

    const thumbs = (product.images || [])
      .map((src, index) => `<img src="${src}" alt="${product.code} ${index + 1}" style="width:70px;height:70px;object-fit:cover;border:1px solid #ddd;border-radius:10px;" />`)
      .join('');

    main.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.2rem;">
        <div>
          <img src="${mainImage}" alt="${product.code}" style="width:100%;border:1px solid #ddd;border-radius:14px;object-fit:cover;max-height:520px;" />
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem;">${thumbs}</div>
        </div>
        <div>
          <p style="font-size:0.75rem;letter-spacing:0.08em;color:#666;">${categoryText}</p>
          <h1 style="margin:0;font-size:2rem;">${product.code}</h1>
          <h2 style="margin:0.4rem 0 0.7rem;font-size:1.2rem;">${product.name}</h2>
          <p style="margin:0.5rem 0;color:#374151;">${product.description || ''}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:0.8rem;">
            <tr><td style="padding:0.45rem 0;border-bottom:1px solid #e5e7eb;">Malzeme</td><td style="padding:0.45rem 0;border-bottom:1px solid #e5e7eb;">${product.material || '-'}</td></tr>
            <tr><td style="padding:0.45rem 0;border-bottom:1px solid #e5e7eb;">Kalinlik</td><td style="padding:0.45rem 0;border-bottom:1px solid #e5e7eb;">${product.thickness || '-'}</td></tr>
            <tr><td style="padding:0.45rem 0;border-bottom:1px solid #e5e7eb;">Olcu</td><td style="padding:0.45rem 0;border-bottom:1px solid #e5e7eb;">${product.dims || '-'}</td></tr>
          </table>
          <div id="blaene-simple-product-commerce" style="margin-top:0.8rem;"></div>
          <a href="${categoryPage}" style="display:inline-flex;margin-top:1rem;border:1px solid #d1d5db;padding:0.5rem 0.8rem;border-radius:9px;text-decoration:none;color:#111;">Koleksiyona don</a>
        </div>
      </div>
    `;
  }

  function injectProductCommerce(product) {
    const cart = window.BlaeneCart;
    const stock = Math.max(0, Number(product.stock_quantity || 0));

    const ctaSection = document.querySelector('.cta-section');
    if (ctaSection) {
      ctaSection.querySelector('.blaene-product-price')?.remove();
      ctaSection.querySelector('.blaene-add-cart')?.remove();
    }

    const target = ctaSection || document.getElementById('blaene-simple-product-commerce');
    if (!target) return;

    if (product.price_visible && Number.isFinite(product.price) && product.price > 0) {
      const priceEl = document.createElement('div');
      priceEl.className = 'blaene-product-price';
      priceEl.textContent = formatPrice(product.price);
      target.prepend(priceEl);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'blaene-add-cart secondary';
      addBtn.textContent = stock > 0 ? 'Sepete Ekle' : 'Tukendi';
      addBtn.disabled = stock <= 0;
      addBtn.addEventListener('click', function () {
        if (!cart) return;
        cart.addItem({
          code: product.code,
          name: product.name,
          price: product.price,
          image: product.images?.[0] || 'logo/sitelogo.png',
          category: product.category,
          stock: stock,
        }, 1);
      });
      target.appendChild(addBtn);
    }
  }

  async function syncProductPage(client) {
    if (!client) return;

    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return;

    const { data, error } = await client
      .from('products')
      .select('id, code, name, category, material, thickness, dims, description, price, price_visible, images, variants, active, stock_quantity, display_order')
      .eq('code', code)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      console.error('[blaene-storefront] syncProductPage error:', error);
      return;
    }
    if (!data) return;

    const product = toPublicProduct(data);

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
