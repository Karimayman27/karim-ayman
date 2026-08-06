/**
 * ECL library — vanilla JavaScript only (no jQuery)
 * Popup open/close, variant pickers, Add to Cart,
 * Soft Winter Jacket auto-add when Black + Medium selected.
 */
(function () {
  'use strict';

  var softWinterJacketCache = null;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function formatMoney(cents) {
    if (typeof Shopify !== 'undefined' && typeof Shopify.formatMoney === 'function') {
      return Shopify.formatMoney(cents);
    }
    return (Number(cents) / 100).toFixed(2).replace('.', ',') + '€';
  }

  function stripHtml(html) {
    var el = document.createElement('div');
    el.innerHTML = html || '';
    return (el.textContent || '').trim();
  }

  function resolveOptionName(option) {
    if (option == null) return '';
    if (typeof option === 'string') return option;
    if (typeof option === 'object' && option.name) return String(option.name);
    return '';
  }

  function getProductOptionNames(product) {
    return (product.options || []).map(resolveOptionName);
  }

  function uniqueOptionValues(product, optionIndex) {
    var option = product.options[optionIndex];
    if (option && typeof option === 'object' && Array.isArray(option.values) && option.values.length) {
      return option.values.slice();
    }
    var map = {};
    var values = [];
    product.variants.forEach(function (variant) {
      var value = variant.options[optionIndex];
      if (value && !map[value]) {
        map[value] = true;
        values.push(value);
      }
    });
    return values;
  }

  function findVariant(product, selected) {
    var names = getProductOptionNames(product);
    return (
      product.variants.find(function (variant) {
        return variant.options.every(function (opt, index) {
          return selected[names[index]] === opt;
        });
      }) || null
    );
  }

  function optionLooksLikeColor(name) {
    return /color|colour|couleur/i.test(name || '');
  }

  function optionLooksLikeSize(name) {
    return /size|taille|pointure/i.test(name || '');
  }

  function valuesLookLikeSize(values) {
    if (!values || !values.length) return false;
    return values.every(function (value) {
      return /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|6xl|\d+|medium|small|large|one size|onesize)$/i.test(
        String(value).trim()
      );
    });
  }

  function valuesLookLikeColor(values) {
    if (!values || !values.length) return false;
    var colorWords = /white|black|blue|red|green|grey|gray|yellow|pink|brown|beige|navy|orange|purple|cream|gold|silver|ivory|khaki|olive|burgundy|maroon|teal|coral/i;
    return values.some(function (value) {
      return colorWords.test(String(value));
    });
  }

  function shouldUseColorField(name, values) {
    if (optionLooksLikeColor(name)) return true;
    if (optionLooksLikeSize(name) || valuesLookLikeSize(values)) return false;
    return valuesLookLikeColor(values);
  }

  function swatchColorForValue(value) {
    var lower = String(value || '').toLowerCase();
    var map = [
      ['white', '#FFFFFF'],
      ['ivory', '#FFFFF0'],
      ['cream', '#FFFDD0'],
      ['black', '#000000'],
      ['navy', '#1B2A4A'],
      ['blue', '#0D499F'],
      ['red', '#B20F36'],
      ['burgundy', '#6D1A2A'],
      ['maroon', '#800000'],
      ['green', '#2E5A3C'],
      ['olive', '#556B2F'],
      ['grey', '#AFAFB7'],
      ['gray', '#AFAFB7'],
      ['yellow', '#E6C200'],
      ['pink', '#E8A0BF'],
      ['brown', '#6B3F2A'],
      ['beige', '#D8CBB5'],
      ['khaki', '#C3B091'],
      ['orange', '#E36C2C'],
      ['purple', '#6B3FA0'],
      ['gold', '#C5A028'],
      ['silver', '#C0C0C0'],
      ['teal', '#008080'],
      ['coral', '#FF7F50']
    ];
    for (var i = 0; i < map.length; i++) {
      if (lower.indexOf(map[i][0]) !== -1) return map[i][1];
    }
    return '#C8C8C8';
  }

  function initSizeSelect(root) {
    var trigger = qs('[data-ecl-size-trigger]', root);
    var list = qs('[data-ecl-size-list]', root);
    var label = qs('[data-ecl-size-label]', root);
    if (!trigger || !list || !label) return;

    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var open = root.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    list.addEventListener('click', function (event) {
      var option = event.target.closest('.ecl-size-option');
      if (!option) return;
      event.preventDefault();
      event.stopPropagation();
      var value = option.getAttribute('data-value') || option.textContent.trim();
      label.textContent = value;
      trigger.classList.add('has-value');
      root.dataset.selected = value;
      qsa('.ecl-size-option', list).forEach(function (btn) {
        var active = btn === option;
        btn.classList.toggle('is-selected', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      root.dispatchEvent(new CustomEvent('ecl:option-change', { bubbles: true }));
    });
  }

  function initColorSelect(root) {
    root.addEventListener('click', function (event) {
      var option = event.target.closest('.ecl-color__option');
      if (!option) return;
      qsa('.ecl-color__option', root).forEach(function (btn) {
        var active = btn === option;
        btn.classList.toggle('is-selected', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      root.dataset.selected = option.getAttribute('data-value');
      root.dispatchEvent(new CustomEvent('ecl:option-change', { bubbles: true }));
    });
  }

  function cartAddUrl() {
    return (window.Shopify && Shopify.routes && Shopify.routes.root ? Shopify.routes.root : '/') + 'cart/add.js';
  }

  function postCartItems(items) {
    return fetch(cartAddUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.description) || 'Could not add to cart');
        return data;
      });
    });
  }

  function fetchProductByHandle(handle) {
    return fetch('/products/' + handle + '.js').then(function (res) {
      if (!res.ok) throw new Error('Product not found');
      return res.json();
    });
  }

  function getSoftWinterJacketVariantId() {
    if (softWinterJacketCache) return Promise.resolve(softWinterJacketCache);
    return fetchProductByHandle('soft-winter-jacket')
      .then(function (product) {
        var available = product.variants.find(function (v) { return v.available; }) || product.variants[0];
        softWinterJacketCache = available && available.id;
        return softWinterJacketCache;
      })
      .catch(function () { return null; });
  }

  function selectedIncludesBlackAndMedium(selected) {
    var values = Object.keys(selected).map(function (key) {
      return String(selected[key]).toLowerCase();
    });
    var hasBlack = values.indexOf('black') !== -1;
    var hasMedium = values.indexOf('medium') !== -1 || values.indexOf('m') !== -1;
    return hasBlack && hasMedium;
  }

  function PopupController(overlay) {
    this.overlay = overlay;
    this.image = qs('[data-ecl-popup-image]', overlay);
    this.title = qs('[data-ecl-popup-title]', overlay);
    this.price = qs('[data-ecl-popup-price]', overlay);
    this.description = qs('[data-ecl-popup-description]', overlay);
    this.fields = qs('[data-ecl-popup-fields]', overlay);
    this.status = qs('[data-ecl-popup-status]', overlay);
    this.atc = qs('[data-ecl-atc]', overlay);
    this.product = null;
    this.selected = {};
    this.bind();
  }

  PopupController.prototype.bind = function () {
    var self = this;
    qsa('[data-ecl-close-popup]', this.overlay).forEach(function (btn) {
      btn.addEventListener('click', function () { self.close(); });
    });
    this.overlay.addEventListener('click', function (event) {
      if (event.target === self.overlay) self.close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && self.overlay.classList.contains('is-open')) self.close();
    });
    this.fields.addEventListener('ecl:option-change', function () {
      self.syncSelectedFromDom();
      self.updatePrice();
    });
    if (this.atc) {
      this.atc.addEventListener('click', function () { self.addToCart(); });
    }
  };

  PopupController.prototype.open = function (product) {
    this.product = product;
    this.selected = {};
    this.status.textContent = '';
    this.status.classList.remove('is-error');
    this.render();
    this.overlay.hidden = false;
    this.overlay.setAttribute('aria-hidden', 'false');
    var self = this;
    requestAnimationFrame(function () {
      self.overlay.classList.add('is-open');
    });
    document.documentElement.style.overflow = 'hidden';
  };

  PopupController.prototype.close = function () {
    this.overlay.classList.remove('is-open');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    var self = this;
    setTimeout(function () {
      self.overlay.hidden = true;
    }, 250);
  };

  PopupController.prototype.render = function () {
    var product = this.product;
    var featured = product.featured_image || (product.images && product.images[0]) || '';
    this.image.src = featured;
    this.image.alt = product.title;
    this.title.textContent = product.title;
    this.description.textContent = stripHtml(product.description).slice(0, 180);
    this.fields.innerHTML = '';

    var self = this;
    var colorFields = [];
    var sizeFields = [];

    (product.options || []).forEach(function (option, index) {
      var optionName = resolveOptionName(option);
      var values = uniqueOptionValues(product, index);
      if (!values.length) return;
      if (values.length === 1 && /default title/i.test(values[0])) return;
      if (!optionName) optionName = 'Option ' + (index + 1);

      if (shouldUseColorField(optionName, values)) {
        self.selected[optionName] = values[0];
        colorFields.push(self.buildColorField(optionName, values));
      } else {
        self.selected[optionName] = '';
        sizeFields.push(self.buildSizeField(optionName, values));
      }
    });

    // Figma order: Color first, then Size
    colorFields.forEach(function (el) { self.fields.appendChild(el); });
    sizeFields.forEach(function (el) { self.fields.appendChild(el); });
    this.updatePrice();
  };

  PopupController.prototype.buildColorField = function (optionName, values) {
    var wrap = document.createElement('div');
    wrap.className = 'ecl-color';
    wrap.setAttribute('data-ecl-color', '');
    wrap.dataset.optionName = optionName;
    wrap.dataset.selected = values[0];
    wrap.innerHTML =
      '<span class="ecl-color__label">' + optionName + '</span>' +
      '<div class="ecl-color__options" role="listbox"></div>';
    var options = qs('.ecl-color__options', wrap);
    values.forEach(function (value, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ecl-color__option' + (i === 0 ? ' is-selected' : '');
      btn.setAttribute('data-value', value);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.innerHTML =
        '<span class="ecl-color__swatch" style="background:' + swatchColorForValue(value) + '" aria-hidden="true"></span>' +
        '<span class="ecl-color__name">' + value + '</span>';
      options.appendChild(btn);
    });
    initColorSelect(wrap);
    return wrap;
  };

  PopupController.prototype.buildSizeField = function (optionName, values) {
    var wrap = document.createElement('div');
    wrap.className = 'ecl-size';
    wrap.setAttribute('data-ecl-size', '');
    wrap.dataset.optionName = optionName;
    wrap.dataset.selected = '';
    wrap.innerHTML =
      '<span class="ecl-size__label">' + optionName + '</span>' +
      '<button type="button" class="ecl-size__trigger" data-ecl-size-trigger aria-expanded="false">' +
      '<span class="ecl-size__trigger-text" data-ecl-size-label>Choose your size</span>' +
      '<span class="ecl-size__divider" aria-hidden="true"></span>' +
      '<span class="ecl-size__chevron" aria-hidden="true"></span>' +
      '</button><ul class="ecl-size__list" role="listbox" data-ecl-size-list></ul>';
    var list = qs('[data-ecl-size-list]', wrap);
    values.forEach(function (value) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ecl-size-option';
      btn.setAttribute('data-value', value);
      btn.setAttribute('role', 'option');
      btn.textContent = value;
      li.appendChild(btn);
      list.appendChild(li);
    });
    initSizeSelect(wrap);
    return wrap;
  };

  PopupController.prototype.syncSelectedFromDom = function () {
    var self = this;
    qsa('[data-ecl-color]', this.fields).forEach(function (el) {
      if (el.dataset.optionName) self.selected[el.dataset.optionName] = el.dataset.selected;
    });
    qsa('[data-ecl-size]', this.fields).forEach(function (el) {
      if (el.dataset.optionName) self.selected[el.dataset.optionName] = el.dataset.selected || '';
    });
  };

  PopupController.prototype.updatePrice = function () {
    this.syncSelectedFromDom();
    var variant = findVariant(this.product, this.selected);
    this.price.textContent = formatMoney(variant ? variant.price : this.product.price);
  };

  PopupController.prototype.addToCart = function () {
    var self = this;
    this.syncSelectedFromDom();
    this.status.classList.remove('is-error');

    var missing = getProductOptionNames(this.product).some(function (name) {
      if (!name || /^title$/i.test(name)) return false;
      if (!(name in self.selected)) return false;
      return !self.selected[name];
    });
    if (missing) {
      this.status.textContent = 'Please choose all options.';
      this.status.classList.add('is-error');
      return;
    }

    var variant = findVariant(this.product, this.selected);
    if (!variant || !variant.available) {
      this.status.textContent = 'This variant is unavailable.';
      this.status.classList.add('is-error');
      return;
    }

    var items = [{ id: variant.id, quantity: 1 }];
    var needsJacket = selectedIncludesBlackAndMedium(this.selected);
    this.atc.disabled = true;
    this.status.textContent = 'Adding…';

    var chain = Promise.resolve();
    if (needsJacket) {
      chain = getSoftWinterJacketVariantId().then(function (jacketId) {
        if (jacketId && jacketId !== variant.id) items.push({ id: jacketId, quantity: 1 });
      });
    }

    chain
      .then(function () { return postCartItems(items); })
      .then(function () {
        self.status.textContent = needsJacket
          ? 'Added to cart (including Soft Winter Jacket).'
          : 'Added to cart.';
      })
      .catch(function (err) {
        self.status.textContent = err.message || 'Could not add to cart.';
        self.status.classList.add('is-error');
      })
      .finally(function () {
        self.atc.disabled = false;
      });
  };

  var productCache = {};

  function loadProduct(handle) {
    if (productCache[handle]) return Promise.resolve(productCache[handle]);
    return fetchProductByHandle(handle).then(function (product) {
      productCache[handle] = product;
      return product;
    });
  }

  function initBannerMenu() {
    qsa('[data-ecl-menu-toggle]').forEach(function (toggle) {
      var menu = qs('#' + toggle.getAttribute('aria-controls'));
      if (!menu) return;
      toggle.addEventListener('click', function () {
        var open = menu.hidden;
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  function init() {
    initBannerMenu();

    var overlay = qs('[data-ecl-popup-overlay]');
    if (!overlay) return;
    var popup = new PopupController(overlay);

    document.addEventListener('click', function (event) {
      var openBtn = event.target.closest('[data-ecl-open-popup]');
      if (!openBtn) return;
      event.preventDefault();
      var handle = openBtn.getAttribute('data-product-handle');
      if (!handle) return;
      loadProduct(handle)
        .then(function (product) { popup.open(product); })
        .catch(function () { alert('Unable to load product details.'); });
    });

    document.addEventListener('click', function (event) {
      qsa('.ecl-size.is-open').forEach(function (sizeEl) {
        if (!sizeEl.contains(event.target)) {
          sizeEl.classList.remove('is-open');
          var trigger = qs('[data-ecl-size-trigger]', sizeEl);
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
