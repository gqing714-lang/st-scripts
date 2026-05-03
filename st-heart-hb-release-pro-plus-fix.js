/* 正式增强版二版：状态连续台词模式 / 平滑逐字头像心声框 / 原生 dialog 设置界面 / 高级质感自定义 / 任意状态头像池 / 本地图片上传 / 角色卡绑定

AI回复格式一：旧版 outer / inner 切换
[HB]
普通|outer：角色表面说出口的话、外在表现。禁止与正文中发言完全相同。
sex|inner：角色未说出口的真实心声、欲望、判断、隐藏情绪或真实意图。
[/HB]

AI回复格式二：状态连续台词模式
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
4. 按钮为「对话框设置」。
5. 设置界面支持状态头像、对话框颜色、头像框颜色、边框颜色、文字颜色、字体与头像底图开关，并保留渐变纹理与平滑逐字。
6. 支持图包网址与本地图片上传；本地图片会自动裁切压缩为 1:1。
7. 支持将网址配置、颜色、字体与头像底图开关写入当前角色卡 extensions 字段，便于随角色卡导出；本地上传图片只保存在本机。
8. 支持左上高光、上下渐变、内外阴影、斜向纹理开关与◇位置自定义。
*/

(() => {
  const SCRIPT_FLAG = '__ST_HEART_HB_DIALOG_RELEASE_PRO_PLUS_FIX__';

  if (window[SCRIPT_FLAG]) return;
  window[SCRIPT_FLAG] = true;

  const VERSION = 'RELEASE_PRO_PLUS_FIX';
  const SPEED_MS = 42;
  const KEEP_HB_BOX_COUNT = 5;

  const BUTTON_SETTINGS = '对话框设置';

  const CARD_EXTENSION_KEY = 'st_heart_hb_dialog';
  const LOCAL_IMAGE_SIZE = 512;
  const LOCAL_IMAGE_QUALITY = 0.88;

  const STORAGE_KEY_BG = 'st-heart-hb-avatar-bg-enabled';
  const STORAGE_KEY_STATUS_POOLS = 'st-heart-hb-status-pools-config-release';
  const STORAGE_KEY_THEME = 'st-heart-hb-theme-config-release';
  const STORAGE_KEY_FONT = 'st-heart-hb-font-config-release';

  let lastLoadedCardConfigHash = '';

  const DEFAULT_STATUS_POOLS = {};

  const DEFAULT_THEME = {
    dialogBg: '#560B35',
    avatarBg: '#560B35',
    borderColor: '#DDCFA4',
    textColor: '#F2EAD7',
    highlightColor: '#F4A0C8',
    gradientTop: '#6B123F',
    gradientBottom: '#1D0312',
    innerShadowColor: '#000000',
    outerShadowColor: '#2C0319',
    textureEnabled: true,
    diamondFollowText: false,
    diamondRight: 5,
    diamondBottom: 4,
  };

  const THEME_COLOR_KEYS = [
    'dialogBg',
    'avatarBg',
    'borderColor',
    'textColor',
    'highlightColor',
    'gradientTop',
    'gradientBottom',
    'innerShadowColor',
    'outerShadowColor',
  ];

  const THEME_NUMBER_KEYS = ['diamondRight', 'diamondBottom'];
  const THEME_BOOL_KEYS = ['textureEnabled', 'diamondFollowText'];

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

  function normalizeNumber(value, fallback, min = -80, max = 80) {
    const number = Number(value);
    const base = Number(fallback);
    const safeBase = Number.isFinite(base) ? base : 0;

    if (!Number.isFinite(number)) return safeBase;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function sanitizeTheme(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const output = {};

    THEME_COLOR_KEYS.forEach((key) => {
      output[key] = normalizeHexColor(source[key], DEFAULT_THEME[key]);
    });

    output.textureEnabled = source.textureEnabled === undefined ? DEFAULT_THEME.textureEnabled : !!source.textureEnabled;
    output.diamondFollowText = source.diamondFollowText === undefined ? DEFAULT_THEME.diamondFollowText : !!source.diamondFollowText;
    output.diamondRight = normalizeNumber(source.diamondRight, DEFAULT_THEME.diamondRight, -40, 80);
    output.diamondBottom = normalizeNumber(source.diamondBottom, DEFAULT_THEME.diamondBottom, -40, 80);

    return output;
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
      console.warn('[头像心声框 正式版] 读取颜色配置失败，使用默认颜色：', e);
    }

    themeCache = sanitizeTheme(DEFAULT_THEME);
    return themeCache;
  }

  function saveTheme(theme) {
    themeCache = sanitizeTheme(theme);

    try {
      getStorage().setItem(STORAGE_KEY_THEME, JSON.stringify(themeCache));
    } catch (e) {
      console.warn('[头像心声框 正式版] 保存颜色配置失败：', e);
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
      console.warn('[头像心声框 正式版] 读取字体配置失败，使用默认字体：', e);
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
      console.warn('[头像心声框 正式版] 保存字体配置失败：', e);
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

  function sanitizeCardExportPools(rawPools) {
    const clean = sanitizePools(rawPools);
    const output = {};

    Object.keys(clean).forEach((status) => {
      const urls = clean[status].filter((url) => !isLocalImageSource(url));
      if (urls.length) output[status] = urls;
    });

    return output;
  }

  function mergeLocalImagesIntoPools(cardPools, localPools) {
    const merged = sanitizePools(cardPools);
    const local = sanitizePools(localPools);

    Object.keys(local).forEach((status) => {
      const localImages = local[status].filter((url) => isLocalImageSource(url));
      if (!localImages.length) return;
      merged[status] = Array.from(new Set([...(merged[status] || []), ...localImages]));
    });

    return merged;
  }

  function getStatusPools() {
    if (statusPoolsCache) return statusPoolsCache;

    try {
      const saved = getStorage().getItem(STORAGE_KEY_STATUS_POOLS);
      if (saved) {
        const clean = sanitizePools(JSON.parse(saved));
        if (Object.keys(clean).length) {
          statusPoolsCache = clean;
          return statusPoolsCache;
        }
      }
    } catch (e) {
      console.warn('[头像心声框 正式版] 读取头像配置失败，使用默认头像：', e);
    }

    statusPoolsCache = cloneJson(DEFAULT_STATUS_POOLS);
    return statusPoolsCache;
  }

  function saveStatusPools(pools) {
    const clean = sanitizePools(pools);
    statusPoolsCache = clean;

    try {
      getStorage().setItem(STORAGE_KEY_STATUS_POOLS, JSON.stringify(statusPoolsCache));
    } catch (e) {
      console.warn('[头像心声框 正式版] 保存头像配置失败：', e);
      try {
        getP().toastr?.warning?.('头像配置保存到本地失败：本地上传图片可能太多或太大。');
      } catch (_) {}
    }
  }

  function isLocalImageSource(value) {
    return /^data:image\//i.test(String(value || '').trim());
  }

  function shortenSourceLabel(value) {
    const raw = String(value || '').trim();
    if (isLocalImageSource(raw)) return '本地上传图片 · 已裁切为 1:1';
    if (raw.length <= 44) return raw || '图片网址';
    return `${raw.slice(0, 28)}…${raw.slice(-12)}`;
  }

  function fileToSquareDataUrl(file, size = LOCAL_IMAGE_SIZE) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//i.test(file.type || '')) {
        reject(new Error('请选择图片文件'));
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = () => {
        const img = new Image();

        img.onerror = () => reject(new Error('图片加载失败'));
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;

            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            const side = Math.min(width, height);
            const sx = Math.max(0, Math.floor((width - side) / 2));
            const sy = Math.max(0, Math.floor((height - side) / 2));

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

            let dataUrl = '';
            try {
              dataUrl = canvas.toDataURL('image/webp', LOCAL_IMAGE_QUALITY);
            } catch (e) {}

            if (!/^data:image\/webp/i.test(dataUrl)) {
              dataUrl = canvas.toDataURL('image/png');
            }

            resolve(dataUrl);
          } catch (e) {
            reject(e);
          }
        };

        img.src = String(reader.result || '');
      };

      reader.readAsDataURL(file);
    });
  }

  function buildPortableConfig(input = {}) {
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      bgEnabled: typeof input.bgEnabled === 'boolean' ? input.bgEnabled : getBgEnabled(),
      theme: sanitizeTheme(input.theme || getTheme()),
      font: sanitizeFont(input.font || getFontConfig()),
      pools: sanitizePools(input.pools || getStatusPools()),
    };
  }

  function buildCardExportConfig(input = {}) {
    const config = buildPortableConfig(input);
    config.pools = sanitizeCardExportPools(input.pools || getStatusPools());
    return config;
  }

  function sanitizePortableConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};

    return buildPortableConfig({
      bgEnabled: source.bgEnabled !== false,
      theme: source.theme,
      font: source.font,
      pools: source.pools || source.statusPools || source.avatarPools,
    });
  }

  function getCurrentCharacterInfo() {
    const ctx = getContext();
    const characterId = ctx?.characterId;

    if (characterId === undefined || characterId === null || characterId === '' || Number(characterId) < 0) {
      return { ctx, characterId: undefined, character: null };
    }

    const character = ctx?.characters?.[characterId] || null;
    return { ctx, characterId, character };
  }

  function readCardConfigRaw() {
    const { character } = getCurrentCharacterInfo();
    return character?.data?.extensions?.[CARD_EXTENSION_KEY] || character?.extensions?.[CARD_EXTENSION_KEY] || null;
  }

  function applyPortableConfig(config, { rebuild = true, saveLocal = true } = {}) {
    const clean = sanitizePortableConfig(config);

    if (saveLocal) {
      saveStatusPools(clean.pools);
      saveTheme(clean.theme);
      saveFontConfig(clean.font);
      setBgEnabled(clean.bgEnabled);
    } else {
      statusPoolsCache = sanitizePools(clean.pools);
      themeCache = sanitizeTheme(clean.theme);
      fontCache = sanitizeFont(clean.font);
      applyTheme(themeCache);
      applyFont(fontCache);
      setBgEnabled(clean.bgEnabled);
    }

    if (rebuild) rebuildVisibleHeartBoxesAfterConfigChange();
    return clean;
  }

  function tryAutoLoadCardConfig() {
    const raw = readCardConfigRaw();
    if (!raw) return false;

    const hash = hashString(JSON.stringify(raw));
    if (hash && hash === lastLoadedCardConfigHash) return true;

    const clean = sanitizePortableConfig(raw);
    clean.pools = mergeLocalImagesIntoPools(clean.pools, getStatusPools());
    applyPortableConfig(clean, { rebuild: false, saveLocal: true });
    lastLoadedCardConfigHash = hash;
    return true;
  }

  async function saveConfigToCurrentCharacter(config) {
    const { ctx, characterId } = getCurrentCharacterInfo();

    if (!ctx?.writeExtensionField || characterId === undefined) {
      throw new Error('当前没有可写入的角色卡，或当前酒馆版本不支持 writeExtensionField。');
    }

    await ctx.writeExtensionField(characterId, CARD_EXTENSION_KEY, buildCardExportConfig(config));
    lastLoadedCardConfigHash = '';
  }

  async function clearConfigFromCurrentCharacter() {
    const { ctx, characterId, character } = getCurrentCharacterInfo();

    if (!ctx?.writeExtensionField || characterId === undefined) {
      throw new Error('当前没有可写入的角色卡，或当前酒馆版本不支持 writeExtensionField。');
    }

    try {
      if (character?.data?.extensions) delete character.data.extensions[CARD_EXTENSION_KEY];
      if (character?.extensions) delete character.extensions[CARD_EXTENSION_KEY];
    } catch (e) {}

    await ctx.writeExtensionField(characterId, CARD_EXTENSION_KEY, null);
    lastLoadedCardConfigHash = '';
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
        root.style.setProperty('--st-heart-hb-highlight-color', clean.highlightColor);
        root.style.setProperty('--st-heart-hb-gradient-top', clean.gradientTop);
        root.style.setProperty('--st-heart-hb-gradient-bottom', clean.gradientBottom);
        root.style.setProperty('--st-heart-hb-inner-shadow-color', clean.innerShadowColor);
        root.style.setProperty('--st-heart-hb-outer-shadow-color', clean.outerShadowColor);
        root.style.setProperty('--st-heart-hb-texture-opacity', clean.textureEnabled ? '1' : '0');
        root.style.setProperty('--st-heart-hb-diamond-fixed-display', clean.diamondFollowText ? 'none' : 'block');
        root.style.setProperty('--st-heart-hb-diamond-inline-display', clean.diamondFollowText ? 'inline-block' : 'none');
        root.style.setProperty('--st-heart-hb-diamond-right', `${clean.diamondRight}px`);
        root.style.setProperty('--st-heart-hb-diamond-bottom', `${clean.diamondBottom}px`);
      } catch (e) {}
    });
  }

  function injectStyleInDoc(doc) {
    if (!doc || !doc.head) return;

    const styleId = 'st-heart-hb-style-release-pro-plus-fix';

    [
      'st-heart-hb-style-release-card',
      'st-heart-hb-style-release-pro-plus',
      'st-heart-hb-style-v11',
      'st-heart-hb-style-v10',
      'st-heart-hb-style-v9',
    ].forEach((oldId) => {
      const oldStyle = doc.getElementById(oldId);
      if (oldStyle && oldStyle.id !== styleId) oldStyle.remove();
    });

    if (doc.getElementById(styleId)) return;

    const style = doc.createElement('style');
    style.id = styleId;
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
        filter: drop-shadow(0 7px 14px color-mix(in srgb, var(--st-heart-hb-outer-shadow-color, #2C0319) 52%, transparent));
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
            color-mix(in srgb, var(--st-heart-hb-highlight-color, #F4A0C8) 42%, transparent) 0%,
            transparent 34%
          ),
          linear-gradient(
            180deg,
            var(--st-heart-hb-gradient-top, #6B123F),
            var(--st-heart-hb-gradient-bottom, #1D0312)
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
          inset 0 0 18px color-mix(in srgb, var(--st-heart-hb-inner-shadow-color, #000000) 32%, transparent),
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 3px 8px color-mix(in srgb, var(--st-heart-hb-outer-shadow-color, #2C0319) 38%, transparent);
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
        opacity: var(--st-heart-hb-texture-opacity, 1);
        pointer-events: none;
      }

      .st-heart-hb-dialogue::after {
        content: "◇";
        position: absolute;
        right: var(--st-heart-hb-diamond-right, 5px);
        bottom: var(--st-heart-hb-diamond-bottom, 4px);
        z-index: 3;
        display: var(--st-heart-hb-diamond-fixed-display, block);
        font-size: 0.82em;
        line-height: 1;
        color: var(--st-heart-hb-text-color, #F2EAD7);
        opacity: 0.92;
        text-shadow: 0 0 7px color-mix(in srgb, var(--st-heart-hb-text-color, #F2EAD7) 34%, transparent);
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

      .st-heart-hb-inline-diamond {
        display: var(--st-heart-hb-diamond-inline-display, none);
        margin-left: 0.32em;
        font-size: 0.82em;
        line-height: 1;
        color: var(--st-heart-hb-text-color, #F2EAD7);
        opacity: 0.92;
        text-shadow: 0 0 7px color-mix(in srgb, var(--st-heart-hb-text-color, #F2EAD7) 34%, transparent);
        pointer-events: none;
        vertical-align: baseline;
        animation: stHeartHbDiamondFloatV11 2.8s ease-in-out infinite;
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
            color-mix(in srgb, var(--st-heart-hb-preview-highlight, #F4A0C8) 42%, transparent) 0%,
            transparent 34%
          ),
          linear-gradient(180deg,
            var(--st-heart-hb-preview-gradient-top, #6B123F),
            var(--st-heart-hb-preview-gradient-bottom, #1D0312)
          );
        color: var(--st-heart-hb-preview-text, #F2EAD7);
        padding: 8px 26px 14px 10px;
        line-height: 1.55;
        font-size: 0.86em;
        position: relative;
        box-shadow:
          inset 0 0 14px color-mix(in srgb, var(--st-heart-hb-preview-inner-shadow, #000000) 32%, transparent),
          0 3px 8px color-mix(in srgb, var(--st-heart-hb-preview-outer-shadow, #2C0319) 38%, transparent);
      }

      .st-heart-hb-preview-dialogue-v11::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          repeating-linear-gradient(
            135deg,
            rgba(255, 220, 236, 0.03) 0,
            rgba(255, 220, 236, 0.03) 1px,
            transparent 1px,
            transparent 10px
          );
        opacity: var(--st-heart-hb-preview-texture-opacity, 1);
        pointer-events: none;
      }

      .st-heart-hb-preview-dialogue-v11::after {
        content: "◇";
        display: var(--st-heart-hb-preview-diamond-fixed-display, block);
        position: absolute;
        right: var(--st-heart-hb-preview-diamond-right, 5px);
        bottom: var(--st-heart-hb-preview-diamond-bottom, 4px);
        color: var(--st-heart-hb-preview-text, #F2EAD7);
        opacity: 0.92;
        line-height: 1;
        pointer-events: none;
      }

      .st-heart-hb-preview-inline-diamond-v11 {
        display: var(--st-heart-hb-preview-diamond-inline-display, none);
        margin-left: 0.32em;
        color: var(--st-heart-hb-preview-text, #F2EAD7);
        opacity: 0.92;
        line-height: 1;
        vertical-align: baseline;
      }

      .st-heart-hb-text-row-v11.st-heart-hb-disabled-v11 {
        opacity: 0.48;
      }

      .st-heart-hb-input-v11:disabled {
        cursor: not-allowed;
        opacity: 0.7;
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

      .st-heart-hb-local-row-v11 {
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        min-width: 0;
      }

      .st-heart-hb-local-thumb-v11 {
        width: 48px;
        height: 48px;
        object-fit: cover;
        border: 1px solid rgba(235, 211, 171, 0.42);
        background: rgba(255,255,255,0.06);
      }

      .st-heart-hb-local-info-v11 {
        min-width: 0;
        color: rgba(247, 234, 216, 0.78);
        font-size: 0.82em;
        line-height: 1.45;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .st-heart-hb-file-input-v11 {
        display: none !important;
      }

      .st-heart-hb-card-panel-v11 {
        margin-top: 12px;
        border-top: 1px solid rgba(235, 211, 171, 0.22);
        padding-top: 10px;
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

        .st-heart-hb-local-row-v11 {
          grid-template-columns: 48px minmax(0, 1fr) auto;
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

    function appendInlineDiamond() {
      const diamond = doc.createElement('span');
      diamond.className = 'st-heart-hb-inline-diamond';
      diamond.textContent = '◇';
      container.appendChild(diamond);
    }

    function appendNextChar() {
      if (container.__heartTypingRun !== runId) return;
      if (index >= chars.length) {
        appendInlineDiamond();
        return;
      }

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

  function setAvatarImage(img, url, alt) {
    if (!img) return;

    const cleanUrl = String(url || '').trim();
    img.alt = String(alt || '');

    if (cleanUrl) {
      img.src = cleanUrl;
      img.style.display = 'block';
      return;
    }

    img.removeAttribute('src');
    img.style.display = 'none';
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

        setAvatarImage(img, current.avatar, current.status || '普通');
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

      setAvatarImage(img, mode === 'outer' ? outerAvatar : innerAvatar, currentStatus);
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
    applyFont();

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

  function numberRow(label, key, value, placeholder = '') {
    const safeKey = escapeHtml(key);
    const safeValue = escapeHtml(value);

    return `
      <label class="st-heart-hb-text-row-v11">
        <span>${escapeHtml(label)}</span>
        <input class="st-heart-hb-input-v11" type="number" step="1" data-theme-number="${safeKey}" value="${safeValue}" placeholder="${escapeHtml(placeholder)}">
      </label>
    `;
  }

  function avatarUrlRowHtml(url = '') {
    return `
      <div class="st-heart-hb-url-row-v11" data-url-row="1">
        <input class="st-heart-hb-input-v11" type="url" data-avatar-url="1" value="${escapeHtml(url)}" placeholder="图片网址，最好以 .png / .jpg / .webp 结尾">
        <button type="button" class="st-heart-hb-btn-v11 danger" data-action="remove-url">-</button>
      </div>
    `;
  }

  function avatarLocalRowHtml(dataUrl = '') {
    return `
      <div class="st-heart-hb-local-row-v11" data-url-row="1" data-local-row="1">
        <img class="st-heart-hb-local-thumb-v11" src="${escapeHtml(dataUrl)}" alt="本地上传头像预览">
        <div class="st-heart-hb-local-info-v11">${escapeHtml(shortenSourceLabel(dataUrl))}</div>
        <input type="hidden" data-avatar-url="1" value="${escapeHtml(dataUrl)}">
        <button type="button" class="st-heart-hb-btn-v11 danger" data-action="remove-url">删除</button>
      </div>
    `;
  }

  function avatarSourceRowHtml(source = '') {
    return isLocalImageSource(source) ? avatarLocalRowHtml(source) : avatarUrlRowHtml(source);
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
          ${cleanUrls.map((url) => avatarSourceRowHtml(url)).join('')}
        </div>
        <div class="st-heart-hb-actions-v11">
          <button type="button" class="st-heart-hb-btn-v11" data-action="add-url">+ 添加图片网址</button>
          <button type="button" class="st-heart-hb-btn-v11" data-action="upload-local">+ 上传本地图片</button>
          <input class="st-heart-hb-file-input-v11" type="file" accept="image/*" multiple data-avatar-file-input="1">
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

    container.querySelectorAll('[data-theme-number]').forEach((input) => {
      themeDraft[input.dataset.themeNumber] = input.value;
    });

    container.querySelectorAll('[data-theme-bool]').forEach((input) => {
      themeDraft[input.dataset.themeBool] = !!input.checked;
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

    const bgInput = container.querySelector('[data-bg-enabled]');

    return {
      theme: sanitizeTheme(themeDraft),
      font: sanitizeFont(fontDraft),
      pools: sanitizePools(poolsDraft),
      bgEnabled: bgInput ? !!bgInput.checked : getBgEnabled(),
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
    preview.style.setProperty('--st-heart-hb-preview-highlight', clean.highlightColor);
    preview.style.setProperty('--st-heart-hb-preview-gradient-top', clean.gradientTop);
    preview.style.setProperty('--st-heart-hb-preview-gradient-bottom', clean.gradientBottom);
    preview.style.setProperty('--st-heart-hb-preview-inner-shadow', clean.innerShadowColor);
    preview.style.setProperty('--st-heart-hb-preview-outer-shadow', clean.outerShadowColor);
    preview.style.setProperty('--st-heart-hb-preview-texture-opacity', clean.textureEnabled ? '1' : '0');
    preview.style.setProperty('--st-heart-hb-preview-diamond-fixed-display', clean.diamondFollowText ? 'none' : 'block');
    preview.style.setProperty('--st-heart-hb-preview-diamond-inline-display', clean.diamondFollowText ? 'inline-block' : 'none');
    preview.style.setProperty('--st-heart-hb-preview-diamond-right', `${clean.diamondRight}px`);
    preview.style.setProperty('--st-heart-hb-preview-diamond-bottom', `${clean.diamondBottom}px`);
    preview.style.setProperty('--st-heart-hb-preview-font-stack', buildFontStack(font));
    preview.style.setProperty('--st-heart-hb-preview-font-weight', sanitizeFont(font).weight);
  }


  function setPanelFromConfig(container, config) {
    const clean = sanitizePortableConfig(config);

    THEME_COLOR_KEYS.forEach((key) => {
      const value = normalizeHexColor(clean.theme[key], DEFAULT_THEME[key]);
      container.querySelectorAll(`[data-theme-key="${key}"], [data-theme-text="${key}"]`).forEach((input) => {
        input.value = value;
      });
    });

    THEME_NUMBER_KEYS.forEach((key) => {
      const input = container.querySelector(`[data-theme-number="${key}"]`);
      if (input) input.value = clean.theme[key];
    });

    THEME_BOOL_KEYS.forEach((key) => {
      const input = container.querySelector(`[data-theme-bool="${key}"]`);
      if (input) input.checked = !!clean.theme[key];
    });

    Object.keys(clean.font).forEach((key) => {
      const input = container.querySelector(`[data-font-field="${key}"]`);
      if (input) input.value = clean.font[key];
    });

    const bgInput = container.querySelector('[data-bg-enabled]');
    if (bgInput) bgInput.checked = clean.bgEnabled !== false;

    const list = container.querySelector('[data-status-list]');
    if (list) list.innerHTML = renderStatusBlocks(clean.pools);

    updatePreview(container, clean.theme, clean.font);
    updateDiamondPositionControls(container, clean.theme);
  }

  async function appendLocalFilesToStatusBlock(block, files) {
    const list = block?.querySelector?.('[data-url-list]');
    if (!list || !files?.length) return 0;

    let count = 0;

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await fileToSquareDataUrl(file);
        list.insertAdjacentHTML('beforeend', avatarLocalRowHtml(dataUrl));
        count++;
      } catch (e) {
        console.warn('[头像心声框 正式版] 本地图片处理失败：', e);
        try {
          getP().toastr?.error?.(`图片处理失败：${file?.name || ''}`);
        } catch (_) {}
      }
    }

    return count;
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

  function updateDiamondPositionControls(container, theme = getTheme()) {
    if (!container) return;

    const follow = !!sanitizeTheme(theme).diamondFollowText;

    container.querySelectorAll('[data-theme-number="diamondRight"], [data-theme-number="diamondBottom"]').forEach((input) => {
      input.disabled = follow;
      const row = input.closest('.st-heart-hb-text-row-v11');
      if (row) {
        row.classList.toggle('st-heart-hb-disabled-v11', follow);
        row.title = follow ? '已开启◇跟随文字，此位置设置暂时失效' : '';
      }
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

    tryAutoLoadCardConfig();

    const originalTheme = sanitizeTheme(getTheme());
    const originalFont = sanitizeFont(getFontConfig());
    const originalPools = cloneJson(getStatusPools());
    const originalBgEnabled = getBgEnabled();
    let latestTheme = sanitizeTheme(originalTheme);
    let latestFont = sanitizeFont(originalFont);

    const dialog = doc.createElement('dialog');
    dialog.id = 'st-heart-hb-settings-dialog-v11';
    dialog.className = 'st-heart-hb-dialog-v11';

    dialog.innerHTML = `
      <div class="st-heart-hb-settings-card-v11">
        <div class="st-heart-hb-settings-head-v11">
          <div class="st-heart-hb-settings-title-v11">对话框设置</div>
          <button type="button" class="st-heart-hb-close-v11" data-action="cancel">×</button>
        </div>

        <div class="st-heart-hb-tip-v11">
          这里可以配置状态头像池、颜色、字体和头像底图。连续台词模式中，冒号前面的状态名会引用同名头像池。
        </div>

        <div class="st-heart-hb-settings-grid-v11">
          <section class="st-heart-hb-section-v11">
            <div class="st-heart-hb-section-title-v11">颜色设置</div>
            ${colorRow('对话框', 'dialogBg', originalTheme.dialogBg)}
            ${colorRow('头像框', 'avatarBg', originalTheme.avatarBg)}
            ${colorRow('边框', 'borderColor', originalTheme.borderColor)}
            ${colorRow('文字', 'textColor', originalTheme.textColor)}

            <div class="st-heart-hb-section-title-v11 st-heart-hb-section-spacer-v11">高级质感</div>
            ${colorRow('左上高光', 'highlightColor', originalTheme.highlightColor)}
            ${colorRow('渐变上层', 'gradientTop', originalTheme.gradientTop)}
            ${colorRow('渐变下层', 'gradientBottom', originalTheme.gradientBottom)}
            ${colorRow('内阴影', 'innerShadowColor', originalTheme.innerShadowColor)}
            ${colorRow('外阴影', 'outerShadowColor', originalTheme.outerShadowColor)}

            <label class="st-heart-hb-text-row-v11">
              <span>斜向纹理</span>
              <input type="checkbox" data-theme-bool="textureEnabled" ${originalTheme.textureEnabled ? 'checked' : ''}>
            </label>
            <label class="st-heart-hb-text-row-v11">
              <span>◇跟随文字</span>
              <input type="checkbox" data-theme-bool="diamondFollowText" ${originalTheme.diamondFollowText ? 'checked' : ''}>
            </label>
            ${numberRow('◇右距', 'diamondRight', originalTheme.diamondRight, '5')}
            ${numberRow('◇底距', 'diamondBottom', originalTheme.diamondBottom, '4')}
            <div class="st-heart-hb-tip-v11">◇ 的颜色会跟随文字颜色；开启“◇跟随文字”后，右距和底距设置会暂时失效。</div>

            <label class="st-heart-hb-text-row-v11">
              <span>头像底图</span>
              <input type="checkbox" data-bg-enabled="1" ${getBgEnabled() ? 'checked' : ''}>
            </label>

            <div class="st-heart-hb-actions-v11">
              <button type="button" class="st-heart-hb-btn-v11" data-action="reset-colors">恢复默认颜色</button>
            </div>

            <div class="st-heart-hb-preview-v11">
              <div class="st-heart-hb-preview-avatar-v11"></div>
              <div class="st-heart-hb-preview-dialogue-v11">颜色与字体预览：保存后，已经显示的心声框也会同步刷新。<span class="st-heart-hb-preview-inline-diamond-v11">◇</span></div>
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
              格式：<br>
              [HB]<br>
              状态名称：内容<br>
              状态名称：内容<br>
              [/HB]<br><br>
              本地上传的图片不会保存到角色卡，如果要能跟随角色卡导出的话要用图片网址
            </div>
            <div class="st-heart-hb-status-list-v11" data-status-list="1">
              ${renderStatusBlocks(originalPools)}
            </div>
            <div class="st-heart-hb-actions-v11">
              <button type="button" class="st-heart-hb-btn-v11" data-action="add-status">+ 添加状态</button>
              <button type="button" class="st-heart-hb-btn-v11" data-action="reset-avatars">清空头像配置</button>
            </div>

            <div class="st-heart-hb-card-panel-v11">
              <div class="st-heart-hb-section-title-v11">角色卡绑定</div>
              <div class="st-heart-hb-tip-v11">
                点击“保存到当前角色卡”后，状态图片网址、颜色、字体、头像底图开关和高级质感配置会写入当前角色卡。导出角色卡时会跟着走；其他人仍需要加载本脚本才能渲染。<br><br>
                本地上传的图片只保存在当前浏览器本地，不会写入角色卡。
              </div>
              <div class="st-heart-hb-actions-v11">
                <button type="button" class="st-heart-hb-btn-v11 primary" data-action="save-card">保存到当前角色卡</button>
                <button type="button" class="st-heart-hb-btn-v11" data-action="load-card">从角色卡读取</button>
                <button type="button" class="st-heart-hb-btn-v11 danger" data-action="clear-card">清除角色卡配置</button>
              </div>
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
    updateDiamondPositionControls(container, originalTheme);

    function updateDraft() {
      const current = collectSettings(container);
      latestTheme = current.theme;
      latestFont = current.font;
      applyTheme(latestTheme);
      applyFont(latestFont);
      setBgEnabled(current.bgEnabled);
      updatePreview(container, latestTheme, latestFont);
      updateDiamondPositionControls(container, latestTheme);
    }

    container.addEventListener('input', (event) => {
      if (event.target?.matches?.('[data-theme-key], [data-theme-text]')) {
        syncColorPair(container, event.target);
      }

      updateDraft();
    });

    container.addEventListener('change', async (event) => {
      const input = event.target;
      if (!input?.matches?.('[data-avatar-file-input]')) return;

      const block = input.closest('[data-status-block]');
      const files = input.files;

      if (!files?.length) return;

      try {
        await appendLocalFilesToStatusBlock(block, files);
        input.value = '';
        updateDraft();
      } catch (e) {
        console.warn('[头像心声框 正式版] 本地图片上传失败：', e);
      }
    });

    container.addEventListener('click', async (event) => {
      const btn = event.target?.closest?.('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'cancel') {
        applyTheme(originalTheme);
        applyFont(originalFont);
        setBgEnabled(originalBgEnabled);
        dialog.close('cancel');
        return;
      }

      if (action === 'save') {
        const current = collectSettings(container);
        const cleanPools = sanitizePools(current.pools);

        saveStatusPools(cleanPools);
        saveTheme(current.theme);
        saveFontConfig(current.font);
        setBgEnabled(current.bgEnabled);
        rebuildVisibleHeartBoxesAfterConfigChange();

        try {
          getP().toastr?.success?.('头像心声框设置已保存');
        } catch (e) {}

        dialog.close('save');
        return;
      }

      if (action === 'save-card') {
        const current = collectSettings(container);

        try {
          await saveConfigToCurrentCharacter(current);
          saveStatusPools(current.pools);
          saveTheme(current.theme);
          saveFontConfig(current.font);
          setBgEnabled(current.bgEnabled);
          rebuildVisibleHeartBoxesAfterConfigChange();
          getP().toastr?.success?.('已保存到当前角色卡');
        } catch (e) {
          console.error('[头像心声框 正式版] 保存到角色卡失败：', e);
          try {
            getP().toastr?.error?.(e.message || '保存到角色卡失败');
          } catch (_) {
            alert(e.message || '保存到角色卡失败');
          }
        }

        return;
      }

      if (action === 'load-card') {
        const raw = readCardConfigRaw();

        if (!raw) {
          try {
            getP().toastr?.warning?.('当前角色卡里没有对话框配置');
          } catch (_) {
            alert('当前角色卡里没有对话框配置');
          }
          return;
        }

        const clean = sanitizePortableConfig(raw);
        clean.pools = mergeLocalImagesIntoPools(clean.pools, getStatusPools());
        setPanelFromConfig(container, clean);
        applyPortableConfig(clean, { rebuild: true, saveLocal: true });
        updateDraft();

        try {
          getP().toastr?.success?.('已从角色卡读取配置');
        } catch (e) {}

        return;
      }

      if (action === 'clear-card') {
        try {
          await clearConfigFromCurrentCharacter();
          getP().toastr?.success?.('已清除当前角色卡内的对话框配置');
        } catch (e) {
          console.error('[头像心声框 正式版] 清除角色卡配置失败：', e);
          try {
            getP().toastr?.error?.(e.message || '清除角色卡配置失败');
          } catch (_) {
            alert(e.message || '清除角色卡配置失败');
          }
        }

        return;
      }

      if (action === 'reset-colors') {
        THEME_COLOR_KEYS.forEach((key) => {
          const value = normalizeHexColor(DEFAULT_THEME[key], DEFAULT_THEME[key]);
          container.querySelectorAll(`[data-theme-key="${key}"], [data-theme-text="${key}"]`).forEach((input) => {
            input.value = value;
          });
        });

        THEME_NUMBER_KEYS.forEach((key) => {
          const input = container.querySelector(`[data-theme-number="${key}"]`);
          if (input) input.value = DEFAULT_THEME[key];
        });

        THEME_BOOL_KEYS.forEach((key) => {
          const input = container.querySelector(`[data-theme-bool="${key}"]`);
          if (input) input.checked = !!DEFAULT_THEME[key];
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
        if (list) list.innerHTML = renderStatusBlocks({});
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
          list.insertAdjacentHTML('beforeend', avatarUrlRowHtml(''));
          list.querySelector('[data-url-row]:last-child [data-avatar-url]')?.focus?.();
        }

        updateDraft();
        return;
      }

      if (action === 'upload-local') {
        const block = btn.closest('[data-status-block]');
        block?.querySelector?.('[data-avatar-file-input]')?.click?.();
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
        setBgEnabled(originalBgEnabled);
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
      console.error('[头像心声框 正式版] 打开设置 dialog 失败：', e);
      alert('打开设置界面失败：' + e.message);
      dialog.remove();
    }
  }

  function setupButtons() {
    const P = getP();
    const replaceButtons = P.replaceScriptButtons || window.replaceScriptButtons;
    const onButton = P.eventOnButton || window.eventOnButton;

    if (typeof replaceButtons !== 'function' || typeof onButton !== 'function') {
      console.warn('[头像心声框 正式版] 未找到酒馆助手按钮 API：replaceScriptButtons / eventOnButton');
      return;
    }

    replaceButtons([
      { name: BUTTON_SETTINGS, visible: true },
    ]);

    onButton(BUTTON_SETTINGS, () => {
      openSettingsDialog();
    });
  }

  function delayedRender(messageId) {
    tryAutoLoadCardConfig();
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
      console.warn('[头像心声框 正式版] 事件绑定失败：', eventName, e);
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
        tryAutoLoadCardConfig();
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
    tryAutoLoadCardConfig();
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

    console.log('[头像心声框 正式增强版二版] loaded：状态连续台词模式 / 本地图片上传 / 角色卡绑定仅导出网址 / 高级质感自定义 / 任意状态头像池');
  }

  boot();
})();
