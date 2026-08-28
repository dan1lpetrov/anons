window.AdminShared = (function () {
  const PAGES = [
    { key: 'sales', href: '/admin', label: 'Розпродажі' },
    { key: 'upload', href: '/admin/upload', label: 'Додати розпродаж' },
    { key: 'weights', href: '/admin/weights', label: 'Ваги ранжування' },
  ];

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
      a.textContent = page.label;
      nav.appendChild(a);
    });

    const spacer = document.createElement('div');
    spacer.className = 'admin-nav__spacer';
    nav.appendChild(spacer);

    const account = document.createElement('div');
    account.className = 'admin-nav__account';
    account.textContent = email;
    nav.appendChild(account);

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'secondary';
    logoutBtn.textContent = 'Вийти';
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

  return { setStatus, init };
})();
