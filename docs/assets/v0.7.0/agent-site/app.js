/* ============================================================
   青禾商城 · app.js
   ------------------------------------------------------------
   按 Sketch Graph 实现：
     root                                    → 首页（导航 + Banner + 商品卡片）
     bbce0286-…-985d90  (page)               → 登录页
     ce39768f-…-5e9264  (page)               → 商品详情
     adefb394-…-3547d49 (detail, 非独立页面) → 首页 Banner 视觉细节

   导航关系（edges）：
     root --navigation「登录」--> 登录页      （点击导航栏「登录」按钮）
     root --navigation「查看商品」--> 商品详情（点击商品卡片）
     root --detail「Banner 视觉细节」--> 细节（并入首页，不产生新路由）
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. 商品数据
     ---------------------------------------------------------- */
  var PRODUCTS = [
    {
      id: 'tote-bag',
      title: '轻盈通勤包',
      price: 299,
      compareAt: 399,
      desc: '轻便耐用 · 日常通勤',
      tag: '主推',
      specs: ['约 420g 自重', '防泼水面料', '14 英寸笔电仓'],
      art: 'bag'
    },
    {
      id: 'travel-cup',
      title: '日常随行杯',
      price: 89,
      compareAt: 129,
      desc: '316 内胆 · 保温 6 小时',
      tag: '新品',
      specs: ['450ml 容量', '316 不锈钢', '一键开盖'],
      art: 'cup'
    }
  ];

  var LIMITS = { min: 1, max: 99 };

  /* ----------------------------------------------------------
     2. 商品插画（简洁线条风，不依赖外部资源）
     ---------------------------------------------------------- */
  var ART = {
    bag:
      '<svg viewBox="0 0 200 200" role="presentation" focusable="false">' +
      '<rect x="46" y="70" width="108" height="92" rx="14" fill="#cfe6d2"/>' +
      '<rect x="46" y="70" width="108" height="26" rx="12" fill="#55a06c"/>' +
      '<path d="M76 70V58a24 24 0 0 1 48 0v12" fill="none" stroke="#2f6b45" stroke-width="6" stroke-linecap="round"/>' +
      '<rect x="86" y="108" width="28" height="18" rx="6" fill="#fbfaf6" opacity=".85"/>' +
      '<path d="M62 96h20M118 96h20" stroke="#8fc79d" stroke-width="5" stroke-linecap="round"/>' +
      '</svg>',
    cup:
      '<svg viewBox="0 0 200 200" role="presentation" focusable="false">' +
      '<path d="M64 62h72l-8 96a14 14 0 0 1-14 13H86a14 14 0 0 1-14-13z" fill="#cfe6d2"/>' +
      '<path d="M64 62h72l-2 24H66z" fill="#55a06c"/>' +
      '<rect x="60" y="50" width="80" height="16" rx="8" fill="#2f6b45"/>' +
      '<path d="M136 88h14a16 16 0 0 1 0 32h-16" fill="none" stroke="#2f6b45" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M84 108h34" stroke="#fbfaf6" stroke-width="6" stroke-linecap="round" opacity=".9"/>' +
      '</svg>'
  };

  function artFor(key) {
    return ART[key] || ART.bag;
  }

  function findProduct(id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) { return PRODUCTS[i]; }
    }
    return null;
  }

  /* ----------------------------------------------------------
     3. 工具
     ---------------------------------------------------------- */
  function yuan(n) {
    return '¥ ' + Number(n).toLocaleString('zh-CN');
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* 忽略隐私模式 */ }
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ----------------------------------------------------------
     4. 状态：登录态 + 购物车
     ---------------------------------------------------------- */
  var Auth = {
    KEY: 'qinghe.auth',
    user: null,

    load: function () {
      var saved = readJSON(this.KEY, null);
      if (saved && typeof saved.phone === 'string') { this.user = saved; }
      return this.user;
    },
    login: function (phone, remember) {
      this.user = { phone: phone, at: Date.now() };
      if (remember) { writeJSON(this.KEY, this.user); }
      else { writeJSON(this.KEY, this.user); }
      return this.user;
    },
    logout: function () {
      this.user = null;
      try { localStorage.removeItem(this.KEY); } catch (err) { /* noop */ }
    },
    isLoggedIn: function () { return !!this.user; },
    maskedPhone: function () {
      if (!this.user) { return ''; }
      var p = this.user.phone;
      return p.length === 11 ? p.slice(0, 3) + '****' + p.slice(7) : p;
    }
  };

  var Cart = {
    KEY: 'qinghe.cart',
    items: [],

    load: function () {
      var saved = readJSON(this.KEY, null);
      if (Array.isArray(saved)) {
        this.items = saved.filter(function (it) {
          return it && findProduct(it.id) && it.qty > 0;
        }).map(function (it) {
          return { id: it.id, qty: clamp(Math.round(it.qty), LIMITS.min, LIMITS.max) };
        });
      }
      return this.items;
    },
    save: function () { writeJSON(this.KEY, this.items); },

    find: function (id) {
      for (var i = 0; i < this.items.length; i++) {
        if (this.items[i].id === id) { return this.items[i]; }
      }
      return null;
    },
    add: function (id, qty) {
      var line = this.find(id);
      if (line) {
        line.qty = clamp(line.qty + qty, LIMITS.min, LIMITS.max);
      } else {
        this.items.push({ id: id, qty: clamp(qty, LIMITS.min, LIMITS.max) });
      }
      this.save();
      return this.count();
    },
    setQty: function (id, qty) {
      var line = this.find(id);
      if (!line) { return; }
      line.qty = clamp(Math.round(qty), LIMITS.min, LIMITS.max);
      this.save();
    },
    remove: function (id) {
      this.items = this.items.filter(function (it) { return it.id !== id; });
      this.save();
    },
    clear: function () { this.items = []; this.save(); },

    count: function () {
      return this.items.reduce(function (sum, it) { return sum + it.qty; }, 0);
    },
    total: function () {
      return this.items.reduce(function (sum, it) {
        var p = findProduct(it.id);
        return sum + (p ? p.price * it.qty : 0);
      }, 0);
    }
  };

  /* ----------------------------------------------------------
     5. Toast
     ---------------------------------------------------------- */
  var toastStack = $('#toastStack');

  function toast(message, variant) {
    var el = document.createElement('div');
    el.className = 'toast' + (variant === 'warn' ? ' toast--warn' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    toastStack.appendChild(el);

    window.setTimeout(function () {
      el.classList.add('is-out');
      window.setTimeout(function () { el.remove(); }, 240);
    }, 2200);
  }

  /* ----------------------------------------------------------
     6. 路由：hash 路由，#/ → 首页，#/login → 登录页，#/product/:id → 详情
     ---------------------------------------------------------- */
  var Router = {
    current: '',
    params: {},

    parse: function () {
      var raw = window.location.hash.replace(/^#\/?/, '');
      var hashTarget = '';
      var qIndex = raw.indexOf('?');

      if (qIndex > -1) { raw = raw.slice(0, qIndex); }
      // 支持 #/#featured 形式的锚点
      var hashIndex = raw.indexOf('#');
      if (hashIndex > -1) {
        hashTarget = raw.slice(hashIndex + 1);
        raw = raw.slice(0, hashIndex);
      }

      var parts = raw.split('/').filter(Boolean);
      var route = parts[0] || 'home';
      var param = parts[1] || '';

      if (route === 'product' && param) {
        this.current = 'product';
        this.params = { id: decodeURIComponent(param) };
      } else if (route === 'login') {
        this.current = 'login';
        this.params = {};
      } else if (route === 'home' || route === '') {
        this.current = 'home';
        this.params = { scrollTo: hashTarget };
      } else {
        this.current = 'notfound';
        this.params = {};
      }
    },

    render: function () {
      this.parse();

      var views = document.querySelectorAll('.view');
      for (var i = 0; i < views.length; i++) {
        views[i].hidden = views[i].getAttribute('data-view') !== this.current;
      }

      if (this.current === 'product') { renderProduct(this.params.id); }

      Nav.sync(this.current);
      window.scrollTo({ top: 0, behavior: 'auto' });

      // 处理锚点滚动（精选 / 关于）
      if (this.current === 'home' && this.params.scrollTo) {
        var target = document.getElementById(this.params.scrollTo);
        if (target) {
          window.requestAnimationFrame(function () {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      }
    },

    go: function (path) {
      if (window.location.hash === path) { this.render(); }
      else { window.location.hash = path; }
    }
  };

  /* ----------------------------------------------------------
     7. 导航栏：登录按钮 / 用户信息
     ---------------------------------------------------------- */
  var Nav = {
    init: function () {
      this.loginBtn = $('#loginButton');
      var self = this;

      this.loginBtn.addEventListener('click', function () {
        if (Auth.isLoggedIn()) { return; }
        Router.go('#/login');
      });

      // 购物车按钮
      $('#cartButton').addEventListener('click', function () { CartUI.open(); });

      // 卡片点击（事件委托）
      $('#productGrid').addEventListener('click', function (ev) {
        var card = ev.target.closest('[data-product]');
        if (!card) { return; }
        ev.preventDefault();
        Router.go('#/product/' + card.getAttribute('data-product'));
      });

      this.sync(Router.current);
      this.syncCart();
    },

    /** 根据登录态切换导航右侧区域 */
    sync: function (view) {
      var host = this.loginBtn.parentNode;

      if (Auth.isLoggedIn()) {
        if (!this.userChip) {
          var chip = document.createElement('div');
          chip.className = 'user-chip';
          chip.innerHTML =
            '<span class="user-chip__avatar">' + Auth.user.phone.slice(-2) + '</span>' +
            '<span class="user-chip__text"></span>' +
            '<button class="user-chip__out" type="button">退出</button>';
          chip.querySelector('.user-chip__out').addEventListener('click', function () {
            Auth.logout();
            Nav.sync(Router.current);
            toast('已退出登录');
          });
          this.userChip = chip;
          host.appendChild(chip);
        }
        this.userChip.querySelector('.user-chip__text').textContent = Auth.maskedPhone();
        this.userChip.hidden = false;
        this.loginBtn.hidden = true;
      } else {
        if (this.userChip) { this.userChip.hidden = true; }
        this.loginBtn.hidden = false;
        this.loginBtn.textContent = '登录';
      }

      // 导航高亮：仅在首页时高亮「首页」
      var links = document.querySelectorAll('.nav__links a');
      for (var i = 0; i < links.length; i++) {
        var nav = links[i].getAttribute('data-nav');
        links[i].classList.toggle('is-active', nav === 'home' && view === 'home');
      }
    },

    syncCart: function () {
      var n = Cart.count();
      var badge = $('#cartBadge');
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = n === 0;
    }
  };

  /* ----------------------------------------------------------
     8. 首页商品网格
     ---------------------------------------------------------- */
  function renderGrid() {
    var grid = $('#productGrid');
    var html = '';

    PRODUCTS.forEach(function (p) {
      html +=
        '<a class="card" href="#/product/' + p.id + '" data-product="' + p.id + '" ' +
        'aria-label="查看 ' + p.title + ' 详情">' +
          '<div class="card__media">' +
            (p.tag ? '<span class="card__tag">' + p.tag + '</span>' : '') +
            artFor(p.art) +
          '</div>' +
          '<div class="card__body">' +
            '<h3 class="card__title">' + p.title + '</h3>' +
            '<p class="card__desc">' + p.desc + '</p>' +
            '<div class="card__foot">' +
              '<span class="card__price">' + yuan(p.price) +
                (p.compareAt ? '<small><s>' + yuan(p.compareAt) + '</s></small>' : '') +
              '</span>' +
              '<span class="card__go">查看详情</span>' +
            '</div>' +
          '</div>' +
        '</a>';
    });

    grid.innerHTML = html;
  }

  /* ----------------------------------------------------------
     9. 商品详情页：数量调整 + 加入购物车
     ---------------------------------------------------------- */
  var detailQty = 1;

  function renderProduct(id) {
    var p = findProduct(id);
    var host = $('#productDetail');

    if (!p) {
      host.innerHTML =
        '<div class="empty" style="grid-column:1/-1">' +
          '<p class="empty__code">404</p>' +
          '<h1 class="empty__title">没有找到该商品</h1>' +
          '<p class="empty__desc">它可能已经下架了。</p>' +
          '<a class="btn btn--primary" href="#/" data-link>返回首页</a>' +
        '</div>';
      return;
    }

    detailQty = 1;

    host.innerHTML =
      // product-image
      '<div class="detail__media">' + artFor(p.art) + '</div>' +

      '<div class="detail__info">' +
        '<p class="detail__crumb">' + (p.tag || '青禾优选') + '</p>' +
        // product-title
        '<h1 class="detail__title">' + p.title + '</h1>' +
        // product-desc
        '<p class="detail__desc">' + p.desc + '</p>' +

        '<div class="detail__specs">' +
          p.specs.map(function (s) { return '<span>' + s + '</span>'; }).join('') +
        '</div>' +

        // product-price
        '<div class="detail__price">' +
          '<strong>' + yuan(p.price) + '</strong>' +
          (p.compareAt ? '<s>' + yuan(p.compareAt) + '</s><em>立省 ' + yuan(p.compareAt - p.price) + '</em>' : '') +
        '</div>' +

        // product-quantity：数量 − 1 ＋
        '<div class="qty">' +
          '<span class="qty__label">数量</span>' +
          '<div class="stepper" role="group" aria-label="数量调整">' +
            '<button class="stepper__btn" type="button" data-step="-1" aria-label="减少数量">−</button>' +
            '<input class="stepper__value" id="qtyValue" type="number" value="1" ' +
              'min="' + LIMITS.min + '" max="' + LIMITS.max + '" aria-label="购买数量" />' +
            '<button class="stepper__btn" type="button" data-step="1" aria-label="增加数量">＋</button>' +
          '</div>' +
          '<span class="qty__subtotal">小计<strong id="qtySubtotal">' + yuan(p.price) + '</strong></span>' +
        '</div>' +

        '<div class="detail__actions">' +
          // product-cart / product-cart-label
          '<button class="btn btn--primary" id="addToCart" type="button">加入购物车</button>' +
          '<button class="btn btn--outline" id="buyNow" type="button">立即购买</button>' +
        '</div>' +

        '<div class="detail__meta">' +
          '<span>48 小时内发货</span><span>7 天无理由退换</span><span>正品保障</span>' +
        '</div>' +
      '</div>';

    bindDetail(p);
  }

  function bindDetail(p) {
    var input = $('#qtyValue');
    var sub = $('#qtySubtotal');
    var btnMinus = document.querySelector('.stepper__btn[data-step="-1"]');
    var btnPlus = document.querySelector('.stepper__btn[data-step="1"]');

    function paint() {
      input.value = String(detailQty);
      sub.textContent = yuan(p.price * detailQty);
      btnMinus.disabled = detailQty <= LIMITS.min;
      btnPlus.disabled = detailQty >= LIMITS.max;
    }

    function setQty(next, announce) {
      var clamped = clamp(Math.round(Number(next) || LIMITS.min), LIMITS.min, LIMITS.max);
      if (announce && clamped !== Number(next)) {
        toast('单次最多购买 ' + LIMITS.max + ' 件', 'warn');
      }
      detailQty = clamped;
      paint();
    }

    btnMinus.addEventListener('click', function () { setQty(detailQty - 1); });
    btnPlus.addEventListener('click', function () { setQty(detailQty + 1); });

    input.addEventListener('input', function () {
      var v = parseInt(input.value, 10);
      if (!isNaN(v)) { setQty(v, false); }
    });
    input.addEventListener('blur', function () { setQty(input.value, true); });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); addToCart(); }
    });

    function addToCart() {
      Cart.add(p.id, detailQty);
      Nav.syncCart();
      toast('已加入购物车 · ' + p.title + ' × ' + detailQty);
      // 并入购物车后进行轻微视觉反馈
      var media = document.querySelector('.detail__media');
      if (media) {
        media.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(.975)' }, { transform: 'scale(1)' }],
          { duration: 300, easing: 'ease-out' }
        );
      }
    }

    $('#addToCart').addEventListener('click', addToCart);

    $('#buyNow').addEventListener('click', function () {
      if (!Auth.isLoggedIn()) {
        toast('请先登录后再结算', 'warn');
        Router.go('#/login');
        return;
      }
      Cart.add(p.id, detailQty);
      Nav.syncCart();
      CartUI.render();
      CartUI.open();
      toast('已加入购物车，请确认订单');
    });

    paint();
  }

  /* ----------------------------------------------------------
     10. 登录页表单
     ---------------------------------------------------------- */
  var Login = {
    init: function () {
      var self = this;
      this.form = $('#loginForm');
      this.phone = $('#phone');
      this.password = $('#password');
      this.phoneField = $('#field-phone');
      this.passwordField = $('#field-password');
      this.phoneError = $('#phoneError');
      this.passwordError = $('#passwordError');

      // 手机号仅允许数字
      this.phone.addEventListener('input', function () {
        var cleaned = self.phone.value.replace(/\D/g, '').slice(0, 11);
        if (cleaned !== self.phone.value) { self.phone.value = cleaned; }
        self.clearError(self.phoneField, self.phoneError);
      });

      this.password.addEventListener('input', function () {
        self.clearError(self.passwordField, self.passwordError);
      });

      // 显示 / 隐藏密码
      $('#passwordToggle').addEventListener('click', function () {
        var showing = self.password.type === 'text';
        self.password.type = showing ? 'password' : 'text';
        this.textContent = showing ? '显示' : '隐藏';
        this.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
      });

      // 体验账号
      $('#fillDemo').addEventListener('click', function () {
        self.phone.value = '13800138000';
        self.password.value = 'qinghe123';
        self.clearError(self.phoneField, self.phoneError);
        self.clearError(self.passwordField, self.passwordError);
        toast('已填入体验账号，点击登录');
      });

      this.form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        self.submit();
      });
    },

    setError: function (field, errorEl, message) {
      field.classList.add('is-invalid');
      errorEl.textContent = message;
      errorEl.hidden = false;
    },

    clearError: function (field, errorEl) {
      field.classList.remove('is-invalid');
      errorEl.hidden = true;
      errorEl.textContent = '';
    },

    validate: function () {
      var ok = true;
      var phone = this.phone.value.trim();
      var password = this.password.value;

      this.clearError(this.phoneField, this.phoneError);
      this.clearError(this.passwordField, this.passwordError);

      if (!phone) {
        this.setError(this.phoneField, this.phoneError, '请输入手机号');
        ok = false;
      } else if (!/^1[3-9]\d{9}$/.test(phone)) {
        this.setError(this.phoneField, this.phoneError, '手机号格式不正确（11 位，以 1 开头）');
        ok = false;
      }

      if (!password) {
        this.setError(this.passwordField, this.passwordError, '请输入密码');
        ok = false;
      } else if (password.length < 6) {
        this.setError(this.passwordField, this.passwordError, '密码至少 6 位');
        ok = false;
      }

      return ok;
    },

    submit: function () {
      if (!this.validate()) {
        toast('请检查表单填写', 'warn');
        var bad = this.form.querySelector('.field.is-invalid .field__input');
        if (bad) { bad.focus(); }
        return;
      }

      var remember = $('#remember').checked;
      Auth.login(this.phone.value.trim(), remember);
      Nav.sync('login');

      var self = this;
      var btn = $('#loginSubmit');
      btn.disabled = true;
      btn.textContent = '登录中…';

      window.setTimeout(function () {
        btn.disabled = false;
        btn.textContent = '登录';
        self.form.reset();
        self.clearError(self.phoneField, self.phoneError);
        self.clearError(self.passwordField, self.passwordError);
        self.password.type = 'password';
        $('#passwordToggle').textContent = '显示';
        toast('登录成功，欢迎回来');
        Router.go('#/');
      }, 520);
    }
  };

  /* ----------------------------------------------------------
     11. 购物车抽屉
     ---------------------------------------------------------- */
  var CartUI = {
    init: function () {
      var self = this;
      this.drawer = $('#cartDrawer');
      this.body = $('#cartBody');

      $('#cartClose').addEventListener('click', function () { self.close(); });
      $('#cartMask').addEventListener('click', function () { self.close(); });

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && self.isOpen()) { self.close(); }
      });

      $('#cartClear').addEventListener('click', function () {
        if (!Cart.count()) { return; }
        Cart.clear();
        Nav.syncCart();
        self.render();
        toast('购物车已清空');
      });

      $('#cartCheckout').addEventListener('click', function () {
        if (!Cart.count()) { toast('购物车还是空的', 'warn'); return; }
        if (!Auth.isLoggedIn()) {
          toast('请先登录后再结算', 'warn');
          self.close();
          Router.go('#/login');
          return;
        }
        toast('演示站点：订单已提交，共 ' + Cart.count() + ' 件');
        Cart.clear();
        Nav.syncCart();
        self.render();
      });

      // 抽屉内数量调整（事件委托）
      this.body.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-cart-step]');
        if (btn) {
          var id = btn.getAttribute('data-id');
          var step = Number(btn.getAttribute('data-cart-step'));
          var line = Cart.find(id);
          if (!line) { return; }
          Cart.setQty(id, line.qty + step);
          Nav.syncCart();
          self.render();
          return;
        }
        var del = ev.target.closest('[data-cart-remove]');
        if (del) {
          Cart.remove(del.getAttribute('data-id'));
          Nav.syncCart();
          self.render();
          toast('已移出购物车');
        }
      });
    },

    isOpen: function () { return this.drawer.classList.contains('is-open'); },

    open: function () {
      this.render();
      this.drawer.hidden = false;
      var self = this;
      window.requestAnimationFrame(function () { self.drawer.classList.add('is-open'); });
      document.body.style.overflow = 'hidden';
      $('#cartClose').focus();
    },

    close: function () {
      var self = this;
      this.drawer.classList.remove('is-open');
      document.body.style.overflow = '';
      window.setTimeout(function () {
        if (!self.isOpen()) { self.drawer.hidden = true; }
      }, 340);
    },

    render: function () {
      var body = this.body;

      if (!Cart.items.length) {
        body.innerHTML =
          '<div class="cart-empty">' +
            '<div class="cart-empty__icon">🧺</div>' +
            '<p>购物车还是空的</p>' +
            '<p style="margin-top:6px;font-size:13px">去首页挑一件喜欢的好物吧</p>' +
          '</div>';
      } else {
        body.innerHTML = Cart.items.map(function (line) {
          var p = findProduct(line.id);
          return '' +
            '<div class="cart-item">' +
              '<div class="cart-item__media">' + artFor(p.art) + '</div>' +
              '<div>' +
                '<p class="cart-item__title">' + p.title + '</p>' +
                '<p class="cart-item__price">' + yuan(p.price) + '</p>' +
              '</div>' +
              '<div class="cart-item__ctrl">' +
                '<div class="mini-stepper">' +
                  '<button type="button" data-cart-step="-1" data-id="' + p.id + '" ' +
                    (line.qty <= LIMITS.min ? 'disabled' : '') + ' aria-label="减少">−</button>' +
                  '<span>' + line.qty + '</span>' +
                  '<button type="button" data-cart-step="1" data-id="' + p.id + '" ' +
                    (line.qty >= LIMITS.max ? 'disabled' : '') + ' aria-label="增加">＋</button>' +
                '</div>' +
                '<button type="button" class="link-btn" data-cart-remove data-id="' + p.id + '" ' +
                  'style="font-size:12px;border:0">移除</button>' +
              '</div>' +
            '</div>';
        }).join('');
      }

      $('#cartTotal').textContent = yuan(Cart.total());
      var clearBtn = $('#cartClear');
      clearBtn.style.visibility = Cart.items.length ? 'visible' : 'hidden';
    }
  };

  /* ----------------------------------------------------------
     12. Banner「立即探索」 → 滚动到精选商品
     ---------------------------------------------------------- */
  function bindBanner() {
    $('#bannerCta').addEventListener('click', function () {
      var featured = document.getElementById('featured');
      if (featured) {
        featured.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('已为你展开精选好物');
      }
    });
  }

  /* ----------------------------------------------------------
     13. 启动
     ---------------------------------------------------------- */
  function boot() {
    Auth.load();
    Cart.load();

    renderGrid();
    Login.init();
    Nav.init();
    CartUI.init();
    bindBanner();

    // 外部锚点（如 #/#featured）也要触发渲染
    // 注意：必须用包装函数，直接把 Router.render 作为监听器会丢失 this，导致跳转静默失败
    window.addEventListener('hashchange', function () { Router.render(); });

    Router.render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
