/*
HB 头像对话框 · 正式版

支持格式一：表里切换
[HB]
状态|outer：表面台词
状态|inner：真实心声
[/HB]

支持格式二：状态连续台词
[HB]
状态：第一句
状态：第二句
状态：第三句
[/HB]

隐藏原文正则：
\[HB\][\s\S]*?\[\/HB\]
*/

(() => {
  const SCRIPT_FLAG = '__ST_HEART_HB_OFFICIAL_STATUS_DIALOG__';
  if (window[SCRIPT_FLAG]) return;
  window[SCRIPT_FLAG] = true;

  const VERSION = 'official-1.0.0';
  const SPEED_MS = 42;
  const KEEP_HB_BOX_COUNT = 5;
  const BUTTON_SETTINGS = '对话框设置';

  const STORAGE_KEY_STATUS_POOLS = 'st-heart-hb-official-status-pools-v1';
  const STORAGE_KEY_THEME = 'st-heart-hb-official-theme-v1';
  const STORAGE_KEY_FONT = 'st-heart-hb-official-font-v1';
  const STORAGE_KEY_AVATAR_BG = 'st-heart-hb-official-avatar-bg-v1';

  const DEFAULT_STATUS_POOLS = {};

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
  let observerStarted = false;

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
    return w;
  }

  function getRootDoc() {
    try {
      return getRootWindow().document || document;
    } catch (e) {
      return document;
    }
  }

  function getStorage() {
    try {
      return getRootWindow().localStorage || window.localStorage;
    } catch (e) {
      return window.localStorage;
    }
  }

  function getContext() {
    const root = getRootWindow();
    try {
      if (root.SillyTavern?.getContext) return root.SillyTavern.getContext();
    } catch (e) {}
    try {
      if (window.SillyTavern?.getContext) return window.SillyTavern.getContext();
    } catch (e) {}
    try {
      if (root.getContext) return root.getContext();
    } catch (e) {}
    return null;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }


  function cssEscape(value) {
    const text = String(value ?? '');
    try {
      if (window.CSS?.escape) return window.CSS.escape(text);
    } catch (e) {}
    return text.replace(/[\\"\]\[]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanCssValue(value) {
    return String(value || '').replace(/[;{}<>]/g, '').trim();
  }

  function cleanStatusName(value) {
    const text = String(value || '').trim();
    return text || '普通';
  }

  function hashString(input) {
    const text = String(input || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  function sanitizePools(rawPools) {
    const output = {};
    if (!rawPools || typeof rawPools !== 'object') return output;

    Object.keys(rawPools).forEach((rawStatus) => {
      const status = cleanStatusName(rawStatus);
      const urls = Array.isArray(rawPools[rawStatus]) ? rawPools[rawStatus] : [];
      const cleanUrls = Array.from(new Set(
        urls.map((url) => String(url || '').trim()).filter(Boolean)
      ));
      if (status) output[status] = cleanUrls;
    });

    return output;
  }

  function getStatusPools() {
    if (statusPoolsCache) return statusPoolsCache;

    try {
      const saved = getStorage().getItem(STORAGE_KEY_STATUS_POOLS);
      if (saved) {
        statusPoolsCache = sanitizePools(JSON.parse(saved));
        return statusPoolsCache;
      }
    } catch (e) {
      console.warn('[HB 对话框] 读取状态配置失败：', e);
    }

    statusPoolsCache = cloneJson(DEFAULT_STATUS_POOLS);
    return statusPoolsCache;
  }

  function saveStatusPools(pools) {
    statusPoolsCache = sanitizePools(pools);
    try {
      getStorage().setItem(STORAGE_KEY_STATUS_POOLS, JSON.stringify(statusPoolsCache));
    } catch (e) {
      console.warn('[HB 对话框] 保存状态配置失败：', e);
    }
  }

  function sanitizeTheme(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const fallback = DEFAULT_THEME;

    function color(value, fb) {
      const text = String(value || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fb;
    }

    return {
      dialogBg: color(source.dialogBg, fallback.dialogBg),
      avatarBg: color(source.avatarBg, fallback.avatarBg),
      borderColor: color(source.borderColor, fallback.borderColor),
      textColor: color(source.textColor, fallback.textColor),
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
      console.warn('[HB 对话框] 读取颜色配置失败：', e);
    }
    themeCache = sanitizeTheme(DEFAULT_THEME);
    return themeCache;
  }

  function saveTheme(theme) {
    themeCache = sanitizeTheme(theme);
    try {
      getStorage().setItem(STORAGE_KEY_THEME, JSON.stringify(themeCache));
    } catch (e) {
      console.warn('[HB 对话框] 保存颜色配置失败：', e);
    }
    applyTheme(themeCache);
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
    return `${quoteFamilyName(clean.family)}, ${clean.fallback || DEFAULT_FONT.fallback}`;
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
      console.warn('[HB 对话框] 读取字体配置失败：', e);
    }
    fontCache = sanitizeFont(DEFAULT_FONT);
    return fontCache;
  }

  function saveFontConfig(font) {
    fontCache = sanitizeFont(font);
    try {
      getStorage().setItem(STORAGE_KEY_FONT, JSON.stringify(fontCache));
    } catch (e) {
      console.warn('[HB 对话框] 保存字体配置失败：', e);
    }
    applyFont(fontCache);
  }

  function getAvatarBgEnabled() {
    try {
      return getStorage().getItem(STORAGE_KEY_AVATAR_BG) !== '0';
    } catch (e) {
      return true;
    }
  }

  function saveAvatarBgEnabled(value) {
    try {
      getStorage().setItem(STORAGE_KEY_AVATAR_BG, value ? '1' : '0');
    } catch (e) {}
    applyAvatarBgMode();
  }

  function applyTheme(theme = getTheme()) {
    const clean = sanitizeTheme(theme);
    [document, getRootDoc()].filter(Boolean).forEach((doc) => {
      try {
        const root = doc.documentElement;
        root.style.setProperty('--st-heart-hb-dialog-bg', clean.dialogBg);
        root.style.setProperty('--st-heart-hb-avatar-bg', clean.avatarBg);
        root.style.setProperty('--st-heart-hb-border-color', clean.borderColor);
        root.style.setProperty('--st-heart-hb-text-color', clean.textColor);
      } catch (e) {}
    });
  }

  function injectFontLinkInDoc(doc, font = getFontConfig()) {
    if (!doc || !doc.head) return;
    const clean = sanitizeFont(font);
    const id = 'st-heart-hb-font-link-official';
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
    [document, getRootDoc()].filter(Boolean).forEach((doc) => {
      try {
        injectFontLinkInDoc(doc, clean);
        const root = doc.documentElement;
        root.style.setProperty('--st-heart-hb-font-stack', stack);
        root.style.setProperty('--st-heart-hb-font-weight', clean.weight);
      } catch (e) {}
    });
  }

  function applyAvatarBgMode() {
    const enabled = getAvatarBgEnabled();
    [document, getRootDoc()].filter(Boolean).forEach((doc) => {
      try {
        doc.querySelectorAll('.st-heart-hb-box, .st-heart-hb-preview').forEach((el) => {
          el.classList.toggle('st-heart-hb-bg-off', !enabled);
        });
      } catch (e) {}
    });
  }

  function injectStyleInDoc(doc) {
    if (!doc || !doc.head || doc.getElementById('st-heart-hb-style-official')) return;

    const style = doc.createElement('style');
    style.id = 'st-heart-hb-style-official';
    style.textContent = `
      .st-heart-hb-box,
      .st-heart-hb-box * { box-sizing: border-box; }

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
        justify-content: center;
        gap: 0;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .st-heart-hb-avatar {
        width: clamp(76px, 21vw, 104px);
        height: clamp(76px, 21vw, 104px);
        flex: 0 0 auto;
        border-radius: 50%;
        margin-right: -13px;
        margin-top: 4px;
        position: relative;
        z-index: 2;
        border: 2px solid color-mix(in srgb, var(--st-heart-hb-border-color, #DDCFA4) 84%, white 16%);
        background:
          radial-gradient(circle at 50% 34%, color-mix(in srgb, var(--st-heart-hb-avatar-bg, #560B35) 68%, white 20%) 0%, var(--st-heart-hb-avatar-bg, #560B35) 58%, color-mix(in srgb, var(--st-heart-hb-avatar-bg, #560B35) 34%, black 66%) 100%);
        box-shadow: 0 6px 20px rgba(0,0,0,0.28), inset 0 0 18px rgba(255,255,255,0.08);
        overflow: hidden;
        transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
      }

      .st-heart-hb-avatar::before {
        content: "";
        position: absolute;
        inset: 7px;
        border-radius: 50%;
        border: 1px solid rgba(255,255,255,0.14);
        pointer-events: none;
        z-index: 2;
      }

      .st-heart-hb-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        position: relative;
        z-index: 1;
      }

      .st-heart-hb-bg-off .st-heart-hb-avatar {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }

      .st-heart-hb-bg-off .st-heart-hb-avatar::before { display: none; }

      .st-heart-hb-dialogue {
        min-height: clamp(76px, 20vw, 98px);
        flex: 1 1 auto;
        min-width: 0;
        color: var(--st-heart-hb-text-color, #F2EAD7);
        padding: 15px 17px 15px 24px;
        border-radius: 15px 16px 16px 15px;
        border: 1.5px solid color-mix(in srgb, var(--st-heart-hb-border-color, #DDCFA4) 78%, transparent 22%);
        background:
          radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--st-heart-hb-dialog-bg, #560B35) 58%, #f4a0c8 28%) 0%, transparent 34%),
          linear-gradient(180deg, var(--st-heart-hb-dialog-bg, #560B35), color-mix(in srgb, var(--st-heart-hb-dialog-bg, #560B35) 34%, black 66%));
        box-shadow: 0 10px 25px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,255,255,0.05);
        position: relative;
        overflow: hidden;
        line-height: 1.78;
        font-size: clamp(13px, 3.35vw, 15px);
        letter-spacing: 0.035em;
      }

      .st-heart-hb-dialogue::before {
        content: "";
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(135deg, rgba(255,220,236,0.03) 0, rgba(255,220,236,0.03) 1px, transparent 1px, transparent 10px);
        pointer-events: none;
      }

      .st-heart-hb-dialogue::after {
        content: "◇";
        position: absolute;
        right: 12px;
        bottom: 7px;
        font-size: 11px;
        color: color-mix(in srgb, var(--st-heart-hb-border-color, #DDCFA4) 74%, transparent 26%);
        animation: stHeartHbBlink 1.45s ease-in-out infinite;
      }

      .st-heart-hb-text {
        position: relative;
        z-index: 1;
        white-space: pre-wrap;
        word-break: break-word;
        text-shadow: 0 1px 2px rgba(0,0,0,0.28);
      }

      .st-heart-hb-char {
        opacity: 0;
        display: inline;
        animation: stHeartHbCharAppear 90ms ease forwards;
      }

      @keyframes stHeartHbCharAppear {
        from { opacity: 0; filter: blur(1px); }
        to { opacity: 1; filter: blur(0); }
      }

      @keyframes stHeartHbBlink {
        0%, 100% { opacity: 0.45; transform: translateY(0); }
        50% { opacity: 0.95; transform: translateY(-2px); }
      }

      .st-heart-hb-dialog {
        width: min(680px, calc(100vw - 18px));
        max-height: min(760px, calc(100vh - 18px));
        padding: 0;
        border: 1px solid rgba(221,207,164,0.48);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(42,13,31,0.98), rgba(20,6,15,0.98));
        color: #F2EAD7;
        box-shadow: 0 18px 65px rgba(0,0,0,0.52);
        overflow: hidden;
        font-family: var(--st-heart-hb-font-stack, "Noto Serif SC", "Source Han Serif SC", "SimSun", serif);
        font-weight: var(--st-heart-hb-font-weight, 500);
      }

      .st-heart-hb-dialog::backdrop { background: rgba(0,0,0,0.38); }
      .st-heart-hb-dialog-shell { max-height: min(760px, calc(100vh - 18px)); overflow: auto; padding: 18px; }
      .st-heart-hb-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 10px; color: #fff3d0; }
      .st-heart-hb-tip { font-size: 0.78rem; color: rgba(242,234,215,0.72); line-height: 1.7; margin: 8px 0 12px; }
      .st-heart-hb-section { border: 1px solid rgba(221,207,164,0.22); border-radius: 14px; padding: 12px; margin-top: 12px; background: rgba(255,255,255,0.035); }
      .st-heart-hb-section-title { font-size: 0.92rem; font-weight: 700; color: #fff3d0; margin-bottom: 10px; }
      .st-heart-hb-section-spacer { margin-top: 14px; }
      .st-heart-hb-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .st-heart-hb-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

      .st-heart-hb-btn {
        border: 1px solid rgba(221,207,164,0.36);
        border-radius: 999px;
        padding: 7px 12px;
        background: rgba(255,255,255,0.075);
        color: #F2EAD7;
        font: inherit;
        cursor: pointer;
      }
      .st-heart-hb-btn:hover { background: rgba(255,255,255,0.12); }
      .st-heart-hb-btn-primary { background: rgba(221,207,164,0.18); color: #fff7d8; }
      .st-heart-hb-btn-danger { color: #ffd2d2; border-color: rgba(255,160,160,0.35); }

      .st-heart-hb-input {
        width: 100%;
        min-width: 0;
        border: 1px solid rgba(221,207,164,0.24);
        border-radius: 10px;
        padding: 8px 9px;
        background: rgba(0,0,0,0.18);
        color: #F2EAD7;
        font: inherit;
        outline: none;
      }
      .st-heart-hb-input::placeholder { color: rgba(247,234,216,0.42); }

      .st-heart-hb-row { display: grid; grid-template-columns: 86px minmax(0,1fr); align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.86rem; }
      .st-heart-hb-color-row { display: grid; grid-template-columns: 86px 42px minmax(0,1fr); align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.86rem; }
      .st-heart-hb-color-row input[type="color"] { width: 42px; height: 34px; padding: 0; border: none; background: transparent; }

      .st-heart-hb-check-row { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; margin: 6px 0 10px; }
      .st-heart-hb-check-row input { width: 17px; height: 17px; }

      .st-heart-hb-status-block { border: 1px solid rgba(221,207,164,0.18); border-radius: 12px; padding: 10px; margin-bottom: 10px; background: rgba(0,0,0,0.12); }
      .st-heart-hb-status-head { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; margin-bottom: 8px; }
      .st-heart-hb-url-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; margin-bottom: 7px; }
      .st-heart-hb-empty { color: rgba(242,234,215,0.62); font-size: 0.84rem; line-height: 1.7; padding: 8px 2px; }

      .st-heart-hb-preview {
        display: flex;
        align-items: flex-start;
        gap: 0;
        margin-top: 10px;
        font-family: var(--st-heart-hb-preview-font-stack, var(--st-heart-hb-font-stack, "Noto Serif SC", "Source Han Serif SC", "SimSun", serif));
        font-weight: var(--st-heart-hb-preview-font-weight, var(--st-heart-hb-font-weight, 500));
      }
      .st-heart-hb-preview .st-heart-hb-avatar { width: 76px; height: 76px; margin-right: -12px; margin-top: 4px; }
      .st-heart-hb-preview .st-heart-hb-dialogue { min-height: 74px; font-size: 13px; padding: 13px 15px 13px 24px; }
    `;
    doc.head.appendChild(style);
  }

  function injectStyles() {
    injectStyleInDoc(document);
    injectStyleInDoc(getRootDoc());
    applyTheme();
    applyFont();
    applyAvatarBgMode();
  }

  function resolveStatusKey(status, pools = getStatusPools()) {
    const raw = cleanStatusName(status);
    if (Object.prototype.hasOwnProperty.call(pools, raw)) return raw;
    const lower = raw.toLowerCase();
    const found = Object.keys(pools).find((key) => key.toLowerCase() === lower);
    return found || raw;
  }

  function getAvatarByStatus(status) {
    const pools = getStatusPools();
    const key = resolveStatusKey(status, pools);
    const pool = Array.isArray(pools[key]) ? pools[key].filter(Boolean) : [];
    if (!pool.length) return '';
    return pool[Math.floor(Math.random() * pool.length)] || '';
  }

  function setAvatarImage(img, url, status) {
    if (!img) return;
    img.alt = status || '';
    if (url) {
      img.src = url;
      img.style.display = 'block';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
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

    const chars = Array.from(String(text || ''));
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

      index += 1;
      container.__heartTypingTimer = setTimeout(appendNextChar, SPEED_MS);
    }

    appendNextChar();
  }

  function parseSequenceLines(block, messageId) {
    const segments = [];
    String(block || '').split(/\r?\n/).forEach((line) => {
      const rawLine = String(line || '').trim();
      if (!rawLine) return;

      const match = rawLine.match(/^([^：:\n\r]+?)\s*[:：]\s*([\s\S]*)$/);
      if (match) {
        const status = cleanStatusName(match[1]);
        const text = String(match[2] || '').trim();
        if (text) segments.push({ status, text });
        return;
      }

      if (segments.length) {
        const last = segments[segments.length - 1];
        last.text = `${last.text}\n${rawLine}`;
      }
    });

    if (!segments.length) return null;

    const data = { id: messageId, mode: 'sequence', segments };
    data.hash = makeHBHash(data);
    return data;
  }

  function makeHBHash(data) {
    if (data?.mode === 'sequence') {
      return hashString([data.id, 'sequence', ...(data.segments || []).map((item) => `${item.status}：${item.text}`)].join('|'));
    }
    return hashString([data.id, data.outerStatus, data.outer, data.innerStatus, data.inner].join('|'));
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

    return parseSequenceLines(block, messageId);
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
        box.dataset.currentStatus = current.status || '';
        setAvatarImage(img, current.avatar, current.status);
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
      box.classList.toggle('st-heart-hb-bg-off', !getAvatarBgEnabled());
      return box;
    }

    box.dataset.mode = 'outer';
    const outerAvatar = getAvatarByStatus(data.outerStatus);
    const innerAvatar = getAvatarByStatus(data.innerStatus);

    function renderToggle() {
      const mode = box.dataset.mode || 'outer';
      const currentText = mode === 'outer' ? data.outer : data.inner;
      const currentStatus = mode === 'outer' ? data.outerStatus : data.innerStatus;
      const currentAvatar = mode === 'outer' ? outerAvatar : innerAvatar;
      box.dataset.currentStatus = currentStatus || '';
      setAvatarImage(img, currentAvatar, currentStatus);
      fillTypedText(text, currentText || '');
    }

    inner.addEventListener('click', () => {
      box.dataset.mode = box.dataset.mode === 'outer' ? 'inner' : 'outer';
      renderToggle();
    });

    renderToggle();
    box.classList.toggle('st-heart-hb-bg-off', !getAvatarBgEnabled());
    return box;
  }

  function findMessageElement(doc, messageId) {
    const id = String(messageId);
    const selectors = [
      `.mes[mesid="${cssEscape(id)}"]`,
      `[mesid="${cssEscape(id)}"]`,
      `.mes[data-mesid="${cssEscape(id)}"]`,
      `[data-mesid="${cssEscape(id)}"]`,
      `[data-message-id="${cssEscape(id)}"]`,
    ];

    for (const selector of selectors) {
      const found = doc.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  function insertBoxForMessage(data) {
    const doc = getRootDoc();
    const messageEl = findMessageElement(doc, data.id);
    if (!messageEl) return;

    const old = messageEl.querySelector(`.st-heart-hb-box[data-hb-message-id="${cssEscape(String(data.id))}"]`);
    if (old && old.dataset.hbHash === String(data.hash || '')) return;
    old?.remove?.();

    const target = messageEl.querySelector('.mes_text') || messageEl.querySelector('.message-content') || messageEl;
    target.appendChild(buildHeartBox(data, doc));
    cleanupOldHeartBoxes(doc);
  }

  function cleanupOldHeartBoxes(doc = getRootDoc()) {
    const boxes = Array.from(doc.querySelectorAll('.st-heart-hb-box'));
    if (boxes.length <= KEEP_HB_BOX_COUNT) return;
    boxes.slice(0, Math.max(0, boxes.length - KEEP_HB_BOX_COUNT)).forEach((box) => box.remove());
  }

  function renderAllFromChat() {
    injectStyles();
    const ctx = getContext();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : (Array.isArray(getRootWindow().chat) ? getRootWindow().chat : []);
    if (!chat.length) return;

    chat.forEach((msg, index) => {
      const text = msg?.mes ?? msg?.message ?? msg?.text ?? '';
      const data = parseHBFromText(text, index);
      if (data) insertBoxForMessage(data);
    });
  }

  function delayedRender(delay = 80) {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAllFromChat, delay);
  }

  function rebuildVisibleHeartBoxesAfterConfigChange() {
    const doc = getRootDoc();
    doc.querySelectorAll('.st-heart-hb-box').forEach((box) => box.remove());
    statusPoolsCache = null;
    delayedRender(30);
  }

  function safeListenEvents() {
    const ctx = getContext();
    const es = ctx?.eventSource;
    const ev = ctx?.eventTypes;
    if (!es || !ev || safeListenEvents.done) return;
    safeListenEvents.done = true;

    const listen = (type, fn) => {
      try { if (type && es.on) es.on(type, fn); } catch (e) {}
    };

    listen(ev.CHAT_CHANGED, () => delayedRender(120));
    listen(ev.MESSAGE_RECEIVED, () => delayedRender(160));
    listen(ev.MESSAGE_EDITED, () => delayedRender(120));
    listen(ev.MESSAGE_DELETED, () => delayedRender(120));
    listen(ev.GENERATION_ENDED, () => delayedRender(120));
  }

  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;
    try {
      const doc = getRootDoc();
      const target = doc.querySelector('#chat') || doc.body;
      const observer = new MutationObserver(() => delayedRender(220));
      observer.observe(target, { childList: true, subtree: true });
    } catch (e) {}
  }

  function colorRow(label, key, value) {
    return `
      <label class="st-heart-hb-color-row">
        <span>${escapeHtml(label)}</span>
        <input type="color" data-theme-key="${escapeHtml(key)}" value="${escapeHtml(value)}">
        <input class="st-heart-hb-input" type="text" data-theme-text="${escapeHtml(key)}" value="${escapeHtml(value)}" placeholder="#560B35">
      </label>
    `;
  }

  function textRow(label, key, value, placeholder = '') {
    return `
      <label class="st-heart-hb-row">
        <span>${escapeHtml(label)}</span>
        <input class="st-heart-hb-input" type="text" data-font-field="${escapeHtml(key)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
      </label>
    `;
  }

  function makeUniqueStatusName(pools) {
    const base = '新状态';
    if (!Object.prototype.hasOwnProperty.call(pools, base)) return base;
    let i = 2;
    while (Object.prototype.hasOwnProperty.call(pools, `${base}${i}`)) i += 1;
    return `${base}${i}`;
  }

  function statusBlockHtml(status, urls = []) {
    const urlRows = (urls.length ? urls : ['']).map((url) => `
      <div class="st-heart-hb-url-row" data-url-row>
        <input class="st-heart-hb-input" type="text" data-url value="${escapeHtml(url)}" placeholder="图片网址">
        <button type="button" class="st-heart-hb-btn st-heart-hb-btn-danger" data-action="remove-url">删</button>
      </div>
    `).join('');

    return `
      <div class="st-heart-hb-status-block" data-status-block>
        <div class="st-heart-hb-status-head">
          <input class="st-heart-hb-input" type="text" data-status-name value="${escapeHtml(status)}" placeholder="状态名，例如：普通 / 害羞 / 不高兴">
          <button type="button" class="st-heart-hb-btn st-heart-hb-btn-danger" data-action="remove-status">删除状态</button>
        </div>
        <div data-url-list>${urlRows}</div>
        <div class="st-heart-hb-actions">
          <button type="button" class="st-heart-hb-btn" data-action="add-url">+ 图片网址</button>
        </div>
      </div>
    `;
  }

  function renderStatusBlocks(pools) {
    const entries = Object.entries(sanitizePools(pools));
    if (!entries.length) {
      return '<div class="st-heart-hb-empty" data-empty>暂时没有状态。点击“+ 添加状态”后，再填状态名和图片网址。</div>';
    }
    return entries.map(([status, urls]) => statusBlockHtml(status, urls)).join('');
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
      const status = cleanStatusName(block.querySelector('[data-status-name]')?.value || '');
      if (!status) return;
      const urls = Array.from(block.querySelectorAll('[data-url]')).map((input) => String(input.value || '').trim()).filter(Boolean);
      poolsDraft[status] = urls;
    });

    return {
      theme: sanitizeTheme(themeDraft),
      font: sanitizeFont(fontDraft),
      pools: sanitizePools(poolsDraft),
      avatarBg: !!container.querySelector('[data-avatar-bg-enabled]')?.checked,
    };
  }

  function updatePreview(container, theme, font, avatarBg) {
    const preview = container.querySelector('.st-heart-hb-preview');
    if (!preview) return;
    const cleanTheme = sanitizeTheme(theme);
    const cleanFont = sanitizeFont(font);

    preview.style.setProperty('--st-heart-hb-dialog-bg', cleanTheme.dialogBg);
    preview.style.setProperty('--st-heart-hb-avatar-bg', cleanTheme.avatarBg);
    preview.style.setProperty('--st-heart-hb-border-color', cleanTheme.borderColor);
    preview.style.setProperty('--st-heart-hb-text-color', cleanTheme.textColor);
    preview.style.setProperty('--st-heart-hb-preview-font-stack', buildFontStack(cleanFont));
    preview.style.setProperty('--st-heart-hb-preview-font-weight', cleanFont.weight);
    preview.classList.toggle('st-heart-hb-bg-off', !avatarBg);
  }

  function openSettingsDialog() {
    injectStyles();
    const doc = getRootDoc();
    doc.getElementById('st-heart-hb-settings-dialog')?.remove?.();

    const originalTheme = sanitizeTheme(getTheme());
    const originalFont = sanitizeFont(getFontConfig());
    const originalPools = sanitizePools(getStatusPools());
    const originalBg = getAvatarBgEnabled();

    const dialog = doc.createElement('dialog');
    dialog.id = 'st-heart-hb-settings-dialog';
    dialog.className = 'st-heart-hb-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="st-heart-hb-dialog-shell">
        <div class="st-heart-hb-title">对话框设置</div>
        <div class="st-heart-hb-tip">状态名会引用同名头像池。没有设置对应图片时，对话框仍会显示，只是头像为空。</div>

        <section class="st-heart-hb-section">
          <div class="st-heart-hb-section-title">状态头像配置</div>
          <div data-status-list>${renderStatusBlocks(originalPools)}</div>
          <div class="st-heart-hb-actions">
            <button type="button" class="st-heart-hb-btn" data-action="add-status">+ 添加状态</button>
            <button type="button" class="st-heart-hb-btn st-heart-hb-btn-danger" data-action="clear-statuses">清空状态配置</button>
          </div>
        </section>

        <section class="st-heart-hb-section">
          <div class="st-heart-hb-section-title">颜色与头像底图</div>
          <label class="st-heart-hb-check-row">
            <input type="checkbox" data-avatar-bg-enabled ${originalBg ? 'checked' : ''}>
            <span>显示头像底图</span>
          </label>
          ${colorRow('对话框', 'dialogBg', originalTheme.dialogBg)}
          ${colorRow('头像框', 'avatarBg', originalTheme.avatarBg)}
          ${colorRow('边框', 'borderColor', originalTheme.borderColor)}
          ${colorRow('文字', 'textColor', originalTheme.textColor)}
          <div class="st-heart-hb-preview">
            <div class="st-heart-hb-avatar"><img style="display:none"></div>
            <div class="st-heart-hb-dialogue"><span class="st-heart-hb-text">预览：保存后，已经显示的对话框也会同步刷新。</span></div>
          </div>
        </section>

        <section class="st-heart-hb-section">
          <div class="st-heart-hb-section-title">字体设置</div>
          ${textRow('CSS链接', 'cssUrl', originalFont.cssUrl, 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700&display=swap')}
          ${textRow('字体名', 'family', originalFont.family, 'Noto Serif SC / LXGW Neo XiHei')}
          ${textRow('备用', 'fallback', originalFont.fallback, 'Source Han Serif SC, SimSun, serif')}
          ${textRow('字重', 'weight', originalFont.weight, '400 / 500 / 700 / normal / bold')}
          <div class="st-heart-hb-actions">
            <button type="button" class="st-heart-hb-btn" data-action="reset-font">恢复默认字体</button>
          </div>
        </section>

        <div class="st-heart-hb-footer">
          <button type="button" class="st-heart-hb-btn" data-action="cancel">取消</button>
          <button type="button" class="st-heart-hb-btn st-heart-hb-btn-primary" data-action="save">保存</button>
        </div>
      </form>
    `;

    doc.body.appendChild(dialog);
    const shell = dialog.querySelector('.st-heart-hb-dialog-shell');
    updatePreview(shell, originalTheme, originalFont, originalBg);

    function updateDraft() {
      const current = collectSettings(shell);
      applyTheme(current.theme);
      applyFont(current.font);
      saveAvatarBgEnabled(current.avatarBg);
      updatePreview(shell, current.theme, current.font, current.avatarBg);
    }

    shell.addEventListener('input', (ev) => {
      const target = ev.target;
      if (target?.matches?.('[data-theme-text]')) {
        const key = target.dataset.themeText;
        const color = shell.querySelector(`[data-theme-key="${cssEscape(key)}"]`);
        if (color && /^#[0-9a-fA-F]{6}$/.test(target.value)) color.value = target.value;
      }
      if (target?.matches?.('[data-theme-key]')) {
        const key = target.dataset.themeKey;
        const text = shell.querySelector(`[data-theme-text="${cssEscape(key)}"]`);
        if (text) text.value = target.value;
      }
      updateDraft();
    });

    shell.addEventListener('change', (ev) => {
      if (ev.target?.matches?.('[data-avatar-bg-enabled]')) updateDraft();
    });

    shell.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'add-status') {
        const current = collectSettings(shell).pools;
        const status = makeUniqueStatusName(current);
        const list = shell.querySelector('[data-status-list]');
        list.querySelector('[data-empty]')?.remove?.();
        list.insertAdjacentHTML('beforeend', statusBlockHtml(status, []));
        updateDraft();
        return;
      }

      if (action === 'clear-statuses') {
        const list = shell.querySelector('[data-status-list]');
        list.innerHTML = renderStatusBlocks({});
        updateDraft();
        return;
      }

      if (action === 'remove-status') {
        btn.closest('[data-status-block]')?.remove?.();
        const list = shell.querySelector('[data-status-list]');
        if (!list.querySelector('[data-status-block]')) list.innerHTML = renderStatusBlocks({});
        updateDraft();
        return;
      }

      if (action === 'add-url') {
        const block = btn.closest('[data-status-block]');
        const list = block?.querySelector('[data-url-list]');
        list?.insertAdjacentHTML('beforeend', `
          <div class="st-heart-hb-url-row" data-url-row>
            <input class="st-heart-hb-input" type="text" data-url value="" placeholder="图片网址">
            <button type="button" class="st-heart-hb-btn st-heart-hb-btn-danger" data-action="remove-url">删</button>
          </div>
        `);
        updateDraft();
        return;
      }

      if (action === 'remove-url') {
        const block = btn.closest('[data-status-block]');
        btn.closest('[data-url-row]')?.remove?.();
        const list = block?.querySelector('[data-url-list]');
        if (list && !list.querySelector('[data-url-row]')) {
          list.insertAdjacentHTML('beforeend', `
            <div class="st-heart-hb-url-row" data-url-row>
              <input class="st-heart-hb-input" type="text" data-url value="" placeholder="图片网址">
              <button type="button" class="st-heart-hb-btn st-heart-hb-btn-danger" data-action="remove-url">删</button>
            </div>
          `);
        }
        updateDraft();
        return;
      }

      if (action === 'reset-font') {
        const defaults = sanitizeFont(DEFAULT_FONT);
        Object.keys(defaults).forEach((key) => {
          const input = shell.querySelector(`[data-font-field="${cssEscape(key)}"]`);
          if (input) input.value = defaults[key];
        });
        updateDraft();
        return;
      }

      if (action === 'cancel') {
        applyTheme(originalTheme);
        applyFont(originalFont);
        saveAvatarBgEnabled(originalBg);
        statusPoolsCache = sanitizePools(originalPools);
        dialog.close('cancel');
        return;
      }

      if (action === 'save') {
        const current = collectSettings(shell);
        saveStatusPools(current.pools);
        saveTheme(current.theme);
        saveFontConfig(current.font);
        saveAvatarBgEnabled(current.avatarBg);
        rebuildVisibleHeartBoxesAfterConfigChange();
        dialog.close('save');
      }
    });

    dialog.addEventListener('close', () => {
      dialog.remove();
    });

    try {
      dialog.showModal();
    } catch (e) {
      dialog.setAttribute('open', '');
    }
  }

  function registerButtons() {
    const root = getRootWindow();
    const candidates = [root, window];

    candidates.forEach((scope) => {
      try {
        if (typeof scope.replaceScriptButtons === 'function') {
          scope.replaceScriptButtons([BUTTON_SETTINGS]);
        }
      } catch (e) {}

      try {
        if (typeof scope.eventOnButton === 'function') {
          scope.eventOnButton(BUTTON_SETTINGS, openSettingsDialog);
        }
      } catch (e) {}
    });
  }

  function boot() {
    injectStyles();
    registerButtons();
    safeListenEvents();
    startObserver();
    delayedRender(150);
    console.log(`[HB 对话框] 正式版已加载：${VERSION}`);
  }

  boot();
})();
