window.AdminShared = (function () {
  const PAGES = [
    { key: 'dashboard', href: '/admin', label: 'Дашборд', icon: 'dashboard' },
    { key: 'orders', href: '/admin/orders', label: 'Замовлення', icon: 'shoppingBag' },
    { key: 'sales', href: '/admin/sales', label: 'Розпродажі', icon: 'tag' },
    { key: 'upload', href: '/admin/upload', label: 'Додати розпродаж', icon: 'upload' },
    { key: 'banners', href: '/admin/banners', label: 'Банери', icon: 'image' },
    { key: 'weights', href: '/admin/weights', label: 'Ваги ранжування', icon: 'sliders' },
  ];

  const ICONS = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    logOut: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    shoppingBag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    dollarSign: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    trendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    trendingDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.986L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
    alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  };

  function icon(name, size) {
    size = size || 16;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  }

  const THEME_KEY = 'anons-admin-theme';

  function applyTheme(mode) {
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || 'system';
    } catch {
      return 'system';
    }
  }

  function setStoredTheme(mode) {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // ignore (private mode / storage disabled)
    }
    applyTheme(mode);
  }

  // Runs immediately on script load (before nav renders) so the page never flashes
  // the wrong theme — admin.html's inline boot script also does this pre-paint.
  applyTheme(getStoredTheme());

  function renderThemeToggle() {
    const wrap = document.createElement('div');
    wrap.className = 'admin-nav__theme';
    const current = getStoredTheme();
    [
      ['light', 'sun'],
      ['system', 'monitor'],
      ['dark', 'moon'],
    ].forEach(([mode, iconName]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = mode === current ? 'active' : '';
      btn.innerHTML = icon(iconName, 14);
      btn.setAttribute('aria-label', mode);
      btn.addEventListener('click', () => {
        setStoredTheme(mode);
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function setStatus(el, kind, text) {
    el.className = 'status ' + kind;
    el.textContent = text;
  }

  function renderNav(activeKey, email) {
    const nav = document.createElement('nav');
    nav.className = 'admin-nav';

    const brand = document.createElement('div');
    brand.className = 'admin-nav__brand';
    brand.textContent = 'Anons Admin';
    nav.appendChild(brand);

    PAGES.forEach((page) => {
      const a = document.createElement('a');
      a.href = page.href;
      a.className = 'admin-nav__link' + (page.key === activeKey ? ' active' : '');
      a.innerHTML = icon(page.icon) + `<span>${page.label}</span>`;
      nav.appendChild(a);
    });

    const spacer = document.createElement('div');
    spacer.className = 'admin-nav__spacer';
    nav.appendChild(spacer);

    nav.appendChild(renderThemeToggle());

    const account = document.createElement('div');
    account.className = 'admin-nav__account';
    account.textContent = email;
    nav.appendChild(account);

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'secondary';
    logoutBtn.innerHTML = icon('logOut', 14) + '<span>Вийти</span>';
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      location.href = '/admin';
    });
    nav.appendChild(logoutBtn);

    return nav;
  }

  // Checks the admin session, then either reveals #app (with a rendered sidebar dropped
  // into #nav) or reveals #loginScreen. Every admin page shares this same gate + shell.
  async function init(activeKey) {
    const loginScreen = document.getElementById('loginScreen');
    const appShell = document.getElementById('app');
    const navSlot = document.getElementById('nav');

    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('unauthorized');
      const { email } = await res.json();
      loginScreen.classList.add('hidden');
      appShell.classList.remove('hidden');
      navSlot.replaceWith(renderNav(activeKey, email));
      return email;
    } catch {
      loginScreen.classList.remove('hidden');
      appShell.classList.add('hidden');
      return null;
    }
  }

  return { setStatus, init, icon };
})();
