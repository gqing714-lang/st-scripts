/* V11：状态连续台词模式 / 平滑逐字头像心声框 / 原生 dialog 设置界面 / 可调颜色和字体 / 任意状态头像池

AI回复格式一：旧版 outer / inner 切换
[HB]
普通|outer：角色表面说出口的话、外在表现。禁止与正文中发言完全相同。
sex|inner：角色未说出口的真实心声、欲望、判断、隐藏情绪或真实意图。
[/HB]

AI回复格式二：V11 状态连续台词模式
[HB]
普通：第一句台词
不高兴：第二句台词
害羞：第三句台词
[/HB]

说明：
1. 状态名会引用设置界面里的同名头像池。
2. 有几行就生成几段，点击对话框按顺序切换。
3. 每段头像只在创建心声框时随机一次，来回切换不会反复换图。

建议隐藏 [HB] 的正则：
\[HB\][\s\S]*?\[\/HB\]

V11 修正方向：
1. 不复用旧设置面板函数。
2. 不使用 ST Popup，不使用 fixed overlay。
3. 使用已测试成功的网页原生 <dialog>。
4. 按钮为「底图·HB11」「设置·HB11」，避开旧版同名按钮回调残留。
5. 设置界面支持状态头像、对话框颜色、头像框颜色、边框颜色、文字颜色。V11 已新增状态连续台词模式，并保留旧版渐变纹理与平滑逐字。
*/

