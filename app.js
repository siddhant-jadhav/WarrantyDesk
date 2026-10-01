/* ==========================================================================
   WarrantyDesk — customer mobile app prototype
   Scan → identify → register → digital warranty → claim & service tracking.
   Plain JS, no build step: every screen is a pure function of `state`.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     Demo data — fictional, taken from the design specification (§15)
     ------------------------------------------------------------------------ */

  // Fixed "today" so dates and day counts read the same whenever the demo runs.
  const DEMO_TODAY = new Date(2026, 9, 2); // 02 Oct 2026

  const D = {
    customer: { name: 'Rahul Sharma', initials: 'RS' },
    product: {
      name: 'Frost-Free Refrigerator 340L',
      short: 'Refrigerator 340L',
      model: 'RF340X',
      serial: 'SN8F92K21',
      category: 'Refrigerator',
      type: 'Frost-Free · Double Door',
      capacity: '340 L',
    },
    warrantyId: 'WRN-2026-008421',
    warrantyMonths: 12,
    purchaseDate: '2026-08-15',
    dealer: 'HomeStyle Electronics, Andheri West',
    invoiceFile: 'Invoice_HS-55821.pdf',
    claim: {
      id: 'CLM-10284',
      issue: 'Cooling not working',
      note: 'Fridge section stopped cooling since yesterday. Freezer still works.',
    },
    centre: {
      name: 'ABC Authorised Service Centre',
      area: 'Andheri East, Mumbai',
      address: 'Unit 12, Sunrise Industrial Estate, Andheri East, Mumbai 400069',
      distance: '3.2 km',
      phone: '+91 22 5550 1284',
      hours: 'Mon–Sat · 9:00 AM – 7:00 PM',
      authId: 'ASC-MUM-0412',
    },
    other: { name: 'Inverter Microwave 28L', serial: 'SN3K71D09', until: '12 Nov 2026' },
  };

  const ISSUES = ['Cooling not working', 'Unusual noise', 'Water leakage', 'Door seal issue', 'Display error', 'Other'];

  // Claim lifecycle (§10, §17). `claim.done` = number of completed stages (1–5).
  const STAGES = [
    { key: 'submitted', title: 'Claim Submitted', icon: 'file-text',
      at: '02 Oct 2026 · 10:14 AM', now: '',
      note: (s) => `Issue reported: ${esc(s.claim.issue)}` },
    { key: 'verified', title: 'Warranty Verified', icon: 'shield-check',
      at: '02 Oct 2026 · 10:15 AM', now: 'Checking serial against warranty records…',
      note: () => `Auto-verified against S/N <span class="mono">${D.product.serial}</span>` },
    { key: 'assigned', title: 'Service Centre Assigned', icon: 'wrench',
      at: '02 Oct 2026 · 11:40 AM', now: 'Finding the nearest authorised centre…',
      note: () => D.centre.name },
    { key: 'visit', title: 'Technician Visit', icon: 'user',
      at: '05 Oct 2026 · 11:20 AM', now: 'Scheduled · Mon, 05 Oct · 10 AM – 1 PM',
      note: () => 'Faulty thermostat replaced on site' },
    { key: 'resolved', title: 'Resolved', icon: 'check-circle',
      at: '05 Oct 2026 · 12:05 PM', now: 'Awaiting your repair confirmation',
      note: () => 'Cooling restored · repair fully covered (₹0)' },
  ];

  const STAGE_SUMMARY = [
    '',
    'Claim received. Your warranty is being verified against the product serial number.',
    'Warranty confirmed. The nearest authorised service centre is being assigned.',
    `<b>${D.centre.name}</b> will visit on <b>Mon, 05 Oct</b> between 10 AM and 1 PM.`,
    'The technician has completed the repair. Please confirm everything works.',
    'Claim closed. The repair was fully covered under your warranty.',
  ];

  // Consistent status vocabulary (§17): tone + label.
  const STATUS = {
    active:    { tone: 'ok',      label: 'Warranty Active' },
    expiring:  { tone: 'warn',    label: 'Expiring Soon' },
    expired:   { tone: 'bad',     label: 'Warranty Expired' },
    unregistered: { tone: 'warn', label: 'Warranty Not Registered' },
    submitted: { tone: 'info',    label: 'Claim Submitted' },
    verified:  { tone: 'info',    label: 'Warranty Verified' },
    assigned:  { tone: 'info',    label: 'Service Centre Assigned' },
    visit:     { tone: 'info',    label: 'Technician Visit' },
    resolved:  { tone: 'ok',      label: 'Resolved' },
    rejected:  { tone: 'bad',     label: 'Rejected' },
    inforeq:   { tone: 'warn',    label: 'Info Required' },
  };

  // Presenter script (§14).
  const STEPS = [
    { title: 'Scan Your Product', say: 'Customer scans the QR code or serial number on the appliance.' },
    { title: 'Product Found', say: 'The system identifies the appliance and retrieves its product and warranty information.',
      sayRegistered: 'WarrantyDesk recognises this serial number is already registered: it blocks duplicate registration and goes straight to warranty details and Raise a Claim.' },
    { title: 'Register Warranty', say: 'Most product information is pre-populated, reducing manual entry.' },
    { title: 'Digital Warranty Card', say: 'The customer now has a digital, verifiable warranty instead of relying on a paper card.' },
    { title: 'Claim & Service Tracking', say: 'The customer can raise a claim and track it through authorised service-centre processing.' },
  ];
  const SCREEN_STEP = { home: 0, scan: 1, product: 2, register: 3, success: 3, warranty: 4, claim: 5 };

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const parseISO = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  const dayDiff = (a, b) => Math.round((b - a) / 864e5);

  function warrantyInfo(s) {
    const start = parseISO(s.purchaseDate) || parseISO(D.purchaseDate);
    const end = addMonths(start, D.warrantyMonths);
    const total = dayDiff(start, end);
    const left = dayDiff(DEMO_TODAY, end);
    const status = left < 0 ? 'expired' : left <= 60 ? 'expiring' : 'active';
    return {
      startText: fmtDate(start),
      endText: fmtDate(end),
      left: Math.max(0, left),
      pct: Math.min(100, Math.max(0, (left / total) * 100)),
      status,
    };
  }

  const pill = (key, extra = '') => `<span class="pill tone-${STATUS[key].tone} ${extra}">${STATUS[key].label}</span>`;
  const claimKey = (c) => STAGES[c.done - 1].key;
  const claimTone = (c) => STATUS[claimKey(c)].tone;
  const segbar = (done) => `<span class="segbar">${STAGES.map((_, i) => `<i class="${i < done ? 'on' : i === done ? 'now' : ''}"></i>`).join('')}</span>`;

  /* ------------------------------------------------------------------------
     Artwork (inline SVG, no external assets)
     ------------------------------------------------------------------------ */

  const FRIDGE = `<svg class="art art-fridge" viewBox="0 0 120 204" aria-hidden="true">
    <ellipse cx="60" cy="198" rx="48" ry="5" fill="#0F1B24" opacity=".14"/>
    <rect x="22" y="189" width="12" height="8" rx="2" fill="#7E8A92"/><rect x="86" y="189" width="12" height="8" rx="2" fill="#7E8A92"/>
    <rect x="12" y="4" width="96" height="188" rx="10" fill="url(#g-body)" stroke="#AEB8BF"/>
    <rect x="15.5" y="7.5" width="89" height="58" rx="7.5" fill="url(#g-door)" stroke="#C3CBD1" stroke-width=".8"/>
    <rect x="15.5" y="69" width="89" height="119.5" rx="7.5" fill="url(#g-door)" stroke="#C3CBD1" stroke-width=".8"/>
    <rect x="92" y="34" width="5" height="26" rx="2.5" fill="url(#g-handle)"/>
    <rect x="92" y="75" width="5" height="46" rx="2.5" fill="url(#g-handle)"/>
    <rect x="26" y="82" width="24" height="13" rx="3.5" fill="#15232B"/>
    <rect x="29.5" y="86" width="9" height="5" rx="1.2" fill="#3EE6B0"/><rect x="41" y="86" width="5.5" height="5" rx="1.2" fill="#6C8A96"/>
    <path d="M22 11h11l-9 51h-6z" fill="#fff" opacity=".5"/>
    <path d="M22 73h11l-9 112h-6z" fill="#fff" opacity=".42"/>
  </svg>`;

  const MICROWAVE = `<svg class="art art-mw" viewBox="0 0 160 104" aria-hidden="true">
    <ellipse cx="80" cy="99" rx="66" ry="4" fill="#0F1B24" opacity=".14"/>
    <rect x="24" y="92" width="14" height="6" rx="2" fill="#7E8A92"/><rect x="122" y="92" width="14" height="6" rx="2" fill="#7E8A92"/>
    <rect x="8" y="8" width="144" height="86" rx="9" fill="url(#g-body)" stroke="#AEB8BF"/>
    <rect x="16" y="16" width="100" height="70" rx="6" fill="#1A262D"/>
    <rect x="22" y="22" width="88" height="58" rx="4" fill="url(#g-glass)"/>
    <path d="M30 24h14l-12 54h-8z" fill="#fff" opacity=".12"/>
    <rect x="124" y="18" width="20" height="10" rx="2.5" fill="#15232B"/><rect x="127" y="21" width="8" height="4" rx="1" fill="#3EE6B0"/>
    <circle cx="134" cy="44" r="7" fill="#C9D1D7" stroke="#A3AEB6"/>
    <rect x="124" y="58" width="20" height="5" rx="2.5" fill="#B3BDC4"/><rect x="124" y="67" width="20" height="5" rx="2.5" fill="#B3BDC4"/><rect x="124" y="76" width="20" height="5" rx="2.5" fill="#B3BDC4"/>
  </svg>`;

  // Deterministic QR-style matrix with real finder/timing/alignment patterns.
  const QR_N = 25;
  const QR_PATH = (() => {
    let seed = 20260815;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const m = Array.from({ length: QR_N }, () => Array.from({ length: QR_N }, () => (rnd() > 0.52 ? 1 : 0)));
    const finder = (r, c) => {
      for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
        const y = r + i, x = c + j;
        if (y < 0 || x < 0 || y >= QR_N || x >= QR_N) continue;
        const ring = i === 0 || i === 6 || j === 0 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        m[y][x] = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (ring || core) ? 1 : 0;
      }
    };
    finder(0, 0); finder(0, QR_N - 7); finder(QR_N - 7, 0);
    for (let i = 8; i < QR_N - 8; i++) { m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0; }
    const a = QR_N - 9;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      m[a + i][a + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0;
    }
    let d = '';
    m.forEach((row, y) => row.forEach((v, x) => { if (v) d += `M${x} ${y}h1v1h-1z`; }));
    return d;
  })();
  const qrSVG = (size, fg = '#0F1B24', bg = 'transparent') =>
    `<svg width="${size}" height="${size}" viewBox="-1 -1 ${QR_N + 2} ${QR_N + 2}" shape-rendering="crispEdges" aria-hidden="true"><rect x="-1" y="-1" width="${QR_N + 2}" height="${QR_N + 2}" fill="${bg}"/><path d="${QR_PATH}" fill="${fg}"/></svg>`;

  const BARCODE = (() => {
    let seed = 92, x = 0, bar = true, d = '';
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    while (x < 228) {
      const w = 1 + Math.floor(rnd() * 3);
      if (bar) d += `M${x} 0h${w}v30h-${w}z`;
      x += w; bar = !bar;
    }
    return `<svg width="100%" height="30" viewBox="0 0 230 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="#141414"/></svg>`;
  })();

  // Fine guilloche lines — the "security print" texture of a certificate.
  const GUILLOCHE = (() => {
    let d = '';
    for (let k = 0; k < 16; k++) {
      const amp = 10 + k * 2.4, y0 = 30 + k * 28;
      d += `M-10 ${y0}`;
      for (let x = 0; x <= 370; x += 10) d += ` L${x} ${(y0 + Math.sin((x / 360) * Math.PI * 4 + k * 0.55) * amp).toFixed(1)}`;
    }
    return `<svg class="wcard-pattern" viewBox="0 0 360 480" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="#fff" stroke-width=".8"/></svg>`;
  })();

  const MAP = `<svg class="map" viewBox="0 0 350 150" aria-hidden="true">
    <rect width="350" height="150" fill="#E5ECEA"/>
    <path d="M0 112C80 92 120 132 200 106S320 82 350 96V150H0z" fill="#CFE5DC"/>
    <g stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none"><path d="M-10 40H360M90-10V160M252-10 212 160"/></g>
    <g stroke="#fff" stroke-width="5" fill="none" opacity=".9"><path d="M-10 84H360M160-10V160M306-10V160"/></g>
    <path d="M90 120V84h70V40h83" stroke="#0A5C63" stroke-width="3.5" stroke-dasharray="1 7" stroke-linecap="round" fill="none"/>
    <circle cx="90" cy="120" r="7" fill="#2E6BF0" stroke="#fff" stroke-width="3"/>
    <path d="M243 40c-9-12-15-18-15-25a15 15 0 0 1 30 0c0 7-6 13-15 25z" fill="#0A5C63"/>
    <circle cx="243" cy="15" r="5.5" fill="#fff"/>
  </svg>`;

  const SB_ICONS = `<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true"><rect y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" width="3" height="12" rx="1"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4C5.2.4 2.7 1.5.8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.6l1.5-1.7c-.4-.4-.9-.6-1.5-.6z"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" opacity=".45"/></svg>`;

  /* ------------------------------------------------------------------------
     Shared chrome
     ------------------------------------------------------------------------ */

  const statusBar = (light = false, overlay = false) =>
    `<div class="statusbar ${light ? 'statusbar--light' : ''} ${overlay ? 'statusbar--overlay' : ''}"><span>9:41</span><span class="sb-icons">${SB_ICONS}</span></div>`;

  const appBar = (title, right = '') => `<header class="appbar">
      <button class="iconbtn" data-action="back" aria-label="Back">${ic('arrow-left')}</button>
      <h1 class="appbar-title">${title}</h1>
      ${right || '<span></span>'}
    </header>`;

  const tabBar = (active) => `<nav class="tabbar" aria-label="Main">
    ${[['home', 'Home', 'home'], ['warranty', 'Warranties', 'shield'], ['claim', 'Claims', 'clipboard']]
      .map(([id, label, icon]) => `<button class="tab ${active === id ? 'is-active' : ''}" data-action="tab" data-arg="${id}" ${active === id ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span></button>`).join('')}
  </nav>`;

  const kvRow = (label, value) => `<div class="kv-row"><dt>${label}</dt><dd>${value}</dd></div>`;

  /* ------------------------------------------------------------------------
     Screens
     ------------------------------------------------------------------------ */

  const SCREENS = {};

  /* ---- Home (supporting hub, §13) ---- */
  SCREENS.home = (s) => {
    const w = warrantyInfo(s);
    const fridgeStatus = s.registered
      ? `${pill(w.status, 'pill--sm')}<span class="prod-until">until ${w.endText}</span>`
      : `${pill('unregistered', 'pill--sm')}<span class="prod-until">Tap to register</span>`;
    const quick = (icon, label, action, arg = '') =>
      `<button class="quick-btn" data-action="${action}" data-arg="${arg}"><span class="quick-ic">${ic(icon)}</span><span>${label}</span></button>`;

    return `${statusBar()}
    <div class="scroll">
      <header class="home-head">
        <div><p class="home-greet">Good morning,</p><h1 class="home-name">${D.customer.name}</h1></div>
        <span class="avatar" aria-hidden="true">${D.customer.initials}</span>
      </header>

      <button class="scan-hero" data-action="go" data-arg="scan">
        <span class="scan-hero-copy">
          <span class="scan-hero-kicker">${ic('scan')} Smart scan</span>
          <span class="scan-hero-title">Scan your appliance</span>
          <span class="scan-hero-sub">QR code or serial number — we find your product and warranty instantly.</span>
          <span class="scan-hero-cta">${ic('camera')} Scan now</span>
        </span>
        <span class="scan-hero-art" aria-hidden="true">${qrSVG(58, '#fff')}<i class="hc tl"></i><i class="hc tr"></i><i class="hc bl"></i><i class="hc br"></i><i class="hl"></i></span>
      </button>

      <div class="quick">
        ${quick('scan', 'Scan Product', 'go', 'scan')}
        ${quick('file-text', 'Register Warranty', 'quick-register')}
        ${quick('wrench', 'Raise Claim', 'quick-raise')}
      </div>

      <div class="section-head"><h2>My products</h2><span class="section-count">2</span></div>
      <button class="prod-row" data-action="go" data-arg="${s.registered ? 'warranty' : 'product'}">
        <span class="prod-thumb">${FRIDGE}</span>
        <span class="prod-info">
          <span class="prod-name">${D.product.name}</span>
          <span class="prod-meta mono">S/N ${D.product.serial}</span>
          <span class="prod-status">${fridgeStatus}</span>
        </span>
        ${ic('chevron-right', 'ic-muted')}
      </button>
      <div class="prod-row">
        <span class="prod-thumb">${MICROWAVE}</span>
        <span class="prod-info">
          <span class="prod-name">${D.other.name}</span>
          <span class="prod-meta mono">S/N ${D.other.serial}</span>
          <span class="prod-status">${pill('expiring', 'pill--sm')}<span class="prod-until">until ${D.other.until}</span></span>
        </span>
      </div>

      ${s.claim ? `<div class="section-head" style="margin-top:16px"><h2>${s.claim.done < 5 ? 'Active claim' : 'Recent claim'}</h2></div>
      <button class="claim-mini tone-${claimTone(s.claim)}" data-action="go" data-arg="claim">
        <span class="claim-mini-top"><span class="claim-mini-id">Claim #${D.claim.id}</span>${pill(claimKey(s.claim), 'pill--sm')}</span>
        <span class="claim-mini-issue">${D.product.short} · ${esc(s.claim.issue)}</span>
        ${segbar(s.claim.done)}
        <span class="claim-mini-meta"><span>Step ${s.claim.done} of 5${s.claim.done < 5 ? ` · Next: ${STAGES[s.claim.done].title}` : ' · Completed'}</span>${ic('chevron-right')}</span>
      </button>` : ''}
    </div>
    ${tabBar('home')}`;
  };

  /* ---- Screen 1: Scan Your Product (§6) ---- */
  SCREENS.scan = (s) => {
    const phase = s.scanPhase; // idle | detecting | detected
    let chip;
    if (phase === 'detected') {
      chip = `<span class="scan-chip is-ok">${ic('check-circle')}<span>
          <span class="only-qr">QR code detected</span><span class="only-sn">Serial number read</span> · <b class="mono">${D.product.serial}</b>
          <small>Fetching product details…</small></span></span>`;
    } else if (phase === 'detecting') {
      chip = `<span class="scan-chip"><span class="spinner"></span><span><span class="only-qr">Reading QR code…</span><span class="only-sn">Reading serial number…</span></span></span>`;
    } else {
      chip = `<span class="scan-chip"><i class="pulse-dot"></i><span><span class="only-qr">Looking for a QR code…</span><span class="only-sn">Looking for a serial number…</span></span></span>`;
    }
    const busy = phase !== 'idle';

    return `
    <div class="cam" aria-hidden="true">
      <div class="cam-scene"><div class="cam-drift">
        <div class="cam-steel"></div><div class="cam-gasket"></div>
        <div class="sticker">
          <div class="stk-head"><span>FROST-FREE REFRIGERATOR</span><span>${D.product.capacity}</span></div>
          <div class="stk-rule"></div>
          <div class="stk-body">
            <div class="stk-qr">${qrSVG(132, '#141414', '#F7F7F2')}</div>
            <dl class="stk-specs">
              <div><dt>Model</dt><dd>${D.product.model}</dd></div>
              <div><dt>Rated</dt><dd>230 V ~ 50 Hz</dd></div>
              <div><dt>Refrigerant</dt><dd>R600a · 62 g</dd></div>
              <div><dt>Gross vol.</dt><dd>340 L</dd></div>
              <div><dt>Climate</dt><dd>N / ST / T</dd></div>
            </dl>
          </div>
          <div class="stk-sn"><span class="stk-sn-label">S/N</span><span class="stk-sn-val">${D.product.serial}</span></div>
          <div class="stk-bar">${BARCODE}</div>
        </div>
      </div></div>
    </div>

    ${statusBar(true, true)}
    <header class="scan-bar">
      <button class="glassbtn" data-action="back" aria-label="Back">${ic('arrow-left')}</button>
      <span class="scan-brand">${ic('shield-check')} WarrantyDesk</span>
      <button class="glassbtn ${s.torch ? 'is-on' : ''}" data-action="torch" aria-label="Flashlight" aria-pressed="${!!s.torch}">${ic('flash')}</button>
    </header>

    <div class="scan-heading">
      <h1>Scan Your Product</h1>
      <p>Find the label inside the door or on the back panel</p>
    </div>

    <button class="scan-frame is-${phase}" data-action="capture" aria-label="Scan now">
      <span class="frame-tag"><span class="only-qr">${ic('qr')}</span><span class="only-sn">${ic('serial')}</span><span class="only-qr">QR code</span><span class="only-sn">Serial number</span></span>
      <i class="corner c-tl"></i><i class="corner c-tr"></i><i class="corner c-bl"></i><i class="corner c-br"></i>
      <i class="scan-line"></i><i class="lock"></i>
    </button>

    <p class="scan-hint">
      <span class="only-qr">Align the <b>QR code</b> inside the frame</span>
      <span class="only-sn">Align the <b>serial number (S/N)</b> inside the frame</span>
      <small><span class="only-qr">The QR code links to your product’s serial number</span><span class="only-sn">Usually starts with “SN” — printed above the barcode</span></small>
    </p>

    <div class="scan-bottom">
      <div class="scan-status" aria-live="polite">${chip}</div>
      <div class="seg seg--glass" role="tablist" aria-label="Scan mode">
        <button role="tab" data-action="mode" data-arg="qr" aria-selected="${s.scanMode === 'qr'}" ${busy ? 'disabled' : ''}>${ic('qr')} Scan QR</button>
        <button role="tab" data-action="mode" data-arg="sn" aria-selected="${s.scanMode === 'sn'}" ${busy ? 'disabled' : ''}>${ic('serial')} Scan Serial No.</button>
      </div>
      <button class="shutter ${busy ? 'is-busy' : ''}" data-action="capture" aria-label="Scan now"><span></span></button>
      <button class="manual-link" data-action="sheet" data-arg="manual">${ic('keyboard')} Enter serial number manually</button>
    </div>`;
  };

  /* ---- Screen 2: Product Found (§7, §11 shortcut) ----
     The scan resolves the serial number's registration state, giving two distinct states:
       A — New product:        Warranty Not Registered → Register Warranty
       B — Registered product: Warranty Active → Raise a Claim (registration is blocked) */
  SCREENS.product = (s) => {
    const via = { qr: 'Identified via QR code', sn: 'Identified via S/N scan', manual: 'Found by S/N' }[s.foundVia] || 'Identified via QR code';
    const details = `<dl class="card kv">
        ${kvRow('Model', `<span class="mono">${D.product.model}</span>`)}
        ${kvRow('Serial number', `<span class="id-tag">Primary ID</span><span class="mono">${D.product.serial}</span>`)}
        ${kvRow('Category', `${D.product.category} · ${D.product.capacity}`)}
      </dl>`;
    const hero = (stateChip) => `<div class="pf-hero">
        ${FRIDGE}
        <span class="pf-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="pf-match">${ic('check-circle')} ${via}</span>
        ${stateChip}
      </div>
      <p class="pf-cat">${D.product.category} · ${D.product.type}</p>
      <h2 class="pf-name">${D.product.name}</h2>`;

    // State A — new, unregistered product
    if (!s.registered) {
      return `${statusBar()}
      ${appBar('Product Found')}
      <div class="scroll">
        ${hero(`<span class="pf-state tone-warn">${ic('clock')} New product</span>`)}

        <section class="card rs tone-warn" aria-label="Warranty registration status">
          <div class="rs-head">
            <span class="rs-ic">${ic('shield', 'ic-lg')}</span>
            <div>${pill('unregistered', 'pill--lg rs-pill')}<p class="rs-title">Registration required</p></div>
          </div>
          <p class="rs-text">This product has no warranty on record yet. Register it to activate your digital warranty card and enable service claims.</p>
          <dl class="rs-rows">
            <div><dt>Eligible cover</dt><dd>${D.warrantyMonths}-month manufacturer warranty</dd></div>
            <div><dt>Warranty ID</dt><dd class="is-muted">Not issued yet</dd></div>
          </dl>
          <ol class="rs-steps" aria-label="Next steps">
            <li class="is-done">${ic('check', 'ic-sm')}Found</li>
            <li class="is-next"><span>2</span>Register</li>
            <li><span>3</span>Digital card</li>
          </ol>
        </section>

        ${details}
        <p class="id-note">${ic('info')}<span>The serial number is this product’s permanent identifier. The QR code is a shortcut that links to it.</span></p>
      </div>
      <footer class="footer">
        <button class="btn btn-primary" data-action="go" data-arg="register">${ic('shield-check')} Register Warranty ${ic('arrow-right')}</button>
        <button class="btn btn-text" data-action="back">Not your product? Scan again</button>
      </footer>`;
    }

    // State B — already registered product
    const w = warrantyInfo(s);
    const tone = STATUS[w.status].tone;
    const activeClaim = s.claim && s.claim.done < 5;
    const claimCard = activeClaim ? `
      <section class="card found-claim">
        <div class="found-claim-top">
          <span class="found-claim-ic">${ic('clipboard')}</span>
          <div style="flex:1;min-width:0"><b>Active claim on this product</b><span>Claim #${D.claim.id} · ${esc(s.claim.issue)}</span></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">${pill(claimKey(s.claim), 'pill--sm')}<span class="prod-until">Step ${s.claim.done} of 5</span></div>
        <div class="tone-${claimTone(s.claim)}">${segbar(s.claim.done)}</div>
      </section>` : '';

    return `${statusBar()}
    ${appBar('Product Found')}
    <div class="scroll">
      ${hero(`<span class="pf-state tone-ok">${ic('shield-check')} Registered</span>`)}

      <section class="card rs tone-${tone}" aria-label="Warranty registration status">
        <div class="rs-head">
          <span class="rs-ic">${ic(w.status === 'expired' ? 'alert' : 'shield-check', 'ic-lg')}</span>
          <div>${pill(w.status, 'pill--lg rs-pill')}<p class="rs-title">${w.status === 'expired' ? 'Expired on' : 'Valid until'} ${w.endText}</p></div>
        </div>
        <dl class="rs-rows">
          <div><dt>Warranty ID</dt><dd class="mono">${D.warrantyId}</dd></div>
          <div><dt>Validity</dt><dd>${w.startText} – ${w.endText}</dd></div>
          <div><dt>Registered to</dt><dd>${D.customer.name} · ${esc(s.registeredOn)}</dd></div>
        </dl>
        <p class="rs-guard">${ic('lock', 'ic-sm')}<span><b>Already registered.</b> This serial number can be registered only once, so duplicate registration is blocked.</span></p>
      </section>

      ${claimCard}
      ${details}
    </div>
    <footer class="footer">
      <button class="btn btn-primary" data-action="sheet" data-arg="raise">${ic('wrench')} Raise a Claim</button>
      ${activeClaim
        ? `<div class="btn-row">
            <button class="btn btn-secondary btn-sm" data-action="go" data-arg="warranty">${ic('shield-check')} View Warranty</button>
            <button class="btn btn-secondary btn-sm" data-action="go" data-arg="claim">${ic('navigation')} Track Claim</button>
          </div>`
        : `<button class="btn btn-secondary" data-action="go" data-arg="warranty">${ic('shield-check')} View Warranty</button>`}
    </footer>`;
  };

  /* ---- Screen 3: Register Warranty (§8) ---- */
  SCREENS.register = (s) => {
    const w = warrantyInfo(s);
    let invoice;
    if (s.invoice) {
      invoice = `<div class="file-row">
          <span class="file-ic">${ic('file-text')}</span>
          <span class="grow"><b>${D.invoiceFile}</b><small>${ic('check')} Uploaded · 248 KB</small></span>
          <button class="link-btn" data-action="remove-invoice">Replace</button>
        </div>`;
    } else if (s.uploading) {
      invoice = `<div class="drop" aria-busy="true">
          <span class="drop-ic"><span class="spinner"></span></span>
          <span style="flex:1"><b>Uploading invoice…</b><small>${D.invoiceFile}</small><span class="drop-progress"><i></i></span></span>
        </div>`;
    } else {
      invoice = `<button class="drop" data-action="upload">
          <span class="drop-ic">${ic('upload')}</span>
          <span><b>Upload invoice</b><small>Photo or PDF · max 5 MB</small></span>
        </button>`;
    }

    const canSubmit = s.invoice && !s.registering;
    return `${statusBar()}
    ${appBar('Register Warranty')}
    <div class="scroll">
      <div class="reg-intro">
        <span class="auto-badge">${ic('check')} Product details auto-filled from scan</span>
        <p>Just confirm your purchase details — it takes under a minute.</p>
      </div>

      <section class="card form-card">
        <div class="form-card-head"><h2>Product</h2><span class="form-card-tag">${ic('lock')} Verified · read-only</span></div>
        <div class="ro">
          <div class="ro-row"><span>Product</span><b>${D.product.name}</b></div>
          <div class="ro-row"><span>Model</span><b class="mono">${D.product.model}</b></div>
          <div class="ro-row"><span>Serial number</span><b class="mono">${D.product.serial}</b></div>
        </div>
      </section>

      <section class="card form-card">
        <div class="form-card-head"><h2>Purchase</h2><span class="form-card-tag">Only what we can’t fetch</span></div>
        <label class="field"><span class="field-label">Purchase date</span>
          <span class="input-wrap">${ic('calendar')}<input class="input" type="date" data-model="purchaseDate" data-rerender value="${esc(s.purchaseDate)}" max="2026-10-02"></span>
        </label>
        <label class="field"><span class="field-label">Purchased from (dealer)</span>
          <span class="input-wrap">${ic('store')}<input class="input" type="text" data-model="dealer" value="${esc(s.dealer)}" autocomplete="off"></span>
        </label>
        <div class="field"><span class="field-label">Purchase invoice</span>${invoice}</div>
      </section>

      <section class="calc">
        <div class="calc-head"><h2>Your warranty</h2>${pill(w.status, 'pill--sm')}</div>
        <div class="calc-grid">
          <div class="calc-cell"><span>Period</span><b>${D.warrantyMonths} months</b></div>
          <div class="calc-cell"><span>Starts</span><b>${w.startText}</b></div>
          <div class="calc-cell"><span>Expires</span><b>${w.endText}</b></div>
        </div>
        <p class="calc-note">${ic('refresh')} Calculated automatically from your purchase date</p>
      </section>
    </div>
    <footer class="footer">
      <button class="btn btn-primary" data-action="register" ${canSubmit ? '' : 'disabled'}>
        ${s.registering ? '<span class="spinner"></span> Registering…' : `${ic('shield-check')} Register Warranty`}
      </button>
      <p class="footer-note">${s.invoice ? 'You’ll get a digital warranty card instantly' : 'Upload your invoice to continue'}</p>
    </footer>`;
  };

  /* ---- Screen 3b: Warranty Registered (success state, §8) ---- */
  SCREENS.success = (s) => {
    const w = warrantyInfo(s);
    return `${statusBar()}
    <div class="scroll scroll--success">
      <button class="iconbtn success-close" data-action="go-home" aria-label="Close">${ic('x')}</button>
      <svg class="success-svg" viewBox="0 0 104 104" aria-hidden="true">
        <circle class="sc-bg" cx="52" cy="52" r="44"/>
        <circle class="sc-ring" cx="52" cy="52" r="44"/>
        <path class="sc-check" d="M34 53l12 12 24-26"/>
      </svg>
      <h1 class="success-title">Warranty Registered</h1>
      <p class="success-sub">Your digital warranty card is ready. A copy has been sent to your registered mobile number.</p>

      <section class="card receipt">
        <div class="receipt-id"><span>Warranty ID</span><b class="mono">${D.warrantyId}</b></div>
        <div class="receipt-cut"></div>
        <dl class="kv">
          ${kvRow('Product', D.product.short)}
          ${kvRow('Serial number', `<span class="mono">${D.product.serial}</span>`)}
          ${kvRow('Valid', `${w.startText} – ${w.endText}`)}
        </dl>
      </section>
    </div>
    <footer class="footer">
      <button class="btn btn-primary" data-action="view-warranty">${ic('shield-check')} View My Warranty</button>
      <button class="btn btn-text" data-action="go-home">Back to Home</button>
    </footer>`;
  };

  /* ---- Screen 4: My Warranty — digital warranty card (§9) ---- */
  SCREENS.warranty = (s) => {
    if (!s.registered) {
      return `${statusBar()}
      <div class="lt-head"><h1>My Warranty</h1></div>
      <div class="empty">
        <span class="empty-ic">${ic('shield', 'ic-lg')}</span>
        <h2>No registered warranties</h2>
        <p>Scan your appliance to register it and get a digital warranty card.</p>
        <button class="btn btn-primary" data-action="go" data-arg="scan">${ic('scan')} Scan Product</button>
      </div>
      ${tabBar('warranty')}`;
    }

    const w = warrantyInfo(s);
    const c = s.claim;
    const activeClaim = c && c.done < 5;
    const statusPill = w.status === 'active'
      ? `<span class="pill pill--ondark">Warranty Active</span>`
      : pill(w.status);

    return `${statusBar()}
    <div class="lt-head">
      <h1>My Warranty</h1>
      <button class="iconbtn iconbtn--surface" data-action="share" aria-label="Share warranty card">${ic('share')}</button>
    </div>
    <div class="scroll">
      <article class="wcard" aria-label="Digital warranty card">
        ${GUILLOCHE}
        <div class="wcard-top"><span class="wcard-brand">${ic('shield-check')} WarrantyDesk</span><span class="wcard-kind">Digital Warranty</span></div>
        <div class="wcard-product">
          <span class="wcard-img">${FRIDGE}</span>
          <div>
            <h2>${D.product.name}</h2>
            <p>Model <span class="mono">${D.product.model}</span></p>
            ${statusPill}
          </div>
        </div>
        <dl class="wcard-ids">
          <div><dt>Serial number</dt><dd class="mono">${D.product.serial}</dd></div>
          <div><dt>Warranty ID</dt><dd class="mono">${D.warrantyId}</dd></div>
        </dl>
        <div class="wcard-valid">
          <div><span>Valid from</span><b>${w.startText}</b></div>
          <div class="ta-r"><span>Valid until</span><b class="big">${w.endText.toUpperCase()}</b></div>
        </div>
        <div class="wcard-meter" role="img" aria-label="${w.left} days of warranty remaining"><i style="width:${w.pct.toFixed(1)}%"></i></div>
        <div class="wcard-meter-label"><span>${w.left} days remaining</span><span>${D.warrantyMonths}-month cover</span></div>
        <div class="wcard-verify">
          <span class="wcard-qr">${qrSVG(48, '#0F1B24', '#fff')}</span>
          <div><b>${ic('shield-check')} Verified digital record</b><span>Authorised service centres scan this code to verify instantly — no paper card needed.</span></div>
        </div>
      </article>

      ${c ? `<button class="claim-strip tone-${claimTone(c)}" data-action="go" data-arg="claim">
          <span class="claim-strip-ic">${ic('clipboard')}</span>
          <span class="grow"><b>Claim #${D.claim.id}</b>${pill(claimKey(c), 'pill--sm')}</span>
          ${ic('chevron-right', 'ic-muted')}
        </button>` : ''}

      <div class="w-cta">
        ${activeClaim
          ? `<button class="btn btn-primary" data-action="go" data-arg="claim">${ic('clipboard')} Track Active Claim</button>`
          : `<button class="btn btn-primary" data-action="sheet" data-arg="raise">${ic('wrench')} Raise a Claim</button>`}
      </div>

      <div class="card list">
        <button class="list-row" data-action="sheet" data-arg="terms"><span class="list-ic">${ic('file-text')}</span><span class="grow"><b>View Warranty Terms</b><small>Coverage, exclusions and period</small></span>${ic('chevron-right', 'ic-muted')}</button>
        <button class="list-row" data-action="go" data-arg="product"><span class="list-ic">${ic('box')}</span><span class="grow"><b>View Product Details</b><small>Model ${D.product.model} · ${D.product.capacity}</small></span>${ic('chevron-right', 'ic-muted')}</button>
        <button class="list-row" data-action="sheet" data-arg="centre"><span class="list-ic">${ic('phone')}</span><span class="grow"><b>Contact Service Centre</b><small>${D.centre.name}</small></span>${ic('chevron-right', 'ic-muted')}</button>
      </div>
    </div>
    ${tabBar('warranty')}`;
  };

  /* ---- Screen 5: Claim Details & service tracking (§10) ---- */
  SCREENS.claim = (s) => {
    const c = s.claim;
    if (!c) {
      return `${statusBar()}
      <div class="lt-head"><h1>Claims</h1></div>
      <div class="empty">
        <span class="empty-ic">${ic('clipboard', 'ic-lg')}</span>
        <h2>No claims yet</h2>
        <p>If an appliance stops working, raise a claim from its digital warranty card.</p>
        ${s.registered
          ? `<button class="btn btn-primary" data-action="go" data-arg="warranty">${ic('shield-check')} Go to My Warranty</button>`
          : `<button class="btn btn-primary" data-action="go" data-arg="scan">${ic('scan')} Scan Product</button>`}
      </div>
      ${tabBar('claim')}`;
    }

    const key = claimKey(c);
    const tone = claimTone(c);
    const stage = STAGES[c.done - 1];

    const timeline = STAGES.map((st, i) => {
      const state = i < c.done ? 'done' : i === c.done ? 'current' : 'pending';
      const meta = state === 'done' ? st.at : state === 'current' ? st.now : 'Pending';
      const dot = state === 'done' ? ic('check', 'ic-sm') : state === 'current' ? '<i></i>' : '';
      return `<li class="tl-item is-${state}">
          <span class="tl-dot">${dot}</span>
          <div class="tl-body"><span class="tl-title">${st.title}</span><span class="tl-meta">${meta}</span>${state === 'done' && i === c.done - 1 ? `<span class="tl-note">${st.note(s)}</span>` : ''}</div>
        </li>`;
    }).join('');

    const centre = c.done >= 3
      ? `<section class="card centre-card">
          <div class="cc-top">
            <span class="cc-ic">${ic('wrench')}</span>
            <div><span class="eyebrow">Handling your claim</span><h3>${D.centre.name}</h3></div>
          </div>
          <span class="cc-badge">${ic('shield-check')} Brand-authorised · ${D.centre.authId}</span>
          <ul class="cc-meta">
            <li>${ic('map-pin')} ${D.centre.area} · ${D.centre.distance}</li>
            <li>${ic('phone')} ${D.centre.phone}</li>
            <li>${ic('check-circle')} Assigned 02 Oct 2026, 11:40 AM</li>
          </ul>
          <div class="btn-row">
            <button class="btn btn-secondary btn-sm" data-action="call">${ic('phone')} Call</button>
            <button class="btn btn-secondary btn-sm" data-action="sheet" data-arg="centre">View Service Centre</button>
          </div>
        </section>`
      : `<section class="card centre-card">
          <div class="cc-pending"><span class="spinner"></span><span>Assigning an authorised service centre<small>Usually within 2 hours of verification</small></span></div>
        </section>`;

    let footer;
    if (c.done >= 5) footer = `<button class="btn btn-primary" data-action="view-warranty">${ic('shield-check')} Back to My Warranty</button>`;
    else if (c.done >= 3) footer = `<button class="btn btn-primary" data-action="sheet" data-arg="track">${ic('navigation')} Track Service</button>`;
    else footer = `<button class="btn btn-primary" disabled>${ic('navigation')} Track Service</button><p class="footer-note">Available once a service centre is assigned</p>`;

    return `${statusBar()}
    ${appBar('Claim Details')}
    <div class="scroll">
      <section class="card claim-head">
        <div class="ch-top">
          <div><span class="eyebrow">Warranty claim</span><h2 class="ch-id">Claim #${D.claim.id}</h2></div>
          <span class="ch-date">Raised<br>02 Oct 2026</span>
        </div>
        <div class="ch-product">
          <span class="ch-thumb">${FRIDGE}</span>
          <div><b>${D.product.name}</b><small class="mono">S/N ${D.product.serial}</small></div>
        </div>
        <div class="ch-issue">
          <span class="ch-issue-ic">${ic('alert')}</span>
          <div><span>Issue</span><b>${esc(c.issue)}</b></div>
        </div>
      </section>

      <section class="status-hero tone-${tone}" aria-live="polite">
        <div class="sh-row">
          <span class="sh-ic">${ic(stage.icon, 'ic-lg')}</span>
          <div><span class="sh-label">Current status · step ${c.done} of 5</span><div class="sh-status">${STATUS[key].label}</div></div>
        </div>
        ${segbar(c.done)}
        <p class="sh-text">${STAGE_SUMMARY[c.done]}</p>
      </section>

      <h3 class="section-label">Claim timeline</h3>
      <section class="card tl-card"><ol class="tl">${timeline}</ol></section>

      <h3 class="section-label">Authorised service centre</h3>
      ${centre}
    </div>
    <footer class="footer">${footer}</footer>`;
  };

  /* ------------------------------------------------------------------------
     Bottom sheets (kept inside the five screens rather than extra screens)
     ------------------------------------------------------------------------ */

  const sheetHead = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="iconbtn" data-action="close-sheet" aria-label="Close">${ic('x')}</button></div>`;

  const SHEETS = {
    manual: (s) => ({
      title: 'Enter serial number',
      html: `${sheetHead('Enter serial number')}
        <p class="sheet-sub">The serial number (S/N) is your product’s permanent ID. Find it on the rating label inside the door or on the back panel.</p>
        <label class="field"><span class="field-label">Serial number</span>
          <input class="input mono" type="text" data-model="manualSerial" value="${esc(s.manualSerial)}" placeholder="e.g. SN8F92K21" autocomplete="off" autocapitalize="characters" spellcheck="false">
        </label>
        ${s.manualError ? `<p class="field-error" role="alert">${ic('alert')} ${esc(s.manualError)}</p>` : ''}
        <button class="chip-link" data-action="fill-demo-serial">${ic('check')} Use demo serial ${D.product.serial}</button>
        <button class="btn btn-primary" data-action="manual-submit">Find Product</button>`,
    }),

    raise: (s) => ({
      title: 'Raise a Claim',
      html: `${sheetHead('Raise a Claim')}
        <p class="sheet-sub">${D.product.name} · <span class="mono">${D.product.serial}</span></p>
        <p class="field-label" style="margin-bottom:8px">What’s the issue?</p>
        <div class="chips">${ISSUES.map((i) => `<button class="chip" data-action="issue" data-arg="${esc(i)}" aria-pressed="${s.issue === i}">${s.issue === i ? ic('check') : ''}${i}</button>`).join('')}</div>
        <label class="field"><span class="field-label">Add details (optional)</span>
          <textarea class="input" data-model="note" rows="3">${esc(s.note)}</textarea>
        </label>
        <button class="attach" data-action="attach">${ic('camera')} Add photo or video (optional)</button>
        <p class="info-note">${ic('shield-check')}<span>Your warranty is verified automatically using the serial number — no paper card or invoice needed again.</span></p>
        <button class="btn btn-primary" data-action="submit-claim">Submit Claim</button>`,
    }),

    terms: (s) => {
      const w = warrantyInfo(s);
      return {
        title: 'Warranty terms',
        html: `${sheetHead('Warranty terms')}
          <p class="sheet-sub">${D.warrantyMonths}-month manufacturer warranty · ${w.startText} – ${w.endText}</p>
          <div class="terms-group"><h3 style="color:var(--ok)">${ic('check-circle')} Covered</h3>
            <ul><li>Manufacturing defects in parts and workmanship</li><li>Cooling system, compressor and electrical components</li><li>Technician visit and labour at an authorised centre</li></ul></div>
          <div class="terms-group"><h3 style="color:var(--bad)">${ic('x')} Not covered</h3>
            <ul><li>Physical, liquid or transit damage</li><li>Repairs by unauthorised service providers</li><li>Consumables such as bulbs and shelves</li></ul></div>
          <button class="btn btn-secondary" data-action="close-sheet">Close</button>`,
      };
    },

    centre: () => ({
      title: 'Service centre',
      html: `${sheetHead('Service centre')}
        ${MAP}
        <span class="cc-badge" style="margin-top:0">${ic('shield-check')} Brand-authorised · ${D.centre.authId}</span>
        <h3 style="font-size:19px;font-weight:800;margin:10px 0 2px;letter-spacing:-.01em">${D.centre.name}</h3>
        <dl class="kv rows" style="padding:0">
          ${kvRow('Address', `<span style="max-width:210px;font-size:13.5px">${D.centre.address}</span>`)}
          ${kvRow('Distance', D.centre.distance)}
          ${kvRow('Hours', D.centre.hours)}
          ${kvRow('Phone', D.centre.phone)}
        </dl>
        <div class="btn-row">
          <button class="btn btn-primary btn-sm" data-action="call">${ic('phone')} Call</button>
          <button class="btn btn-secondary btn-sm" data-action="directions">${ic('navigation')} Directions</button>
        </div>`,
    }),

    track: (s) => {
      const visited = s.claim && s.claim.done >= 4;
      return {
        title: 'Service visit',
        html: `${sheetHead('Service visit')}
          <p class="sheet-sub">Claim #${D.claim.id} · ${esc(s.claim ? s.claim.issue : '')}</p>
          <div class="visit">
            <span class="visit-date"><span>Oct</span><b>05</b></span>
            <span class="grow"><b>Monday, 05 Oct 2026</b><small>Technician visit · 10:00 AM – 1:00 PM</small>
              ${visited ? `<span class="pill tone-ok pill--sm">Visit completed</span>` : `<span class="pill tone-info pill--sm">Scheduled</span>`}</span>
          </div>
          <dl class="card kv rows" style="box-shadow:none;padding:0">
            ${kvRow('Technician', visited ? 'Ramesh K. · Certified' : 'Shared 1 hour before visit')}
            ${kvRow('Service centre', 'ABC Authorised')}
            ${kvRow('Visit charge', 'Covered by warranty')}
          </dl>
          <p class="info-note">${ic('shield-check')}<span>Show your digital warranty card QR to the technician — no paper documents needed.</span></p>
          <button class="btn btn-primary" data-action="close-sheet">Done</button>`,
      };
    },
  };

  function renderSheet(s, enter) {
    if (!s.sheet || !SHEETS[s.sheet]) return '';
    const { title, html } = SHEETS[s.sheet](s);
    return `<div class="sheet-wrap ${enter ? 'is-entering' : ''}">
        <button class="sheet-scrim" data-action="close-sheet" aria-label="Close" tabindex="-1"></button>
        <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><span class="sheet-grab"></span>${html}</div>
      </div>`;
  }

  function renderPhone(s, opts = {}) {
    const cls = ['screen', `screen--${s.screen}`];
    if (opts.enter) cls.push('is-entering');
    if (s.screen === 'scan') {
      if (s.scanMode === 'sn') cls.push('is-sn');
      if (s.torch) cls.push('is-torch');
    }
    return `<div class="${cls.join(' ')}">${SCREENS[s.screen](s)}</div>${renderSheet(s, opts.sheetEnter)}`;
  }

  /* ------------------------------------------------------------------------
     State, navigation, rendering
     ------------------------------------------------------------------------ */

  // Scenarios: 'new' = unregistered product, 'registered' = registered with no claim,
  // 'claim' = registered with an open claim (the §11 QR → claim shortcut).
  function initialState(scenario = 'new') {
    const existing = scenario !== 'new';
    return {
      scenario,
      screen: 'scan',
      history: ['home'],
      registered: existing,
      invoice: existing,
      uploading: false,
      registering: false,
      registeredOn: existing ? '18 Aug 2026' : '',
      claim: scenario === 'claim' ? { done: 3, issue: D.claim.issue } : null,
      scanMode: 'qr',
      scanPhase: 'idle',
      torch: false,
      foundVia: 'qr',
      purchaseDate: D.purchaseDate,
      dealer: D.dealer,
      issue: D.claim.issue,
      note: D.claim.note,
      sheet: null,
      manualSerial: '',
      manualError: '',
    };
  }

  let state = initialState('new');
  let view = 'demo';
  let timers = [];
  const later = (ms, fn) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms); timers.push(t); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  const app = $('#app');

  function render() {
    const sameScreen = app.dataset.screen === state.screen;
    const sheetKey = state.sheet || '';
    const scroller = app.querySelector('.scroll');
    const prevScroll = scroller ? scroller.scrollTop : 0;

    app.innerHTML = renderPhone(state, { enter: !sameScreen, sheetEnter: app.dataset.sheet !== sheetKey });
    app.dataset.screen = state.screen;
    app.dataset.sheet = sheetKey;
    $('#device-screen').classList.toggle('is-dark', state.screen === 'scan');

    if (sameScreen) {
      const sc = app.querySelector('.scroll');
      if (sc) sc.scrollTop = prevScroll;
    }
    renderPresenter();
  }

  function go(screen, opts = {}) {
    if (opts.history) state.history = [...opts.history];
    else if (state.screen !== screen) state.history.push(state.screen);
    state.screen = screen;
    state.sheet = null;
    if (screen === 'scan') state.scanPhase = 'idle';
    render();
  }

  function back() {
    const prev = state.history.pop() || 'home';
    state.screen = prev === 'success' ? 'home' : prev;
    state.sheet = null;
    if (state.screen === 'scan') state.scanPhase = 'idle';
    render();
  }

  function openSheet(name) {
    state.sheet = name;
    if (name === 'manual') state.manualError = '';
    render();
    const field = app.querySelector('.sheet input');
    if (field && name === 'manual') field.focus({ preventScroll: true });
  }

  let toastTimer;
  function toast(text) {
    const layer = $('#toast-layer');
    layer.innerHTML = `<div class="toast">${ic('check-circle')}<span>${text}</span></div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      const t = layer.firstElementChild;
      if (!t) return;
      t.classList.add('is-leaving');
      setTimeout(() => { if (t.parentNode === layer) layer.innerHTML = ''; }, 240);
    }, 2600);
  }

  // Switch scan mode in place so the camera pan and frame resize animate.
  function applyScanMode() {
    const root = app.querySelector('.screen--scan');
    if (!root) return render();
    root.classList.toggle('is-sn', state.scanMode === 'sn');
    root.querySelectorAll('[data-action="mode"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.arg === state.scanMode)));
  }

  function capture() {
    if (state.screen !== 'scan' || state.scanPhase !== 'idle') return;
    state.scanPhase = 'detecting';
    render();
    later(700, () => {
      if (state.screen !== 'scan') return;
      state.scanPhase = 'detected';
      render();
      later(1300, () => {
        if (state.screen !== 'scan' || state.scanPhase !== 'detected') return;
        state.foundVia = state.scanMode;
        go('product');
      });
    });
  }

  function submitClaim() {
    state.claim = { done: 1, issue: state.issue };
    go('claim');
    toast(`Claim #${D.claim.id} submitted`);
    later(1800, () => {
      if (!state.claim || state.claim.done !== 1) return;
      state.claim.done = 2; render(); toast('Warranty verified automatically');
    });
    later(3800, () => {
      if (!state.claim || state.claim.done !== 2) return;
      state.claim.done = 3; render(); toast(`${D.centre.name} assigned`);
    });
  }

  const ACTIONS = {
    go: (arg) => go(arg),
    back: () => back(),
    'go-home': () => go('home', { history: [] }),
    'view-warranty': () => go('warranty', { history: ['home'] }),
    tab: (arg) => go(arg, { history: arg === 'home' ? [] : ['home'] }),

    'quick-register': () => {
      if (state.registered) { toast('This product is already registered'); go('warranty'); return; }
      go('scan');
    },
    'quick-raise': () => {
      if (!state.registered) { toast('Scan and register a product first'); go('scan'); return; }
      if (state.claim && state.claim.done < 5) { go('claim'); return; }
      go('warranty'); openSheet('raise');
    },

    mode: (arg) => {
      if (state.scanPhase !== 'idle' || state.scanMode === arg) return;
      state.scanMode = arg;
      applyScanMode();
    },
    torch: (_, el) => {
      state.torch = !state.torch;
      app.querySelector('.screen--scan')?.classList.toggle('is-torch', state.torch);
      el.classList.toggle('is-on', state.torch);
      el.setAttribute('aria-pressed', String(state.torch));
    },
    capture: () => capture(),

    sheet: (arg) => openSheet(arg),
    'close-sheet': () => { state.sheet = null; render(); },

    'fill-demo-serial': () => {
      state.manualSerial = D.product.serial;
      state.manualError = '';
      render();
    },
    'manual-submit': () => {
      const v = (state.manualSerial || '').trim().toUpperCase().replace(/\s+/g, '');
      if (v.length < 6) state.manualError = 'Enter the full serial number — at least 6 characters.';
      else if (v !== D.product.serial) state.manualError = `No product found for ${v}. Check the label and try again.`;
      else { state.manualError = ''; state.foundVia = 'manual'; go('product'); return; }
      render();
      app.querySelector('.sheet input')?.focus({ preventScroll: true });
    },

    upload: () => {
      if (state.uploading) return;
      state.uploading = true; render();
      later(1150, () => { state.uploading = false; state.invoice = true; render(); });
    },
    'remove-invoice': () => { state.invoice = false; render(); },
    register: () => {
      if (!state.invoice || state.registering) return;
      state.registering = true; render();
      later(1000, () => { state.registering = false; state.registered = true; state.registeredOn = fmtDate(DEMO_TODAY); go('success'); });
    },

    issue: (arg) => { state.issue = arg; render(); },
    attach: () => toast('Photo attached: fridge_display.jpg'),
    'submit-claim': () => submitClaim(),

    share: () => toast('Warranty card saved as PDF'),
    call: () => toast(`Calling ${D.centre.phone}…`),
    directions: () => toast('Opening directions · 3.2 km away'),

    // Presenter controls
    view: (arg) => setView(arg),
    scenario: (arg) => { clearTimers(); state = initialState(arg); setView('demo'); render(); },
    step: (arg) => jumpTo(Number(arg)),
    advance: () => advanceClaim(),
    reset: () => { clearTimers(); state = initialState(state.scenario); setView('demo'); render(); },
    'ov-open': (arg) => openOverviewItem(Number(arg)),
  };

  function jumpTo(n) {
    setView('demo');
    clearTimers();
    state.scanPhase = 'idle';
    switch (n) {
      case 1: return go('scan', { history: ['home'] });
      case 2: state.foundVia = 'qr'; return go('product', { history: ['home', 'scan'] });
      case 3:
        if (state.registered) { toast('Already registered: duplicate registration is blocked'); return go('product', { history: ['home', 'scan'] }); }
        return go('register', { history: ['home', 'scan', 'product'] });
      case 4:
        if (!state.registered) { state.registered = true; state.invoice = true; state.registeredOn = fmtDate(DEMO_TODAY); }
        return go('warranty', { history: ['home'] });
      case 5:
        if (!state.registered) { state.registered = true; state.invoice = true; state.registeredOn = fmtDate(DEMO_TODAY); }
        if (!state.claim) state.claim = { done: 3, issue: state.issue };
        return go('claim', { history: ['home', 'warranty'] });
      default: return go('home', { history: [] });
    }
  }

  function advanceClaim() {
    setView('demo');
    if (!state.claim) {
      if (!state.registered) { state.registered = true; state.invoice = true; state.registeredOn = fmtDate(DEMO_TODAY); }
      state.claim = { done: 1, issue: state.issue };
      go('claim', { history: ['home', 'warranty'] });
      toast(`Claim #${D.claim.id} submitted`);
      return;
    }
    if (state.claim.done >= 5) return;
    clearTimers();
    state.claim.done += 1;
    if (state.screen !== 'claim') go('claim', { history: ['home', 'warranty'] });
    else render();
    toast(`Status updated: ${STAGES[state.claim.done - 1].title}`);
  }

  /* ------------------------------------------------------------------------
     Presenter panel
     ------------------------------------------------------------------------ */

  function renderPresenter() {
    const cur = SCREEN_STEP[state.screen] ?? 0;
    const c = state.claim;
    $('#presenter').innerHTML = `
      <div class="pr-brand"><span class="logo">${ic('shield-check')}</span><div><b>WarrantyDesk</b><span>Customer app · feature demo</span></div></div>

      <div>
        <p class="pr-label">View</p>
        <div class="seg">
          <button data-action="view" data-arg="demo" aria-pressed="${view === 'demo'}">${ic('device')} Live demo</button>
          <button data-action="view" data-arg="overview" aria-pressed="${view === 'overview'}">${ic('grid')} All screens</button>
        </div>
      </div>

      <div>
        <p class="pr-label">Scenario</p>
        <div class="seg">
          <button data-action="scenario" data-arg="new" aria-pressed="${state.scenario === 'new'}">New product</button>
          <button data-action="scenario" data-arg="registered" aria-pressed="${state.scenario === 'registered'}">Registered</button>
          <button data-action="scenario" data-arg="claim" aria-pressed="${state.scenario === 'claim'}">Open claim</button>
        </div>
        <p class="pr-hint">${{
          new: '<b>State A.</b> Not registered yet: scan → Warranty Not Registered → Register → digital card → claim.',
          registered: '<b>State B.</b> Already registered: scan → Warranty Active → Raise a Claim. Registration is blocked.',
          claim: '<b>State B + open claim.</b> Scan finds the existing warranty and its active claim: Track Claim.',
        }[state.scenario]}</p>
      </div>

      <div>
        <p class="pr-label">Demo script</p>
        <ol class="pr-steps">
          ${STEPS.map((st, i) => {
            const n = i + 1;
            const skipped = n === 3 && state.scenario !== 'new';
            const cls = skipped ? 'is-skipped' : n === cur ? 'is-active' : n < cur ? 'is-past' : '';
            const say = n === 2 && state.registered && st.sayRegistered ? st.sayRegistered : st.say;
            return `<li><button class="pr-step ${cls}" data-action="step" data-arg="${n}" ${n === cur ? 'aria-current="step"' : ''}>
                <span class="pr-num">${skipped ? ic('lock', 'ic-sm') : n}</span>
                <span><span class="pr-step-title">${st.title}</span>${skipped ? '<span class="pr-step-skip">Skipped: already registered</span>' : ''}<span class="pr-step-say">“${say}”</span></span>
              </button></li>`;
          }).join('')}
        </ol>
      </div>

      <div class="pr-sim">
        <div class="pr-sim-head"><span>Claim simulation</span>${c ? pill(claimKey(c), 'pill--sm') : '<span class="pr-muted">No claim yet</span>'}</div>
        <button class="pr-btn" data-action="advance" ${c && c.done >= 5 ? 'disabled' : ''}>${ic('arrow-right')} ${c ? (c.done >= 5 ? 'Claim resolved' : `Advance to “${STAGES[c.done].title}”`) : 'Create sample claim'}</button>
      </div>

      <div class="pr-foot">
        <button class="pr-btn" data-action="reset">${ic('refresh')} Reset demo</button>
        <p><kbd>←</kbd> <kbd>→</kbd> step through &nbsp;·&nbsp; <kbd>R</kbd> reset &nbsp;·&nbsp; <kbd>O</kbd> all screens</p>
      </div>`;
  }

  /* ------------------------------------------------------------------------
     Overview board — every screen side by side, for slide screenshots
     ------------------------------------------------------------------------ */

  const OV_GROUPS = [
    {
      title: 'Primary flow — new purchase',
      items: [
        { n: '01', title: 'Scan Your Product', note: 'QR or serial number scan', sc: 'new', st: { screen: 'scan' } },
        { n: '02', title: 'Product Found · State A', note: 'New product: Warranty Not Registered', sc: 'new', st: { screen: 'product' } },
        { n: '03', title: 'Register Warranty', note: 'Pre-filled, 3 inputs', sc: 'new', st: { screen: 'register', invoice: true } },
        { n: '03', title: 'Warranty Registered', note: 'Success state', sc: 'new', st: { screen: 'success', registered: true, invoice: true, registeredOn: '02 Oct 2026' } },
        { n: '04', title: 'My Warranty', note: 'Digital, verifiable card', sc: 'new', st: { screen: 'warranty', registered: true, invoice: true, registeredOn: '02 Oct 2026' } },
        { n: '05', title: 'Claim Details', note: 'Lifecycle + service centre', sc: 'new', st: { screen: 'claim', registered: true, registeredOn: '02 Oct 2026', claim: { done: 3, issue: D.claim.issue } } },
      ],
    },
    {
      title: 'Registered product — registration blocked, go straight to claims',
      items: [
        { n: 'B1', title: 'Serial number scan', note: 'S/N read on the label', sc: 'registered', st: { screen: 'scan', scanMode: 'sn', scanPhase: 'detected' } },
        { n: 'B2', title: 'Product Found · State B', note: 'Warranty Active → Raise a Claim', sc: 'registered', st: { screen: 'product', foundVia: 'sn' } },
        { n: 'B3', title: 'State B with an open claim', note: 'Existing claim → Track Claim', sc: 'claim', st: { screen: 'product' } },
        { n: 'B4', title: 'Claim status', note: 'Technician visit completed', sc: 'claim', st: { screen: 'claim', claim: { done: 4, issue: D.claim.issue } } },
      ],
    },
    {
      title: 'Supporting',
      items: [
        { n: '—', title: 'Home', note: 'Navigation hub', sc: 'claim', st: { screen: 'home' } },
        { n: '—', title: 'Raise a Claim', note: 'Bottom sheet from Product Found or My Warranty', sc: 'registered', st: { screen: 'warranty', sheet: 'raise' } },
      ],
      legend: true,
    },
  ];
  const OV_ITEMS = OV_GROUPS.flatMap((g) => g.items);
  const ovState = (item) => Object.assign(initialState(item.sc), JSON.parse(JSON.stringify(item.st)));

  let overviewBuilt = false;
  function buildOverview() {
    if (overviewBuilt) return;
    overviewBuilt = true;
    let idx = 0;
    const phone = (item) => {
      const s = ovState(item);
      const i = idx++;
      return `<figure class="ov-item">
          <div class="ov-phone"><div class="device" inert>
            <div class="device-screen ${s.screen === 'scan' ? 'is-dark' : ''}">
              <div class="app">${renderPhone(s)}</div><div class="island"></div><div class="home-ind"></div>
            </div>
          </div></div>
          <figcaption><span class="ov-n">${item.n}</span><span><span class="ov-t">${item.title}</span><span class="ov-note">${item.note}</span></span></figcaption>
          <button class="ov-hit" data-action="ov-open" data-arg="${i}" aria-label="Open ${item.title} in live demo"></button>
        </figure>`;
    };

    const legend = `<div class="legend">
        <h3>Status system</h3>
        <p>Every status uses colour, a dot and words, so it reads without studying the text.</p>
        <div class="legend-group"><span class="eyebrow">Warranty</span><div class="legend-pills">${['active', 'expiring', 'expired', 'unregistered'].map((k) => pill(k)).join('')}</div></div>
        <div class="legend-group"><span class="eyebrow">Claim</span><div class="legend-pills">${['submitted', 'verified', 'assigned', 'visit', 'resolved', 'rejected', 'inforeq'].map((k) => pill(k)).join('')}</div></div>
        <div class="legend-group"><span class="eyebrow">Meaning</span><div class="legend-key">
          <div class="tone-ok"><i></i>Good / complete</div><div class="tone-info"><i></i>In progress</div>
          <div class="tone-warn"><i></i>Needs attention</div><div class="tone-bad"><i></i>Problem / ended</div>
        </div></div>
      </div>`;

    $('#overview').innerHTML = `
      <header class="ov-head">
        <h1>WarrantyDesk · Customer App</h1>
        <p>Customer-facing feature showcase. Click any screen to open it in the live demo.</p>
        <div class="ov-flow">${['Scan product', 'Identify product', 'Register warranty', 'Digital warranty card', 'Raise / view claim', 'Track service']
          .map((t, i) => `${i ? ic('arrow-right') : ''}<span>${t}</span>`).join('')}</div>
      </header>
      ${OV_GROUPS.map((g) => `<section class="ov-group"><h2>${g.title}</h2><div class="ov-grid">${g.items.map(phone).join('')}${g.legend ? legend : ''}</div></section>`).join('')}`;
  }

  function openOverviewItem(i) {
    const item = OV_ITEMS[i];
    if (!item) return;
    clearTimers();
    state = ovState(item);
    state.history = { scan: ['home'], product: ['home', 'scan'], register: ['home', 'scan', 'product'], claim: ['home', 'warranty'] }[state.screen] || ['home'];
    if (state.screen === 'scan') state.scanPhase = 'idle';
    app.dataset.screen = '';
    setView('demo');
    render();
  }

  function setView(v) {
    view = v;
    $('#stage').dataset.view = v;
    if (v === 'overview') buildOverview();
    else fit();
    renderPresenter();
  }

  /* ------------------------------------------------------------------------
     Events, sizing, boot
     ------------------------------------------------------------------------ */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el.dataset.arg, el); }
  });

  document.addEventListener('input', (e) => {
    const key = e.target.dataset && e.target.dataset.model;
    if (key && app.contains(e.target)) state[key] = e.target.value;
  });

  document.addEventListener('change', (e) => {
    const key = e.target.dataset && e.target.dataset.model;
    if (key && app.contains(e.target) && 'rerender' in e.target.dataset) { state[key] = e.target.value; render(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Enter' && e.target.dataset.model === 'manualSerial') { e.preventDefault(); ACTIONS['manual-submit'](); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && state.sheet) { state.sheet = null; render(); return; }
    if (document.body.classList.contains('bare')) return;
    const cur = SCREEN_STEP[state.screen] ?? 0;
    const skip = (n, dir) => (n === 3 && state.registered && state.screen !== 'register' && state.screen !== 'success' ? n + dir : n);
    if (e.key === 'ArrowRight') { e.preventDefault(); jumpTo(Math.min(5, skip(cur + 1, 1))); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); jumpTo(Math.max(1, skip(cur - 1, -1))); }
    else if (e.key === 'r' || e.key === 'R') ACTIONS.reset();
    else if (e.key === 'o' || e.key === 'O') setView(view === 'overview' ? 'demo' : 'overview');
  });

  const bareQuery = window.matchMedia('(max-width: 640px)');
  function fit() {
    document.body.classList.toggle('bare', bareQuery.matches);
    const area = $('#device-area');
    if (!area || bareQuery.matches) return;
    const scale = Math.min(1, (area.clientHeight - 40) / 872, (area.clientWidth - 40) / 418);
    $('#device-holder').style.setProperty('--scale', Math.max(0.4, scale).toFixed(3));
  }
  window.addEventListener('resize', fit);
  bareQuery.addEventListener('change', fit);

  fit();
  render();

  // Deep links: #overview opens the all-screens board; #step-2 jumps to a demo step;
  // a scenario prefix picks the starting state, e.g. #registered:step-2 or #claim:step-2.
  const hash = location.hash.slice(1);
  const link = /^(?:(new|registered|claim):)?(?:step-([1-5]))?$/.exec(hash);
  if (hash === 'overview') setView('overview');
  else if (link && hash) {
    if (link[1]) { state = initialState(link[1]); render(); }
    if (link[2]) jumpTo(Number(link[2]));
  }
})();
