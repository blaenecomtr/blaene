(function () {
  const STORAGE_KEY = 'blaene_cart_v1';
  const FAB_RIGHT_GAP = 18;
  const FAB_BOTTOM_GAP = 18;
  const FAB_STACK_GAP = 12;
  let addToastTimer = null;
  let addToastHideTimer = null;

  function normalizeColor(value) {
    return String(value || '').trim();
  }

  function getLineId(code, color) {
    return `${String(code || '').trim()}::${normalizeColor(color).toLowerCase()}`;
  }

  function resolveLineId(item) {
    const explicit = String(item?.line_id || '').trim();
    if (explicit) return explicit;
    return getLineId(item?.code, item?.color);
  }

  function matchesLineRef(item, lineRef) {
    const target = String(lineRef || '').trim();
    if (!target) return false;
    const lineId = resolveLineId(item);
    return lineId === target || String(item?.code || '').trim() === target;
  }

  function readCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => ({
          code: String(item.code || '').trim(),
          name: String(item.name || '').trim(),
          price: Number(item.price || 0),
          qty: Math.max(1, Number(item.qty || 1)),
          image: String(item.image || '').trim(),
          category: String(item.category || '').trim(),
          stock: normalizeStock(item.stock),
          color: normalizeColor(item.color),
          line_id: resolveLineId(item),
        }))
        .filter((item) => item.code && item.name && Number.isFinite(item.price) && item.price > 0);
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('blaene:cart:updated', { detail: getSummary(items) }));
  }

  function getSummary(items = readCart()) {
    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return { items, totalItems, subtotal };
  }

  function normalizeStock(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.floor(parsed));
  }

  function addItem(product, qty = 1) {
    const normalizedQty = Math.max(1, Number(qty || 1));
    if (!product || !product.code || !product.name || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
      return false;
    }

    const items = readCart();
    const productColor = normalizeColor(product.color);
    const lineId = getLineId(product.code, productColor);
    const existing = items.find((item) => resolveLineId(item) === lineId);
    const productStock = normalizeStock(product.stock);

    if (productStock !== null && productStock <= 0) {
      return false;
    }

    let changed = false;
    if (existing) {
      const prevQty = existing.qty;
      const prevPrice = existing.price;
      const prevName = existing.name;
      const prevImage = existing.image;
      const prevCategory = existing.category;
      const prevStock = normalizeStock(existing.stock);
      const prevColor = normalizeColor(existing.color);
      const nextStock = productStock !== null ? productStock : normalizeStock(existing.stock);
      let nextQty = prevQty + normalizedQty;
      if (nextStock !== null) {
        nextQty = Math.min(nextQty, nextStock);
      }
      if (nextQty <= 0) return false;

      existing.qty = nextQty;
      existing.price = Number(product.price);
      existing.name = String(product.name || existing.name);
      existing.image = String(product.image || existing.image || '');
      existing.category = String(product.category || existing.category || '');
      existing.stock = nextStock;
      existing.color = productColor || prevColor;
      existing.line_id = lineId;
      if (
        existing.qty !== prevQty ||
        existing.price !== prevPrice ||
        existing.name !== prevName ||
        existing.image !== prevImage ||
        existing.category !== prevCategory ||
        normalizeStock(existing.stock) !== prevStock ||
        normalizeColor(existing.color) !== prevColor
      ) {
        changed = true;
      }
    } else {
      let firstQty = normalizedQty;
      if (productStock !== null) {
        firstQty = Math.min(firstQty, productStock);
      }
      if (firstQty <= 0) return false;
      items.push({
        code: String(product.code),
        name: String(product.name),
        price: Number(product.price),
        qty: firstQty,
        image: String(product.image || ''),
        category: String(product.category || ''),
        stock: productStock,
        color: productColor,
        line_id: lineId,
      });
      changed = true;
    }

    if (!changed && existing) return false;
    writeCart(items);
    showAddToast('Sepete eklendi');
    return true;
  }

  function removeItem(lineRef) {
    const items = readCart().filter((item) => !matchesLineRef(item, lineRef));
    writeCart(items);
  }

  function setQuantity(lineRef, qty) {
    const nextQty = Number(qty);
    if (!Number.isFinite(nextQty)) return;

    const items = readCart();
    const target = items.find((item) => matchesLineRef(item, lineRef));
    if (!target) return;

    if (nextQty <= 0) {
      const filtered = items.filter((item) => !matchesLineRef(item, lineRef));
      writeCart(filtered);
      return;
    }

    const stock = normalizeStock(target.stock);
    if (stock !== null && stock <= 0) {
      const filtered = items.filter((item) => !matchesLineRef(item, lineRef));
      writeCart(filtered);
      return;
    }

    let normalized = Math.max(1, Math.floor(nextQty));
    if (stock !== null) {
      normalized = Math.min(normalized, stock);
    }
    target.qty = normalized;
    writeCart(items);
  }

  function clearCart() {
    writeCart([]);
  }

  function formatPrice(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 2,
    }).format(amount);
  }

  function injectStyles() {
    if (document.getElementById('blaene-cart-styles')) return;
    const style = document.createElement('style');
    style.id = 'blaene-cart-styles';
    style.textContent = `
      .blaene-cart-fab {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 1500;
        border: 1px solid rgba(0, 0, 0, 0.15);
        background: #ffffff;
        color: #111827;
        border-radius: 999px;
        padding: 0.48rem 0.82rem;
        display: inline-flex;
        align-items: center;
        gap: 0.42rem;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.03em;
        cursor: pointer;
        box-shadow: 0 12px 26px rgba(15, 23, 42, 0.18);
      }
      .blaene-cart-fab .count {
        min-width: 1.2rem;
        height: 1.2rem;
        border-radius: 999px;
        background: #111827;
        color: #ffffff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.68rem;
        font-weight: 700;
      }
      .blaene-cart-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.42);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        z-index: 1501;
      }
      .blaene-cart-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .blaene-cart-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: min(420px, 100%);
        height: 100%;
        background: #ffffff;
        border-left: 1px solid #d1d5db;
        transform: translateX(100%);
        transition: transform 0.22s ease;
        z-index: 1502;
        display: grid;
        grid-template-rows: auto 1fr auto;
        font-family: 'Montserrat', sans-serif;
      }
      .blaene-cart-drawer.open {
        transform: translateX(0);
      }
      .blaene-cart-head {
        padding: 0.9rem 1rem;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .blaene-cart-head h3 {
        margin: 0;
        font-size: 0.92rem;
      }
      .blaene-cart-close {
        border: 1px solid #d1d5db;
        background: #f9fafb;
        border-radius: 8px;
        width: 30px;
        height: 30px;
        cursor: pointer;
      }
      .blaene-cart-list {
        overflow: auto;
        padding: 0.8rem 1rem;
        display: grid;
        gap: 0.72rem;
      }
      .blaene-cart-item {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 0.55rem;
        display: grid;
        grid-template-columns: 56px 1fr;
        gap: 0.55rem;
      }
      .blaene-cart-item img {
        width: 56px;
        height: 56px;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
      }
      .blaene-cart-item h4 {
        margin: 0;
        font-size: 0.74rem;
        line-height: 1.35;
      }
      .blaene-cart-item .unit-price {
        margin-top: 0.22rem;
        font-size: 0.68rem;
        color: #111827;
        font-weight: 600;
      }
      .blaene-cart-item .code {
        margin-top: 0.2rem;
        font-size: 0.67rem;
        color: #6b7280;
      }
      .blaene-cart-item .meta {
        margin-top: 0.35rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .blaene-cart-item input {
        width: 58px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        padding: 0.22rem 0.3rem;
        font-size: 0.72rem;
      }
      .blaene-cart-item .remove {
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
        border-radius: 8px;
        font-size: 0.66rem;
        padding: 0.24rem 0.38rem;
        cursor: pointer;
      }
      .blaene-cart-foot {
        border-top: 1px solid #e5e7eb;
        padding: 0.8rem 1rem;
      }
      .blaene-cart-foot .total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.65rem;
        font-size: 0.83rem;
      }
      .blaene-cart-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
      }
      .blaene-cart-actions a,
      .blaene-cart-actions button {
        text-decoration: none;
        border: 1px solid #d1d5db;
        border-radius: 10px;
        padding: 0.52rem;
        font-size: 0.74rem;
        text-align: center;
        background: #ffffff;
        color: #111827;
        cursor: pointer;
        font-family: inherit;
      }
      .blaene-cart-actions a.checkout {
        background: #111827;
        color: #ffffff;
        border-color: #111827;
      }
      .blaene-cart-empty {
        color: #6b7280;
        font-size: 0.8rem;
        text-align: center;
        padding: 1rem 0.4rem;
      }
      .blaene-cart-toast {
        position: fixed;
        left: 50%;
        bottom: 28px;
        transform: translate(-50%, 12px) scale(0.98);
        opacity: 0;
        pointer-events: none;
        z-index: 1700;
        background: #111827;
        color: #fff;
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 999px;
        padding: 0.66rem 1rem;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.25);
        transition: opacity 0.22s ease, transform 0.22s ease;
      }
      .blaene-cart-toast.show {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      .blaene-cart-toast.hide {
        opacity: 0;
        transform: translate(-50%, 10px) scale(0.98);
      }
      @media (max-width: 640px) {
        .blaene-cart-toast {
          bottom: 20px;
          max-width: calc(100vw - 20px);
          text-align: center;
          white-space: normal;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureAddToast() {
    let toast = document.getElementById('blaene-cart-toast');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = 'blaene-cart-toast';
    toast.className = 'blaene-cart-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    return toast;
  }

  function showAddToast(message) {
    injectStyles();
    const toast = ensureAddToast();
    toast.textContent = String(message || 'Sepete eklendi');
    toast.classList.remove('hide');
    void toast.offsetWidth;
    toast.classList.add('show');

    if (addToastTimer) window.clearTimeout(addToastTimer);
    if (addToastHideTimer) window.clearTimeout(addToastHideTimer);

    addToastTimer = window.setTimeout(function () {
      toast.classList.remove('show');
      toast.classList.add('hide');
      addToastHideTimer = window.setTimeout(function () {
        toast.classList.remove('hide');
      }, 240);
    }, 1500);
  }

  function ensureDrawer() {
    if (document.getElementById('blaene-cart-fab')) return;

    injectStyles();

    const fab = document.createElement('button');
    fab.id = 'blaene-cart-fab';
    fab.className = 'blaene-cart-fab';
    fab.type = 'button';
    fab.innerHTML = '<span>Sepet</span><span class="count">0</span>';

    const overlay = document.createElement('div');
    overlay.id = 'blaene-cart-overlay';
    overlay.className = 'blaene-cart-overlay';

    const drawer = document.createElement('aside');
    drawer.id = 'blaene-cart-drawer';
    drawer.className = 'blaene-cart-drawer';
    drawer.innerHTML = `
      <div class="blaene-cart-head">
        <h3>Sepet</h3>
        <button type="button" class="blaene-cart-close" aria-label="Sepeti kapat">x</button>
      </div>
      <div class="blaene-cart-list" id="blaene-cart-list"></div>
      <div class="blaene-cart-foot">
        <div class="total"><span>Ara toplam</span><strong id="blaene-cart-subtotal">0 TL</strong></div>
        <div class="blaene-cart-actions">
          <button type="button" id="blaene-cart-clear">Temizle</button>
          <a href="checkout.html" class="checkout">Odeme</a>
        </div>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    function openDrawer() {
      overlay.classList.add('open');
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      overlay.classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    }

    fab.addEventListener('click', openDrawer);
    overlay.addEventListener('click', closeDrawer);
    drawer.querySelector('.blaene-cart-close').addEventListener('click', closeDrawer);

    drawer.querySelector('#blaene-cart-clear').addEventListener('click', function () {
      clearCart();
    });

    drawer.addEventListener('change', function (event) {
      const input = event.target.closest('input[data-line]');
      if (!input) return;
      setQuantity(input.dataset.line, Number(input.value));
    });

    drawer.addEventListener('click', function (event) {
      const removeBtn = event.target.closest('button.remove[data-line]');
      if (!removeBtn) return;
      removeItem(removeBtn.dataset.line);
    });

    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeDrawer();
      }
    });

    syncFabPosition();
    window.addEventListener('resize', syncFabPosition, { passive: true });
    window.addEventListener('load', syncFabPosition);
  }

  function syncFabPosition() {
    const fab = document.getElementById('blaene-cart-fab');
    if (!fab) return;

    fab.style.right = `${FAB_RIGHT_GAP}px`;
    fab.style.bottom = `${FAB_BOTTOM_GAP}px`;

    const waFloat = document.querySelector('.wa-float');
    if (!waFloat) return;

    const waStyle = window.getComputedStyle(waFloat);
    if (waStyle.display === 'none' || waStyle.visibility === 'hidden' || waStyle.position !== 'fixed') return;

    const waBottom = Number.parseFloat(waStyle.bottom) || 0;
    const waHeight = waFloat.getBoundingClientRect().height || Number.parseFloat(waStyle.height) || 0;
    const stackedBottom = Math.ceil(waBottom + waHeight + FAB_STACK_GAP);
    fab.style.bottom = `${Math.max(stackedBottom, FAB_BOTTOM_GAP)}px`;
  }

  function ensureHeaderCartButton() {
    let btn = document.getElementById('header-cart-btn');
    let countEl = document.getElementById('header-cart-count');
    if (btn && countEl) return { btn, countEl };

    const headerHost =
      document.querySelector('.site-header .header-actions') ||
      document.querySelector('.site-header .header-right') ||
      document.querySelector('.site-header .header-meta');
    if (!headerHost) return { btn: null, countEl: null };

    if (!btn) {
      btn = document.createElement('a');
      btn.id = 'header-cart-btn';
      btn.href = 'checkout.html';
      btn.setAttribute('aria-label', 'Sepetim');
      btn.style.cssText = 'display:none;position:relative;background:none;border:none;cursor:pointer;padding:0.3rem;color:inherit;text-decoration:none;line-height:0;';
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M6 6h15l-1.5 9h-12z"></path>
          <circle cx="9" cy="20" r="1.2"></circle>
          <circle cx="18" cy="20" r="1.2"></circle>
        </svg>
        <span id="header-cart-count" style="position:absolute;top:-4px;right:-6px;min-width:17px;height:17px;border-radius:999px;background:#111827;color:#fff;font-size:0.6rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;"></span>
      `;

      const hamburger = headerHost.querySelector('#hamburger, .hamburger');
      if (hamburger && hamburger.parentElement === headerHost) {
        headerHost.insertBefore(btn, hamburger);
      } else {
        headerHost.appendChild(btn);
      }
    }

    countEl = document.getElementById('header-cart-count');
    if (!countEl && btn) {
      countEl = document.createElement('span');
      countEl.id = 'header-cart-count';
      countEl.style.cssText = 'position:absolute;top:-4px;right:-6px;min-width:17px;height:17px;border-radius:999px;background:#111827;color:#fff;font-size:0.6rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;';
      btn.appendChild(countEl);
    }

    return { btn, countEl };
  }

  function syncHeaderCart(summary) {
    const { btn, countEl } = ensureHeaderCartButton();
    if (!btn || !countEl) return;

    const total = Number(summary?.totalItems || 0);
    if (total > 0) {
      countEl.textContent = total > 99 ? '99+' : String(total);
      btn.style.display = '';
      return;
    }

    countEl.textContent = '';
    btn.style.display = 'none';
  }

  function renderDrawer() {
    const summary = getSummary();
    syncHeaderCart(summary);

    const fab = document.getElementById('blaene-cart-fab');
    const list = document.getElementById('blaene-cart-list');
    const subtotalEl = document.getElementById('blaene-cart-subtotal');
    if (!fab || !list || !subtotalEl) return;
    syncFabPosition();
    fab.querySelector('.count').textContent = String(summary.totalItems);

    if (!summary.items.length) {
      list.innerHTML = '<div class="blaene-cart-empty">Sepetiniz bos.</div>';
    } else {
      list.innerHTML = summary.items
        .map((item) => {
          const stock = normalizeStock(item.stock);
          const maxAttr = stock === null ? '' : `max="${stock}"`;
          const stockLabel = stock === null ? '' : `<div class="code">Stok: ${stock}</div>`;
          const colorLabel = normalizeColor(item.color) ? `<div class="code">Renk: ${item.color}</div>` : '';
          const lineId = resolveLineId(item);
          return `
            <div class="blaene-cart-item">
              <img src="${item.image || 'logo/sitelogo.png'}" alt="${item.code}" />
              <div>
                <h4>${item.name}</h4>
                <div class="unit-price">${formatPrice(item.price)}</div>
                <div class="code">${item.code}</div>
                ${colorLabel}
                ${stockLabel}
                <div class="meta">
                  <input type="number" min="1" step="1" ${maxAttr} value="${item.qty}" data-line="${lineId}" />
                  <span>${formatPrice(item.price * item.qty)}</span>
                  <button type="button" class="remove" data-line="${lineId}">Sil</button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    subtotalEl.textContent = formatPrice(summary.subtotal);
  }

  function initCartUi() {
    ensureDrawer();
    renderDrawer();
    window.addEventListener('blaene:cart:updated', renderDrawer);
  }

  const api = {
    getItems: readCart,
    getSummary,
    addItem,
    removeItem,
    setQuantity,
    clear: clearCart,
    formatPrice,
    initUi: initCartUi,
  };

  window.BlaeneCart = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartUi);
  } else {
    initCartUi();
  }
})();