(() => {
  const SCRIPT_FLAG = '__ST_HEART_HB_NATIVE_DIALOG_STATUS_FONT_V11__';

  if (window[SCRIPT_FLAG]) return;
  window[SCRIPT_FLAG] = true;

  const VERSION = 'V11';
  const SPEED_MS = 42;
  const KEEP_HB_BOX_COUNT = 5;

  const BUTTON_BG = '底图·HB11';
  const BUTTON_SETTINGS = '设置·HB11';

  const STORAGE_KEY_BG = 'st-heart-hb-avatar-bg-enabled';
  const STORAGE_KEY_STATUS_POOLS = 'st-heart-hb-status-pools-config-v11';
  const LEGACY_STORAGE_KEY_STATUS_POOLS = 'st-heart-hb-avatar-pools-config-v1';
  const STORAGE_KEY_THEME = 'st-heart-hb-theme-config-v11';
  const STORAGE_KEY_FONT = 'st-heart-hb-font-config-v11';

  const DEFAULT_STATUS_POOLS = {
    普通: [
      'https://i.postimg.cc/3JrR6qjz/pu-tong2.png',
      'https://i.postimg.cc/qMBRYFc9/pu-tong.png',
    ],
    sex: [
      'https://i.postimg.cc/ZKYRgQFk/gao-xing2.png',
      'https://i.postimg.cc/28j6Jtds/gao-xing1.png',
    ],
    不高兴: [
      'https://i.postimg.cc/VLs6ThBc/bu-gao-xing.png',
    ],
  };

  const DEFAULT_THEME = {
    dialogBg: '#560B35',
    avatarBg: '#560B35',
    borderColor: '#DDCFA4',
    textColor: '#F2EAD7',
  };

  const DEFAULT_FONT = {
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700&display=swap',
    family: 'Noto Serif SC',
    fallback: 'Source Han Serif SC, SimSun, serif',
    weight: '500',
  };

  let statusPoolsCache = null;
  let themeCache = null;
  let fontCache = null;
  let renderTimer = null;

  function getP() {
    try {
      if (window.parent && window.parent !== window && window.parent.document) return window.parent;
    } catch (e) {}

    try {
      if (window.top && window.top !== window && window.top.document) return window.top;
    } catch (e) {}

    return window;
  }

  function getRootWindow() {
    let w = window;

    try {
      while (w.parent && w.parent !== w) {
        try {
          if (!w.parent.document || !w.parent.document.body) break;
          w = w.parent;
        } catch (e) {
          break;
        }
      }
    } catch (e) {}

    try {
      if (w.top && w.top !== w && w.top.document && w.top.document.body) w = w.top;
    } catch (e) {}

    return w;
  }

  function getRootDoc() {
    try {
      const doc = getRootWindow().document;
      if (doc?.body) return doc;
    } catch (e) {}

    try {
      if (window.top?.document?.body) return window.top.document;
    } catch (e) {}

    try {
      if (window.parent?.document?.body) return window.parent.document;
    } catch (e) {}

    return document;
  }

  function getStorage() {
    try {
      return getP().localStorage || getRootWindow().localStorage || window.localStorage;
    } catch (e) {
      return window.localStorage;
    }
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeHexColor(value, fallback) {
    const raw = String(value || '').trim();

    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const r = raw[1];
      const g = raw[2];
      const b = raw[3];
      return ('#' + r + r + g + g + b + b).toUpperCase();
    }

    return String(fallback || '#560B35').toUpperCase();
  }

  function sanitizeTheme(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};

    return {
      dialogBg: normalizeHexColor(source.dialogBg, DEFAULT_THEME.dialogBg),
      avatarBg: normalizeHexColor(source.avatarBg, DEFAULT_THEME.avatarBg),
      borderColor: normalizeHexColor(source.borderColor, DEFAULT_THEME.borderColor),
      textColor: normalizeHexColor(source.textColor, DEFAULT_THEME.textColor),
    };
  }

  function getTheme() {
    if (themeCache) return themeCache;

    try {
      const saved = getStorage().getItem(STORAGE_KEY_THEME);
      if (saved) {
        themeCache = sanitizeTheme(JSON.parse(saved));
        return themeCache;
      }
    } catch (e) {
      console.warn('[头像心声框 V11] 读取颜色配置失败，使用默认颜色：', e);
    }

    themeCache = sanitizeTheme(DEFAULT_THEME);
    return themeCache;
  }

  function saveTheme(theme) {
    themeCache = sanitizeTheme(theme);

    try {
      getStorage().setItem(STORAGE_KEY_THEME, JSON.stringify(themeCache));
    } catch (e) {
      console.warn('[头像心声框 V11] 保存颜色配置失败：', e);
    }

    applyTheme(themeCache);
  }

  function cleanCssValue(value) {
    return String(value || '').replace(/[;{}<>]/g, '').trim();
  }

  function sanitizeFont(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawWeight = cleanCssValue(source.weight || DEFAULT_FONT.weight);
    const weight = /^(normal|bold|[1-9]00)$/i.test(rawWeight) ? rawWeight : DEFAULT_FONT.weight;

    return {
      cssUrl: String(source.cssUrl || DEFAULT_FONT.cssUrl).trim(),
      family: cleanCssValue(source.family || DEFAULT_FONT.family),
      fallback: cleanCssValue(source.fallback || DEFAULT_FONT.fallback),
      weight,
    };
  }

  function quoteFamilyName(name) {
    const clean = cleanCssValue(name);
    if (!clean) return 'serif';

    const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset)$/i;
    if (generic.test(clean)) return clean;

    return `"${clean.replace(/"/g, '').replace(/\\/g, '')}"`;
  }

  function buildFontStack(font) {
    const clean = sanitizeFont(font);
    const family = quoteFamilyName(clean.family);
    const fallback = clean.fallback || DEFAULT_FONT.fallback;
    return `${family}, ${fallback}`;
  }

  function getFontConfig() {
    if (fontCache) return fontCache;

    try {
      const saved = getStorage().getItem(STORAGE_KEY_FONT);
      if (saved) {
        fontCache = sanitizeFont(JSON.parse(saved));
        return fontCache;
      }
    } catch (e) {
      console.warn('[头像心声框 V11] 读取字体配置失败，使用默认字体：', e);
    }

    fontCache = sanitizeFont(DEFAULT_FONT);
    return fontCache;
  }

  function injectFontLinkInDoc(doc, font = getFontConfig()) {
    if (!doc || !doc.head) return;

    const clean = sanitizeFont(font);
    const id = 'st-heart-hb-custom-font-link-v11';
    const old = doc.getElementById(id);

    if (!clean.cssUrl) {
      old?.remove?.();
      return;
    }

    if (old) {
      if (old.getAttribute('href') !== clean.cssUrl) old.setAttribute('href', clean.cssUrl);
      return;
    }

    const link = doc.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = clean.cssUrl;
    doc.head.appendChild(link);
  }

  function applyFont(font = getFontConfig()) {
    const clean = sanitizeFont(font);
    const stack = buildFontStack(clean);
    const docs = [document, getRootDoc()].filter(Boolean);

    docs.forEach((doc) => {
      try {
        injectFontLinkInDoc(doc, clean);
        const root = doc.documentElement;
        root.style.setProperty('--st-heart-hb-font-stack', stack);
        root.style.setProperty('--st-heart-hb-font-weight', clean.weight);
      } catch (e) {}
    });
  }

  function saveFontConfig(font) {
    fontCache = sanitizeFont(font);

    try {
      getStorage().setItem(STORAGE_KEY_FONT, JSON.stringify(fontCache));
    } catch (e) {
      console.warn('[头像心声框 V11] 保存字体配置失败：', e);
    }

    applyFont(fontCache);
  }

  function sanitizePools(rawPools) {
    const output = {};

    if (!rawPools || typeof rawPools !== 'object') return output;

    Object.keys(rawPools).forEach((rawStatus) => {
      const status = String(rawStatus || '').trim();
      const urls = Array.isArray(rawPools[rawStatus]) ? rawPools[rawStatus] : [];
      const cleanUrls = Array.from(new Set(
        urls.map((url) => String(url || '').trim()).filter(Boolean)
      ));

      if (status && cleanUrls.length) output[status] = cleanUrls;
    });

    return output;
  }

  function getStatusPools() {
    if (statusPoolsCache) return statusPoolsCache;

    try {
      let saved = getStorage().getItem(STORAGE_KEY_STATUS_POOLS);
      if (!saved) saved = getStorage().getItem(LEGACY_STORAGE_KEY_STATUS_POOLS);
      if (saved) {
        const clean = sanitizePools(JSON.parse(saved));
        if (Object.keys(clean).length) {
          statusPoolsCache = clean;
          return statusPoolsCache;
        }
      }
    } catch (e) {
      console.warn('[头像心声框 V11] 读取头像配置失败，使用默认头像：', e);
    }

    statusPoolsCache = cloneJson(DEFAULT_STATUS_POOLS);
    return statusPoolsCache;
  }

  function saveStatusPools(pools) {
    const clean = sanitizePools(pools);
    statusPoolsCache = Object.keys(clean).length ? clean : cloneJson(DEFAULT_STATUS_POOLS);

    try {
      getStorage().setItem(STORAGE_KEY_STATUS_POOLS, JSON.stringify(statusPoolsCache));
    } catch (e) {
      console.warn('[头像心声框 V11] 保存头像配置失败：', e);
    }
  }

  function getBgEnabled() {
    try {
      return getStorage().getItem(STORAGE_KEY_BG) !== '0';
    } catch (e) {
      return true;
    }
  }

  function setBgEnabled(value) {
    try {
      getStorage().setItem(STORAGE_KEY_BG, value ? '1' : '0');
    } catch (e) {}

    applyBgModeToAll();
  }

  function applyBgModeToAll() {
    const docs = [document, getRootDoc()].filter(Boolean);
    const enabled = getBgEnabled();

    docs.forEach((doc) => {
      try {
        doc.querySelectorAll('.st-heart-hb-box').forEach((box) => {
          box.classList.toggle('st-heart-hb-bg-off', !enabled);
        });
      } catch (e) {}
    });
  }

  function applyTheme(theme = getTheme()) {
    const clean = sanitizeTheme(theme);
    const docs = [document, getRootDoc()].filter(Boolean);

    docs.forEach((doc) => {
      try {
        const root = doc.documentElement;
        root.style.setProperty('--st-heart-hb-dialog-bg', clean.dialogBg);
        root.style.setProperty('--st-heart-hb-avatar-bg', clean.avatarBg);
        root.style.setProperty('--st-heart-hb-border-color', clean.borderColor);
        root.style.setProperty('--st-heart-hb-text-color', clean.textColor);
      } catch (e) {}
    });
  }

  function injectStyleInDoc(doc) {
    if (!doc || !doc.head) return;

    if (doc.getElementById('st-heart-hb-style-v11')) return;

    const style = doc.createElement('style');
    style.id = 'st-heart-hb-style-v11';
    style.textContent = `
      .st-heart-hb-box,
      .st-heart-hb-box * {
        box-sizing: border-box;
      }

      .st-heart-hb-box {
        width: min(100%, 430px);
        max-width: calc(100vw - 16px);
        margin: 10px auto 12px;
        padding: 0;
        overflow: visible;
        font-family: var(--st-heart-hb-font-stack, "Noto Serif SC", "Source Han Serif SC", "SimSun", serif);
        font-weight: var(--st-heart-hb-font-weight, 500);
        position: relative;
      }

      .st-heart-hb-inner {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: 0;
        cursor: pointer;
        user-select: none;
        color: var(--st-heart-hb-text-color, #F2EAD7);
        overflow: visible;
        filter: drop-shadow(0 7px 14px rgba(44, 3, 25, 0.32));
      }

      .st-heart-hb-avatar {
        width: 74px;
        height: 74px;
        flex: 0 0 74px;
        border: 1px solid var(--st-heart-hb-border-color, #DDCFA4);
        background: var(--st-heart-hb-avatar-bg, #560B35);
        background:
          radial-gradient(
            circle at 50% 34%,
            color-mix(in srgb, var(--st-heart-hb-avatar-bg, #560B35) 68%, white 20%) 0%,
            var(--st-heart-hb-avatar-bg, #560B35) 58%,
            color-mix(in srgb, var(--st-heart-hb-avatar-bg, #560B35) 34%, black 66%) 100%
          );
        overflow: hidden;
        position: relative;
        z-index: 2;
        box-shadow:
          inset 0 0 0 1px rgba(86, 11, 53, 0.68),
          inset 0 0 16px rgba(0, 0, 0, 0.26),
          0 3px 8px rgba(44, 3, 25, 0.28);
        transition: background 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }

      .st-heart-hb-bg-off .st-heart-hb-avatar {
        background: transparent !important;
        box-shadow: 0 3px 8px rgba(44, 3, 25, 0.28);
      }

      .st-heart-hb-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .st-heart-hb-dialogue {
        flex: 1 1 0;
        width: 0;
        min-width: 0;
        max-width: none;
        min-height: 58px;
        height: auto;
        margin-top: 8px;
        margin-left: -1px;
        border: 1px solid var(--st-heart-hb-border-color, #DDCFA4);
        background: var(--st-heart-hb-dialog-bg, #560B35);
        background:
          radial-gradient(
            circle at 12% 0%,
            color-mix(in srgb, var(--st-heart-hb-dialog-bg, #560B35) 58%, #f4a0c8 28%) 0%,
            transparent 34%
          ),
          linear-gradient(
            180deg,
            var(--st-heart-hb-dialog-bg, #560B35),
            color-mix(in srgb, var(--st-heart-hb-dialog-bg, #560B35) 34%, black 66%)
          );
        padding: 9px 28px 16px 12px;
        line-height: 1.65;
        font-size: 0.9em;
        word-break: break-word;
        overflow-wrap: anywhere;
        white-space: normal;
        overflow: visible;
        position: relative;
        box-shadow:
          inset 0 0 18px rgba(0,0,0,0.18),
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 3px 8px rgba(44, 3, 25, 0.18);
      }

      .st-heart-hb-dialogue::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        background:
          repeating-linear-gradient(
            135deg,
            rgba(255, 220, 236, 0.03) 0,
            rgba(255, 220, 236, 0.03) 1px,
            transparent 1px,
            transparent 10px
          );
        pointer-events: none;
      }

      .st-heart-hb-dialogue::after {
        content: "◇";
        position: absolute;
        right: 9px;
        bottom: 4px;
        z-index: 3;
        display: block;
        font-size: 0.82em;
        line-height: 1;
        color: color-mix(in srgb, var(--st-heart-hb-text-color, #F2EAD7) 72%, #f4a0c8 28%);
        opacity: 0.92;
        text-shadow: 0 0 7px rgba(244, 160, 200, 0.34);
        pointer-events: none;
        animation: stHeartHbDiamondFloatV11 2.8s ease-in-out infinite;
      }

      @keyframes stHeartHbDiamondFloatV11 {
        0%, 100% { transform: translateY(0); opacity: 0.72; }
        50% { transform: translateY(-4px); opacity: 1; }
      }

      .st-heart-hb-text {
        text-shadow: 0 1px 2px rgba(0,0,0,0.18);
        position: relative;
        z-index: 1;
        display: block;
        max-width: 100%;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .st-heart-hb-char {
        opacity: 0;
        display: inline;
        animation: stHeartHbCharAppear 90ms ease forwards;
      }

      @keyframes stHeartHbCharAppear {
        from {
          opacity: 0;
          filter: blur(1px);
        }

        to {
          opacity: 1;
          filter: blur(0);
        }
      }

      dialog.st-heart-hb-dialog-v11,
      dialog.st-heart-hb-dialog-v11 * {
        box-sizing: border-box;
      }

      dialog.st-heart-hb-dialog-v11 {
        width: min(780px, 96vw) !important;
        max-width: 96vw !important;
        max-height: 90vh !important;
        margin: auto !important;
        padding: 0 !important;
        border: 1px solid rgba(235, 211, 171, 0.72) !important;
        background: transparent !important;
        color: #f7ead8 !important;
        overflow: hidden !important;
        box-shadow: 0 18px 52px rgba(0, 0, 0, 0.5) !important;
        z-index: 2147483647 !important;
      }

      dialog.st-heart-hb-dialog-v11::backdrop {
        background: rgba(12, 3, 9, 0.62) !important;
        backdrop-filter: blur(2px);
      }

      .st-heart-hb-settings-card-v11 {
        width: 100% !important;
        max-height: 90vh !important;
        overflow: auto !important;
        padding: 14px !important;
        background:
          radial-gradient(circle at 0% 0%, rgba(170, 52, 112, 0.22), transparent 32%),
          linear-gradient(180deg, rgba(86, 11, 53, 0.98), rgba(29, 3, 18, 0.98)) !important;
        -webkit-overflow-scrolling: touch;
        font-family: var(--st-heart-hb-font-stack, "Noto Serif SC", "Source Han Serif SC", "SimSun", serif);
      }

      .st-heart-hb-settings-head-v11 {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .st-heart-hb-settings-title-v11 {
        font-size: 1.08em;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .st-heart-hb-close-v11,
      .st-heart-hb-btn-v11 {
        border: 1px solid rgba(235, 211, 171, 0.48);
        background: rgba(255,255,255,0.07);
        color: #fff1dd;
        cursor: pointer;
        font: inherit;
        touch-action: manipulation;
      }

      .st-heart-hb-close-v11 {
        width: 32px;
        height: 32px;
        font-size: 18px;
        line-height: 1;
      }

      .st-heart-hb-btn-v11 {
        padding: 7px 10px;
        font-size: 0.88em;
        white-space: nowrap;
      }

      .st-heart-hb-btn-v11.primary {
        border-color: rgba(255, 220, 166, 0.72);
        background: rgba(255, 220, 166, 0.14);
      }

      .st-heart-hb-btn-v11.danger {
        border-color: rgba(255, 164, 190, 0.48);
        color: #ffd4df;
      }

      .st-heart-hb-tip-v11 {
        margin: 0 0 12px;
        padding: 9px 10px;
        border: 1px solid rgba(235, 211, 171, 0.25);
        background: rgba(255,255,255,0.045);
        color: rgba(247, 234, 216, 0.86);
        font-size: 0.86em;
        line-height: 1.65;
      }

      .st-heart-hb-settings-grid-v11 {
        display: grid;
        grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
        gap: 12px;
      }

      .st-heart-hb-section-v11 {
        border: 1px solid rgba(235, 211, 171, 0.36);
        background: rgba(15, 3, 10, 0.22);
        padding: 10px;
      }

      .st-heart-hb-section-title-v11 {
        font-weight: 700;
        margin-bottom: 8px;
        color: #fff1dd;
      }

      .st-heart-hb-color-row-v11 {
        display: grid;
        grid-template-columns: 74px 46px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 0.88em;
      }

      .st-heart-hb-color-row-v11 input[type="color"] {
        width: 46px;
        height: 34px;
        padding: 0;
        border: 1px solid rgba(235, 211, 171, 0.42);
        background: transparent;
      }

      .st-heart-hb-input-v11 {
        width: 100%;
        min-width: 0;
        border: 1px solid rgba(235, 211, 171, 0.42);
        background: rgba(255,255,255,0.08);
        color: #fff4df;
        padding: 7px 8px;
        outline: none;
        font: inherit;
        font-size: 0.88em;
      }

      .st-heart-hb-input-v11::placeholder {
        color: rgba(247, 234, 216, 0.42);
      }

      .st-heart-hb-text-row-v11 {
        display: grid;
        grid-template-columns: 74px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 0.88em;
      }

      .st-heart-hb-section-spacer-v11 {
        margin-top: 14px;
      }

      .st-heart-hb-preview-v11 {
        display: flex;
        align-items: flex-start;
        gap: 0;
        margin-top: 10px;
        font-family: var(--st-heart-hb-preview-font-stack, var(--st-heart-hb-font-stack, "Noto Serif SC", "Source Han Serif SC", "SimSun", serif));
        font-weight: var(--st-heart-hb-preview-font-weight, var(--st-heart-hb-font-weight, 500));
      }

      .st-heart-hb-preview-avatar-v11 {
        width: 60px;
        height: 60px;
        flex: 0 0 60px;
        border: 1px solid var(--st-heart-hb-preview-border, #DDCFA4);
        background: var(--st-heart-hb-preview-avatar, #560B35);
        background:
          radial-gradient(circle at 50% 34%,
            color-mix(in srgb, var(--st-heart-hb-preview-avatar, #560B35) 68%, white 20%) 0%,
            var(--st-heart-hb-preview-avatar, #560B35) 58%,
            color-mix(in srgb, var(--st-heart-hb-preview-avatar, #560B35) 34%, black 66%) 100%
          );
      }

      .st-heart-hb-preview-dialogue-v11 {
        min-height: 48px;
        flex: 1 1 auto;
        margin-top: 7px;
        margin-left: -1px;
        border: 1px solid var(--st-heart-hb-preview-border, #DDCFA4);
        background: var(--st-heart-hb-preview-dialog, #560B35);
        background:
          radial-gradient(circle at 12% 0%,
            color-mix(in srgb, var(--st-heart-hb-preview-dialog, #560B35) 58%, #f4a0c8 28%) 0%,
            transparent 34%
          ),
          linear-gradient(180deg,
            var(--st-heart-hb-preview-dialog, #560B35),
            color-mix(in srgb, var(--st-heart-hb-preview-dialog, #560B35) 34%, black 66%)
          );
        color: var(--st-heart-hb-preview-text, #F2EAD7);
        padding: 8px 10px;
        line-height: 1.55;
        font-size: 0.86em;
      }

      .st-heart-hb-status-list-v11 {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .st-heart-hb-status-block-v11 {
        border: 1px solid rgba(235, 211, 171, 0.3);
        background: rgba(255,255,255,0.035);
        padding: 9px;
      }

      .st-heart-hb-status-head-v11,
      .st-heart-hb-url-row-v11,
      .st-heart-hb-actions-v11 {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .st-heart-hb-status-head-v11 {
        margin-bottom: 7px;
      }

      .st-heart-hb-label-v11 {
        flex: 0 0 auto;
        color: rgba(247, 234, 216, 0.82);
        font-size: 0.86em;
      }

      .st-heart-hb-url-list-v11 {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .st-heart-hb-actions-v11 {
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .st-heart-hb-footer-v11 {
        position: sticky;
        bottom: -14px;
        z-index: 5;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin: 14px -14px -14px;
        padding: 12px 14px;
        border-top: 1px solid rgba(235, 211, 171, 0.28);
        background: rgba(24, 3, 16, 0.96);
      }

      @media (max-width: 620px) {
        .st-heart-hb-settings-grid-v11 {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 460px) {
        dialog.st-heart-hb-dialog-v11 {
          width: calc(100vw - 14px) !important;
          max-width: calc(100vw - 14px) !important;
          max-height: 92vh !important;
        }

        .st-heart-hb-settings-card-v11 {
          max-height: 92vh !important;
          padding: 11px !important;
        }

        .st-heart-hb-color-row-v11 {
          grid-template-columns: 62px 42px minmax(0, 1fr);
          gap: 6px;
        }

        .st-heart-hb-url-row-v11 {
          align-items: stretch;
        }

        .st-heart-hb-footer-v11 {
          margin: 12px -11px -11px;
          padding: 10px 11px;
        }

        .st-heart-hb-avatar {
          width: 62px;
          height: 62px;
          flex-basis: 62px;
        }

        .st-heart-hb-dialogue {
          font-size: 0.88em;
          padding: 8px 26px 15px 10px;
        }
      }
    `;

    doc.head.appendChild(style);
  }

  function injectStyles() {
    injectStyleInDoc(document);
    injectStyleInDoc(getRootDoc());
    applyTheme();
    applyFont();
  }

  function cleanStatusName(status) {
    return String(status || '').trim() || '普通';
  }

  function resolveStatusKey(status, pools) {
    const raw = cleanStatusName(status);

    if (pools[raw]?.length) return raw;

    const lower = raw.toLowerCase();
    const caseMatchedKey = Object.keys(pools).find((key) => key.toLowerCase() === lower);
    if (caseMatchedKey && pools[caseMatchedKey]?.length) return caseMatchedKey;

    const aliasMap = {
      高兴: 'sex',
      开心: 'sex',
      愉快: 'sex',
      失落: '不高兴',
      低落: '不高兴',
      难过: '不高兴',
    };

    const alias = aliasMap[raw];
    if (alias && pools[alias]?.length) return alias;

    if (pools.普通?.length) return '普通';

    return Object.keys(pools).find((key) => pools[key]?.length) || '';
  }

  function getAvatarByStatus(status) {
    const pools = getStatusPools();
    const key = resolveStatusKey(status, pools);
    const pool = pools[key] || [];

    if (!pool.length) return '';
    if (pool.length === 1) return pool[0];

    return pool[Math.floor(Math.random() * pool.length)];
  }

  function hashString(input) {
    const str = String(input || '');
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }

    return String(Math.abs(hash));
  }

  function makeHBHash(data) {
    if (data?.mode === 'sequence') {
      return hashString([
        data.id,
        'sequence',
        ...(Array.isArray(data.segments) ? data.segments.map((item) => `${item.status}：${item.text}`) : []),
      ].join('|'));
    }

    return hashString([data.id, data.outerStatus, data.outer, data.innerStatus, data.inner].join('|'));
  }

  function parseSequenceLines(block, messageId) {
    const segments = [];
    const lines = String(block || '').split(/\r?\n/);

    lines.forEach((line) => {
      const rawLine = String(line || '').trim();
      if (!rawLine) return;

      const match = rawLine.match(/^([^：:\n\r]+?)\s*[:：]\s*([\s\S]*)$/);

      if (match) {
        const status = cleanStatusName(match[1]);
        const text = String(match[2] || '').trim();
        const lowerStatus = status.toLowerCase();

        // outer / inner 属于旧格式，不当成连续台词状态。
        if ((lowerStatus === 'outer' || lowerStatus === 'inner') && !text) return;

        if (text) {
          segments.push({ status, text });
        }

        return;
      }

      // 没有冒号的行，当作上一句的续行，方便台词里偶尔换行。
      if (segments.length) {
        const last = segments[segments.length - 1];
        last.text = `${last.text}\n${rawLine}`;
      }
    });

    if (!segments.length) return null;

    const data = {
      id: messageId,
      mode: 'sequence',
      segments,
    };

    data.hash = makeHBHash(data);
    return data;
  }

  function parseHBFromText(text, messageId) {
    const raw = String(text || '');
    const blockMatch = raw.match(/\[HB\]([\s\S]*?)\[\/HB\]/i);

    if (!blockMatch) return null;

    const block = blockMatch[1].trim();

    const outerRe = /(^|\n)\s*(?:([^\n\r|：:]+?)\s*\|\s*)?outer[:：]\s*/i;
    const innerRe = /(^|\n)\s*(?:([^\n\r|：:]+?)\s*\|\s*)?inner[:：]\s*/i;

    const outerMatch = outerRe.exec(block);
    const innerMatch = innerRe.exec(block);

    if (outerMatch && innerMatch && outerMatch.index < innerMatch.index) {
      const outerStart = outerMatch.index + outerMatch[0].length;
      const innerStart = innerMatch.index + innerMatch[0].length;

      const data = {
        id: messageId,
        mode: 'toggle',
        outerStatus: cleanStatusName(outerMatch[2] || '普通'),
        outer: block.slice(outerStart, innerMatch.index).trim(),
        innerStatus: cleanStatusName(innerMatch[2] || '普通'),
        inner: block.slice(innerStart).trim(),
      };

      if (!data.outer && !data.inner) return null;

      data.hash = makeHBHash(data);
      return data;
    }

    const combined = raw.match(/\[HB\]\s*([^\n\r|：:]+?)\s*\|\s*outer[:：]\s*([\s\S]*?)\s*([^\n\r|：:]+?)\s*\|\s*inner[:：]\s*([\s\S]*?)\s*\[\/HB\]/i);

    if (combined) {
      const data = {
        id: messageId,
        mode: 'toggle',
        outerStatus: cleanStatusName(combined[1]),
        outer: combined[2].trim(),
        innerStatus: cleanStatusName(combined[3]),
        inner: combined[4].trim(),
      };
      data.hash = makeHBHash(data);
      return data;
    }

    const old = raw.match(/\[HB\]\s*outer[:：]\s*([\s\S]*?)\s*inner[:：]\s*([\s\S]*?)\s*\[\/HB\]/i);

    if (old) {
      const data = {
        id: messageId,
        mode: 'toggle',
        outerStatus: '普通',
        outer: old[1].trim(),
        innerStatus: '普通',
        inner: old[2].trim(),
      };
      data.hash = makeHBHash(data);
      return data;
    }

    return parseSequenceLines(block, messageId);
  }

  function getContext() {
    const P = getP();

    return (
      P.SillyTavern?.getContext?.() ||
      P.getContext?.() ||
      window.SillyTavern?.getContext?.() ||
      window.getContext?.() ||
      null
    );
  }

  function getChat() {
    const ctx = getContext();
    return ctx?.chat || getP().chat || window.chat || null;
  }

  function findHBByMessageId(messageId) {
    const chat = getChat();
    if (!Array.isArray(chat)) return null;

    const msg = chat[messageId];
    if (!msg) return null;

    const text = String(msg?.mes ?? msg?.message ?? msg?.text ?? '');
    return parseHBFromText(text, messageId);
  }

  function findLastHB() {
    const chat = getChat();
    if (!Array.isArray(chat)) return null;

    for (let i = chat.length - 1; i >= Math.max(0, chat.length - 30); i--) {
      const data = findHBByMessageId(i);
      if (data) return data;
    }

    return null;
  }

  function getMessageHost(messageId) {
    try {
      const P = getP();
      const fn = P.retrieveDisplayedMessage || window.retrieveDisplayedMessage;

      if (typeof fn === 'function') {
        const result = fn(messageId);

        if (result?.length) return result[0];
        if (result instanceof Element) return result;
      }
    } catch (e) {}

    const docs = [document, getRootDoc()].filter(Boolean);
    const selectors = [
      `.mes[mesid="${messageId}"]`,
      `.mes[message_id="${messageId}"]`,
      `.mes[data-message-id="${messageId}"]`,
      `[mesid="${messageId}"]`,
    ];

    for (const doc of docs) {
      try {
        for (const selector of selectors) {
          const node = doc.querySelector(selector);
          if (node) return node;
        }
      } catch (e) {}
    }

    return null;
  }

  function cancelTypingInBox(box) {
    box.querySelectorAll?.('.st-heart-hb-text').forEach((container) => {
      if (container.__heartTypingTimer) {
        clearTimeout(container.__heartTypingTimer);
        container.__heartTypingTimer = null;
      }

      container.__heartTypingRun = (container.__heartTypingRun || 0) + 1;
    });
  }

  function cleanupOldHeartBoxes() {
    const doc = getRootDoc();
    const boxes = Array.from(doc.querySelectorAll('.st-heart-hb-box'));

    if (boxes.length <= KEEP_HB_BOX_COUNT) return;

    boxes.sort((a, b) => Number(b.dataset.hbMessageId || -1) - Number(a.dataset.hbMessageId || -1));

    boxes.slice(KEEP_HB_BOX_COUNT).forEach((box) => {
      cancelTypingInBox(box);
      box.remove();
    });
  }

  function fillTypedText(container, text) {
    const doc = container?.ownerDocument || getRootDoc();

    if (!container) return;

    if (container.__heartTypingTimer) {
      clearTimeout(container.__heartTypingTimer);
      container.__heartTypingTimer = null;
    }

    container.__heartTypingRun = (container.__heartTypingRun || 0) + 1;
    const runId = container.__heartTypingRun;

    container.textContent = '';

    const chars = Array.from(text || '');
    let index = 0;

    function appendNextChar() {
      if (container.__heartTypingRun !== runId) return;
      if (index >= chars.length) return;

      const char = chars[index];

      if (char === '\n') {
        container.appendChild(doc.createElement('br'));
      } else {
        const span = doc.createElement('span');
        span.className = 'st-heart-hb-char';
        span.textContent = char === ' ' ? '\u00A0' : char;
        container.appendChild(span);
      }

      index++;
      container.__heartTypingTimer = setTimeout(appendNextChar, SPEED_MS);
    }

    appendNextChar();
  }

  function buildHeartBox(data, doc) {
    const box = doc.createElement('div');
    box.className = 'st-heart-hb-box';
    box.dataset.hbMessageId = String(data.id);
    box.dataset.hbHash = String(data.hash || '');

    const inner = doc.createElement('div');
    inner.className = 'st-heart-hb-inner';

    const avatar = doc.createElement('div');
    avatar.className = 'st-heart-hb-avatar';

    const img = doc.createElement('img');
    avatar.appendChild(img);

    const dialogue = doc.createElement('div');
    dialogue.className = 'st-heart-hb-dialogue';

    const text = doc.createElement('span');
    text.className = 'st-heart-hb-text';
    dialogue.appendChild(text);

    inner.appendChild(avatar);
    inner.appendChild(dialogue);
    box.appendChild(inner);

    if (data?.mode === 'sequence' && Array.isArray(data.segments) && data.segments.length) {
      const segments = data.segments.map((segment) => ({
        status: cleanStatusName(segment.status),
        text: String(segment.text || '').trim(),
        avatar: getAvatarByStatus(segment.status),
      })).filter((segment) => segment.text);

      box.dataset.mode = 'sequence';
      box.dataset.index = '0';

      function renderSequence() {
        const max = segments.length;
        let index = Number(box.dataset.index || 0);

        if (!Number.isFinite(index) || index < 0) index = 0;
        if (index >= max) index = 0;

        const current = segments[index] || segments[0];

        img.src = current.avatar || '';
        img.alt = current.status || '普通';
        box.dataset.currentStatus = current.status || '普通';

        fillTypedText(text, current.text || '');
      }

      inner.addEventListener('click', () => {
        const max = segments.length;
        if (max <= 1) {
          renderSequence();
          return;
        }

        const current = Number(box.dataset.index || 0);
        box.dataset.index = String((Number.isFinite(current) ? current + 1 : 1) % max);
        renderSequence();
      });

      renderSequence();
      return box;
    }

    box.dataset.mode = 'outer';

    const outerAvatar = getAvatarByStatus(data.outerStatus);
    const innerAvatar = getAvatarByStatus(data.innerStatus);

    function renderToggle() {
      const mode = box.dataset.mode || 'outer';
      const currentText = mode === 'outer' ? data.outer : data.inner;
      const currentStatus = mode === 'outer' ? data.outerStatus : data.innerStatus;

      img.src = mode === 'outer' ? outerAvatar : innerAvatar;
      img.alt = currentStatus;
      box.dataset.currentStatus = currentStatus || '普通';

      fillTypedText(text, currentText);
    }

    inner.addEventListener('click', () => {
      box.dataset.mode = box.dataset.mode === 'outer' ? 'inner' : 'outer';
      renderToggle();
    });

    renderToggle();
    return box;
  }

  function renderHBForMessage(messageId) {
    injectStyles();

    let data = null;

    if (typeof messageId === 'number' && Number.isFinite(messageId)) {
      data = findHBByMessageId(messageId);
    }

    if (!data) data = findLastHB();
    if (!data) return false;

    const host = getMessageHost(data.id);
    if (!host) return false;

    const doc = host.ownerDocument || getRootDoc();
    injectStyleInDoc(doc);
    applyTheme();

    const existing = host.querySelector?.('.st-heart-hb-box');

    if (existing && existing.dataset.hbHash === String(data.hash || '')) {
      cleanupOldHeartBoxes();
      applyBgModeToAll();
      return true;
    }

    host.querySelectorAll?.('.st-heart-hb-box').forEach((node) => {
      cancelTypingInBox(node);
      node.remove();
    });

    const box = buildHeartBox(data, doc);
    host.appendChild(box);

    cleanupOldHeartBoxes();
    applyBgModeToAll();

    return true;
  }

  function rebuildVisibleHeartBoxesAfterConfigChange() {
    const doc = getRootDoc();
    const ids = Array.from(doc.querySelectorAll('.st-heart-hb-box'))
      .map((box) => Number(box.dataset.hbMessageId))
      .filter((id) => Number.isFinite(id));

    const uniqueIds = Array.from(new Set(ids));

    if (!uniqueIds.length) {
      renderHBForMessage(undefined);
      return;
    }

    uniqueIds.forEach((id) => {
      const host = getMessageHost(id);
      host?.querySelectorAll?.('.st-heart-hb-box').forEach((node) => {
        cancelTypingInBox(node);
        node.remove();
      });
      renderHBForMessage(id);
    });

    cleanupOldHeartBoxes();
    applyBgModeToAll();
  }

  function colorRow(label, key, value) {
    const safeKey = escapeHtml(key);
    const safeValue = escapeHtml(value);

    return `
      <label class="st-heart-hb-color-row-v11">
        <span>${escapeHtml(label)}</span>
        <input type="color" data-theme-key="${safeKey}" value="${safeValue}">
        <input class="st-heart-hb-input-v11" type="text" data-theme-text="${safeKey}" value="${safeValue}" placeholder="#560B35">
      </label>
    `;
  }

  function fontRow(label, key, value, placeholder = '') {
    const safeKey = escapeHtml(key);
    const safeValue = escapeHtml(value);

    return `
      <label class="st-heart-hb-text-row-v11">
        <span>${escapeHtml(label)}</span>
        <input class="st-heart-hb-input-v11" type="text" data-font-field="${safeKey}" value="${safeValue}" placeholder="${escapeHtml(placeholder)}">
      </label>
    `;
  }

  function statusBlockHtml(status = '', urls = ['']) {
    const cleanUrls = Array.isArray(urls) && urls.length ? urls : [''];

    return `
      <div class="st-heart-hb-status-block-v11" data-status-block="1">
        <div class="st-heart-hb-status-head-v11">
          <span class="st-heart-hb-label-v11">状态名</span>
          <input class="st-heart-hb-input-v11" type="text" data-status-name="1" value="${escapeHtml(status)}" placeholder="普通 / sex / 害羞 / 病娇">
          <button type="button" class="st-heart-hb-btn-v11 danger" data-action="remove-status">删除</button>
        </div>
        <div class="st-heart-hb-url-list-v11" data-url-list="1">
          ${cleanUrls.map((url) => `
            <div class="st-heart-hb-url-row-v11" data-url-row="1">
              <input class="st-heart-hb-input-v11" type="url" data-avatar-url="1" value="${escapeHtml(url)}" placeholder="图片网址，最好以 .png / .jpg / .webp 结尾">
              <button type="button" class="st-heart-hb-btn-v11 danger" data-action="remove-url">-</button>
            </div>
          `).join('')}
        </div>
        <div class="st-heart-hb-actions-v11">
          <button type="button" class="st-heart-hb-btn-v11" data-action="add-url">+ 添加图片网址</button>
        </div>
      </div>
    `;
  }

  function renderStatusBlocks(pools) {
    const clean = sanitizePools(pools);
    const keys = Object.keys(clean);

    if (!keys.length) return statusBlockHtml('', ['']);
    return keys.map((status) => statusBlockHtml(status, clean[status])).join('');
  }

  function collectSettings(container) {
    const themeDraft = {};

    container.querySelectorAll('[data-theme-key]').forEach((input) => {
      themeDraft[input.dataset.themeKey] = input.value;
    });

    const fontDraft = {};

    container.querySelectorAll('[data-font-field]').forEach((input) => {
      fontDraft[input.dataset.fontField] = input.value;
    });

    const poolsDraft = {};

    container.querySelectorAll('[data-status-block]').forEach((block) => {
      const status = String(block.querySelector('[data-status-name]')?.value || '').trim();
      const urls = Array.from(block.querySelectorAll('[data-avatar-url]'))
        .map((input) => String(input.value || '').trim())
        .filter(Boolean);

      if (status && urls.length) poolsDraft[status] = Array.from(new Set(urls));
    });

    return {
      theme: sanitizeTheme(themeDraft),
      font: sanitizeFont(fontDraft),
      pools: sanitizePools(poolsDraft),
    };
  }

  function updatePreview(container, theme, font = getFontConfig()) {
    const clean = sanitizeTheme(theme);
    const preview = container.querySelector('.st-heart-hb-preview-v11');

    if (!preview) return;

    preview.style.setProperty('--st-heart-hb-preview-dialog', clean.dialogBg);
    preview.style.setProperty('--st-heart-hb-preview-avatar', clean.avatarBg);
    preview.style.setProperty('--st-heart-hb-preview-border', clean.borderColor);
    preview.style.setProperty('--st-heart-hb-preview-text', clean.textColor);
    preview.style.setProperty('--st-heart-hb-preview-font-stack', buildFontStack(font));
    preview.style.setProperty('--st-heart-hb-preview-font-weight', sanitizeFont(font).weight);
  }

  function syncColorPair(container, changedInput) {
    const key = changedInput.dataset.themeKey || changedInput.dataset.themeText;
    if (!key) return;

    const fallback = DEFAULT_THEME[key] || '#560B35';
    const value = normalizeHexColor(changedInput.value, fallback);

    container.querySelectorAll(`[data-theme-key="${key}"], [data-theme-text="${key}"]`).forEach((input) => {
      input.value = value;
    });
  }

  function closeOldSettingsDialogs() {
    const docs = [document, getRootDoc()].filter(Boolean);

    docs.forEach((doc) => {
      try {
        doc.getElementById('st-heart-hb-settings-dialog-v11')?.remove?.();
        doc.getElementById('st-heart-hb-avatar-config-overlay')?.remove?.();
        doc.querySelectorAll('.st-heart-hb-inline-settings, #st-heart-hb-avatar-config-overlay').forEach((node) => node.remove());
      } catch (e) {}
    });
  }

  function openSettingsDialog() {
    injectStyles();

    const doc = getRootDoc();
    injectStyleInDoc(doc);
    applyTheme();
    closeOldSettingsDialogs();

    const originalTheme = sanitizeTheme(getTheme());
    const originalFont = sanitizeFont(getFontConfig());
    const originalPools = cloneJson(getStatusPools());
    let latestTheme = sanitizeTheme(originalTheme);
    let latestFont = sanitizeFont(originalFont);

    const dialog = doc.createElement('dialog');
    dialog.id = 'st-heart-hb-settings-dialog-v11';
    dialog.className = 'st-heart-hb-dialog-v11';

    dialog.innerHTML = `
      <div class="st-heart-hb-settings-card-v11">
        <div class="st-heart-hb-settings-head-v11">
          <div class="st-heart-hb-settings-title-v11">头像心声框设置</div>
          <button type="button" class="st-heart-hb-close-v11" data-action="cancel">×</button>
        </div>

        <div class="st-heart-hb-tip-v11">
          这里可以配置状态头像池、颜色和字体。连续台词模式中，冒号前面的状态名会引用同名头像池。
        </div>

        <div class="st-heart-hb-settings-grid-v11">
          <section class="st-heart-hb-section-v11">
            <div class="st-heart-hb-section-title-v11">颜色设置</div>
            ${colorRow('对话框', 'dialogBg', originalTheme.dialogBg)}
            ${colorRow('头像框', 'avatarBg', originalTheme.avatarBg)}
            ${colorRow('边框', 'borderColor', originalTheme.borderColor)}
            ${colorRow('文字', 'textColor', originalTheme.textColor)}

            <div class="st-heart-hb-actions-v11">
              <button type="button" class="st-heart-hb-btn-v11" data-action="reset-colors">恢复默认颜色</button>
            </div>

            <div class="st-heart-hb-preview-v11">
              <div class="st-heart-hb-preview-avatar-v11"></div>
              <div class="st-heart-hb-preview-dialogue-v11">颜色与字体预览：保存后，已经显示的心声框也会同步刷新。</div>
            </div>

            <div class="st-heart-hb-section-title-v11 st-heart-hb-section-spacer-v11">字体设置</div>
            ${fontRow('CSS链接', 'cssUrl', originalFont.cssUrl, 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700&display=swap')}
            ${fontRow('字体名', 'family', originalFont.family, 'Noto Serif SC / LXGW Neo XiHei')}
            ${fontRow('备用', 'fallback', originalFont.fallback, 'Source Han Serif SC, SimSun, serif')}
            ${fontRow('字重', 'weight', originalFont.weight, '400 / 500 / 700 / normal / bold')}
            <div class="st-heart-hb-actions-v11">
              <button type="button" class="st-heart-hb-btn-v11" data-action="reset-font">恢复默认字体</button>
            </div>
            <div class="st-heart-hb-tip-v11">
              CSS链接可填 Google Fonts 或 ZeoSeven 的字体 CSS 地址；字体名要和 CSS 里声明的 font-family 一致。
            </div>
          </section>

          <section class="st-heart-hb-section-v11">
            <div class="st-heart-hb-section-title-v11">状态头像配置</div>
            <div class="st-heart-hb-tip-v11">
              旧格式：<br>
              普通|outer：表面话。<br>
              sex|inner：内心话。<br><br>
              V11 连续台词格式：<br>
              普通：你好。<br>
              不高兴：今天会下雨吗？<br>
              害羞：带把伞吧。<br><br>
              冒号前面的状态名会引用这里的同名头像池。
            </div>
            <div class="st-heart-hb-status-list-v11" data-status-list="1">
              ${renderStatusBlocks(originalPools)}
            </div>
            <div class="st-heart-hb-actions-v11">
              <button type="button" class="st-heart-hb-btn-v11" data-action="add-status">+ 添加状态</button>
              <button type="button" class="st-heart-hb-btn-v11" data-action="reset-avatars">恢复默认头像</button>
            </div>
          </section>
        </div>

        <div class="st-heart-hb-footer-v11">
          <button type="button" class="st-heart-hb-btn-v11" data-action="cancel">关闭</button>
          <button type="button" class="st-heart-hb-btn-v11 primary" data-action="save">保存</button>
        </div>
      </div>
    `;

    (doc.body || doc.documentElement).appendChild(dialog);

    const container = dialog.querySelector('.st-heart-hb-settings-card-v11');

    function updateDraft() {
      const current = collectSettings(container);
      latestTheme = current.theme;
      latestFont = current.font;
      applyTheme(latestTheme);
      applyFont(latestFont);
      updatePreview(container, latestTheme, latestFont);
    }

    container.addEventListener('input', (event) => {
      if (event.target?.matches?.('[data-theme-key], [data-theme-text]')) {
        syncColorPair(container, event.target);
      }

      updateDraft();
    });

    container.addEventListener('click', (event) => {
      const btn = event.target?.closest?.('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'cancel') {
        applyTheme(originalTheme);
        applyFont(originalFont);
        dialog.close('cancel');
        return;
      }

      if (action === 'save') {
        const current = collectSettings(container);
        const cleanPools = sanitizePools(current.pools);

        if (!Object.keys(cleanPools).length) {
          alert('保存失败：至少保留一个状态，并且这个状态下至少有一个图片网址。');
          return;
        }

        saveStatusPools(cleanPools);
        saveTheme(current.theme);
        saveFontConfig(current.font);
        rebuildVisibleHeartBoxesAfterConfigChange();

        try {
          getP().toastr?.success?.('头像心声框设置已保存');
        } catch (e) {}

        dialog.close('save');
        return;
      }

      if (action === 'reset-colors') {
        Object.keys(DEFAULT_THEME).forEach((key) => {
          const value = normalizeHexColor(DEFAULT_THEME[key], DEFAULT_THEME[key]);
          container.querySelectorAll(`[data-theme-key="${key}"], [data-theme-text="${key}"]`).forEach((input) => {
            input.value = value;
          });
        });

        updateDraft();
        return;
      }

      if (action === 'reset-font') {
        const defaults = sanitizeFont(DEFAULT_FONT);

        Object.keys(defaults).forEach((key) => {
          const input = container.querySelector(`[data-font-field="${key}"]`);
          if (input) input.value = defaults[key];
        });

        updateDraft();
        return;
      }

      if (action === 'reset-avatars') {
        const list = container.querySelector('[data-status-list]');
        if (list) list.innerHTML = renderStatusBlocks(DEFAULT_STATUS_POOLS);
        updateDraft();
        return;
      }

      if (action === 'add-status') {
        const list = container.querySelector('[data-status-list]');
        if (list) {
          list.insertAdjacentHTML('beforeend', statusBlockHtml('', ['']));
          list.querySelector('[data-status-block]:last-child [data-status-name]')?.focus?.();
        }
        updateDraft();
        return;
      }

      if (action === 'remove-status') {
        btn.closest('[data-status-block]')?.remove?.();
        updateDraft();
        return;
      }

      if (action === 'add-url') {
        const block = btn.closest('[data-status-block]');
        const list = block?.querySelector?.('[data-url-list]');

        if (list) {
          list.insertAdjacentHTML('beforeend', `
            <div class="st-heart-hb-url-row-v11" data-url-row="1">
              <input class="st-heart-hb-input-v11" type="url" data-avatar-url="1" value="" placeholder="图片网址，最好以 .png / .jpg / .webp 结尾">
              <button type="button" class="st-heart-hb-btn-v11 danger" data-action="remove-url">-</button>
            </div>
          `);
          list.querySelector('[data-url-row]:last-child [data-avatar-url]')?.focus?.();
        }

        updateDraft();
        return;
      }

      if (action === 'remove-url') {
        btn.closest('[data-url-row]')?.remove?.();
        updateDraft();
      }
    });

    dialog.addEventListener('cancel', () => {
      applyTheme(originalTheme);
    });

    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'save') {
        applyTheme(originalTheme);
        applyFont(originalFont);
        fontCache = sanitizeFont(originalFont);
        statusPoolsCache = sanitizePools(originalPools);
      }

      dialog.remove();
    });

    updateDraft();

    try {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        alert('当前浏览器不支持网页原生 dialog。');
        dialog.remove();
      }
    } catch (e) {
      console.error('[头像心声框 V11] 打开设置 dialog 失败：', e);
      alert('打开设置界面失败：' + e.message);
      dialog.remove();
    }
  }

  function setupButtons() {
    const P = getP();
    const replaceButtons = P.replaceScriptButtons || window.replaceScriptButtons;
    const onButton = P.eventOnButton || window.eventOnButton;

    if (typeof replaceButtons !== 'function' || typeof onButton !== 'function') {
      console.warn('[头像心声框 V11] 未找到酒馆助手按钮 API：replaceScriptButtons / eventOnButton');
      return;
    }

    replaceButtons([
      { name: BUTTON_BG, visible: true },
      { name: BUTTON_SETTINGS, visible: true },
    ]);

    onButton(BUTTON_BG, () => {
      setBgEnabled(!getBgEnabled());
    });

    onButton(BUTTON_SETTINGS, () => {
      openSettingsDialog();
    });
  }

  function delayedRender(messageId) {
    const id = Number(messageId);

    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }

    renderTimer = setTimeout(() => {
      renderHBForMessage(Number.isFinite(id) ? id : undefined);
    }, 260);
  }

  function safeEventOn(eventName, handler) {
    try {
      const P = getP();
      const on = P.eventOn || window.eventOn;

      if (eventName && typeof on === 'function') on(eventName, handler);
    } catch (e) {
      console.warn('[头像心声框 V11] 事件绑定失败：', eventName, e);
    }
  }

  function bindEvents() {
    const P = getP();
    const ev = P.tavern_events || window.tavern_events;

    if (!ev) return;

    safeEventOn(ev.MESSAGE_RECEIVED, (messageId) => delayedRender(messageId));
    safeEventOn(ev.MESSAGE_EDITED, (messageId) => delayedRender(messageId));

    // 不监听 MESSAGE_UPDATED。流式期间这个事件太频繁，会让逐字动画反复重建。

    safeEventOn(ev.CHAT_CHANGED, () => {
      setTimeout(() => {
        renderHBForMessage(undefined);
        cleanupOldHeartBoxes();
        applyBgModeToAll();
      }, 300);
    });

    safeEventOn(ev.GENERATION_ENDED, () => {
      setTimeout(() => {
        renderHBForMessage(undefined);
        cleanupOldHeartBoxes();
        applyBgModeToAll();
      }, 300);
    });
  }

  function boot() {
    injectStyles();
    setupButtons();
    bindEvents();
    closeOldSettingsDialogs();

    setTimeout(() => {
      renderHBForMessage(undefined);
      cleanupOldHeartBoxes();
      applyBgModeToAll();
    }, 300);

    setTimeout(() => {
      renderHBForMessage(undefined);
      cleanupOldHeartBoxes();
      applyBgModeToAll();
    }, 900);

    console.log('[头像心声框 V11] loaded：状态连续台词模式 / 原生 dialog 设置界面 / 可调颜色和字体 / 任意状态头像池');
  }

  boot();
})();
