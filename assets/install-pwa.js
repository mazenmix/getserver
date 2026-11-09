/* MX GetServer — unobtrusive PWA install CTA. Keeps IPTV data and views untouched. */
(() => {
  'use strict';
  const INSTALLED_KEY = 'mx-getserver-pwa-installed-v1';
  const header = document.querySelector('header.top');
  if (!header || document.getElementById('mx-install-now')) return;

  let deferredPrompt = null;
  const getStoredFlag = () => { try { return localStorage.getItem(INSTALLED_KEY) === 'yes'; } catch { return false; } };
  const setStoredFlag = value => { try { if (value) localStorage.setItem(INSTALLED_KEY, 'yes'); else localStorage.removeItem(INSTALLED_KEY); } catch {} };
  const displayInstalled = () => (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true
  );
  if (displayInstalled()) setStoredFlag(true);

  const style = document.createElement('style');
  style.id = 'mx-pwa-install-style';
  style.textContent = `
    header.top.mx-has-install{justify-content:space-between!important;flex-wrap:nowrap;gap:10px}
    header.top.mx-has-install .brand{margin-left:auto;min-width:0}
    #mx-install-now{display:inline-flex;align-items:center;justify-content:center;gap:9px;flex:0 0 auto;position:relative;isolation:isolate;min-height:41px;padding:9px 16px;border:1px solid #ff739d;border-radius:12px;color:#fff;font-size:13px;font-weight:800;letter-spacing:.15px;white-space:nowrap;background:linear-gradient(120deg,#ec3766 0%,#c72a63 52%,#892b7b 100%);box-shadow:0 5px 20px #ed3c7152,inset 0 1px #ffffff4d;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
    #mx-install-now::before{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1;background:linear-gradient(105deg,transparent 20%,#ffffff28 46%,transparent 68%);background-size:220% 100%;animation:mx-install-sheen 5s ease-in-out infinite}
    #mx-install-now svg{height:17px;width:17px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
    #mx-install-now:hover{transform:translateY(-2px);box-shadow:0 8px 25px #fa41757c;border-color:#ffa5bd}
    #mx-install-now:active{transform:translateY(0)}
    #mx-install-now:focus-visible{outline:2px solid #67e7ef;outline-offset:3px}
    #mx-install-now[hidden]{display:none!important}
    @keyframes mx-install-sheen{0%,20%{background-position:200% 0}52%,100%{background-position:-100% 0}}
    #mx-install-help{max-width:min(430px,calc(100vw - 30px));width:100%;padding:0;border:1px solid #a5436c;border-radius:20px;background:linear-gradient(145deg,#1d2034,#101522);color:#f5f7fc;box-shadow:0 28px 90px #000b,0 0 24px #e94b622b}
    #mx-install-help::backdrop{background:#050716c7;backdrop-filter:blur(5px)}
    #mx-install-help .mx-pwa-content{padding:25px}
    #mx-install-help h2{margin:0 0 12px;font-size:21px;font-weight:850}
    #mx-install-help p{margin:0 0 17px;font-size:14px;line-height:1.65;color:#c1c9dd}
    #mx-install-help .mx-pwa-steps{margin:0 0 22px;padding-left:22px;font-size:14px;line-height:2.05;color:#e6ebf7}
    #mx-install-help .mx-pwa-actions{display:flex;justify-content:flex-end}
    #mx-install-help .mx-pwa-close{padding:10px 21px;border:1px solid #e76a8e;border-radius:10px;background:linear-gradient(125deg,#ec416b,#a42d5c);color:white;font-size:13px;font-weight:750}
    @media(max-width:530px){
      header.top.mx-has-install{gap:6px}
      #mx-install-now{min-height:36px;padding:7px 10px;gap:6px;font-size:11px;border-radius:10px}
      #mx-install-now svg{width:15px;height:15px}
      header.top.mx-has-install .brand-name{font-size:clamp(17px,5.2vw,22px)}
    }
    @media(prefers-reduced-motion:reduce){#mx-install-now::before{animation:none}#mx-install-now{transition:none}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'mx-install-now';
  button.type = 'button';
  button.setAttribute('aria-label', 'Install MX GetServer');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 17v3h14v-3"/></svg><span>Install Now</span>';
  header.insertBefore(button, header.firstChild);

  const syncVisibility = () => {
    const installed = displayInstalled() || getStoredFlag();
    button.hidden = installed;
    header.classList.toggle('mx-has-install', !installed);
  };

  let dialog = null;
  const showGuide = () => {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'mx-install-help';
      dialog.setAttribute('aria-labelledby', 'mx-install-help-title');
      dialog.innerHTML = '<div class="mx-pwa-content"><h2 id="mx-install-help-title">Install MX GetServer</h2><p id="mx-install-guide-intro"></p><ol class="mx-pwa-steps" id="mx-install-guide-steps"></ol><div class="mx-pwa-actions"><button type="button" class="mx-pwa-close">Got it</button></div></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('.mx-pwa-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(navigator.userAgent);
    const intro = dialog.querySelector('#mx-install-guide-intro');
    const steps = dialog.querySelector('#mx-install-guide-steps');
    intro.textContent = ios
      ? 'Add MX GetServer to your Home Screen to open it like an app.'
      : 'Your browser has not offered the direct install prompt yet. You can install from its menu when supported.';
    const lines = ios
      ? ['Tap the Share button in your browser.', 'Select Add to Home Screen.', 'Tap Add. Open MX GetServer from its new icon.']
      : android
        ? ['Open your browser menu (⋮).', 'Choose Install app or Add to Home screen, if offered.', 'Confirm the installation.']
        : ['Open the Chrome or Edge browser menu (⋮).', 'Choose Install MX GetServer or Apps → Install this site as an app, if offered.', 'Confirm the installation.'];
    steps.replaceChildren(...lines.map(line => { const li = document.createElement('li'); li.textContent = line; return li; }));
    if (!dialog.open) dialog.showModal();
  };

  button.addEventListener('click', async () => {
    if (!deferredPrompt) { showGuide(); return; }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice; // appinstalled is the authoritative signal to hide it.
    } catch (error) {
      console.info('MX GetServer native installation was unavailable:', error);
      showGuide();
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    // If the browser offers the install prompt again after an uninstall, show the CTA again.
    setStoredFlag(false);
    syncVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setStoredFlag(true);
    syncVisibility();
  });
  const media = window.matchMedia('(display-mode: standalone)');
  if (media.addEventListener) media.addEventListener('change', syncVisibility);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncVisibility(); });
  window.addEventListener('storage', event => { if (event.key === INSTALLED_KEY) syncVisibility(); });

  syncVisibility();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch(error => console.warn('MX GetServer PWA worker registration failed:', error));
    }, { once: true });
  }
})();
