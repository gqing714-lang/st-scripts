/* V7：从零重写的头像心声框 / 原生 dialog 设置界面 / 可调颜色 / 任意心情头像

AI回复格式：
[HB]
普通|outer：角色表面说出口的话、外在表现。禁止与正文中发言完全相同。
sex|inner：角色未说出口的真实心声、欲望、判断、隐藏情绪或真实意图。
[/HB]

建议隐藏 [HB] 的正则：
\[HB\]\s*(?:[^|\n\r：:]+?\s*\|\s*)?outer[:：][\s\S]*?\s*(?:[^|\n\r：:]+?\s*\|\s*)?inner[:：][\s\S]*?\s*\[\/HB\]

V7 修正方向：
1. 不复用旧设置面板函数。
2. 不使用 ST Popup，不使用 fixed overlay。
3. 使用已测试成功的网页原生 <dialog>。
4. 按钮改名为「底图·HB」「设置·HB」，避开旧版同名按钮回调残留。
5. 设置界面支持心情头像、对话框颜色、头像框颜色、边框颜色、文字颜色。
*/

(() => {
  const SCRIPT_FLAG = '__ST_HEART_HB_NATIVE_DIALOG_CLEAN_V7__';

  if (window[SCRIPT_FLAG]) return;
  window[SCRIPT_FLAG] = true;

  const VERSION = 'V7';
  const SPEED_MS = 24;
  const TYPE_CHUNK_SIZE = 2;
  const KEEP_HB_BOX_COUNT = 5;

  const BUTTON_BG = '底图·HB';
  const BUTTON_SETTINGS = '设置·HB';

  const STORAGE_KEY_BG = 'st-heart-hb-avatar-bg-enabled';
  const STORAGE_KEY_AVATAR_POOLS = 'st-heart-hb-avatar-pools-config-v1';
  const STORAGE_KEY_THEME = 'st-heart-hb-theme-config-v7';

  const DEFAULT_AVATAR_POOLS = {
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

  let avatarPoolsCache = null;
  let themeCache = null;
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
      console.warn('[头像心声框 V7] 读取颜色配置失败，使用默认颜色：', e);
    }

    themeCache = sanitizeTheme(DEFAULT_THEME);
    return themeCache;
  }

  function saveTheme(theme) {
    themeCache = sanitizeTheme(theme);

    try {
      getStorage().setItem(STORAGE_KEY_THEME, JSON.stringify(themeCache));
    } catch (e) {
      console.warn('[头像心声框 V7] 保存颜色配置失败：', e);
    }

    applyTheme(themeCache);
  }

  function sanitizePools(rawPools) {
    const output = {};

    if (!rawPools || typeof rawPools !== 'object') return output;

    Object.keys(rawPools).forEach((rawMood) => {
      const mood = String(rawMood || '').trim();
      const urls = Array.isArray(rawPools[rawMood]) ? rawPools[rawMood] : [];
      const cleanUrls = Array.from(new Set(
        urls.map((url) => String(url || '').trim()).filter(Boolean)
      ));

      if (mood && cleanUrls.length) output[mood] = cleanUrls;
    });

    return output;
  }

  function getAvatarPools() {
    if (avatarPoolsCache) return avatarPoolsCache;

    try {
      const saved = getStorage().getItem(STORAGE_KEY_AVATAR_POOLS);
      if (saved) {
        const clean = sanitizePools(JSON.parse(saved));
        if (Object.keys(clean).length) {
          avatarPoolsCache = clean;
          return avatarPoolsCache;
        }
      }
    } catch (e) {
      console.warn('[头像心声框 V7] 读取头像配置失败，使用默认头像：', e);
    }

    avatarPoolsCache = cloneJson(DEFAULT_AVATAR_POOLS);
    return avatarPoolsCache;
  }

  function saveAvatarPools(pools) {
    const clean = sanitizePools(pools);
    avatarPoolsCache = Object.keys(clean).length ? clean : cloneJson(DEFAULT_AVATAR_POOLS);

    try {
      getStorage().setItem(STORAGE_KEY_AVATAR_POOLS, JSON.stringify(avatarPoolsCache));
    } catch (e) {
      console.warn('[头像心声框 V7] 保存头像配置失败：', e);
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

    if (doc.getElementById('st-heart-hb-style-v7')) return;

    const style = doc.createElement('style');
    style.id = 'st-heart-hb-style-v7';
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
        font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", serif;
        font-weight: 500;
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
        padding: 9px 28px 16px 12px;
        line-height: 1.65;
        font-size: 0.9em;
        word-break: break-word;
        overflow-wrap: anywhere;
        white-space: normal;
        overflow: visible;
        position: relative;
        box-shadow: inset 0 0 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
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
        color: var(--st-heart-hb-text-color, #F2EAD7);
        opacity: 0.86;
        pointer-events: none;
        animation: stHeartHbDiamondFloatV7 2.8s ease-in-out infinite;
      }

      @keyframes stHeartHbDiamondFloatV7 {
        0%, 100% { transform: translateY(0); opacity: 0.72; }
        50% { transform: translateY(-4px); opacity: 1; }
      }

      .st-heart-hb-text {
        position: relative;
        z-index: 1;
        display: block;
        max-width: 100%;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      dialog.st-heart-hb-dialog-v7,
      dialog.st-heart-hb-dialog-v7 * {
        box-sizing: border-box;
      }

      dialog.st-heart-hb-dialog-v7 {
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

      dialog.st-heart-hb-dialog-v7::backdrop {
        background: rgba(12, 3, 9, 0.62) !important;
        backdrop-filter: blur(2px);
      }

      .st-heart-hb-settings-card-v7 {
        width: 100% !important;
        max-height: 90vh !important;
        overflow: auto !important;
        padding: 14px !important;
        background:
          radial-gradient(circle at 0% 0%, rgba(170, 52, 112, 0.22), transparent 32%),
          linear-gradient(180deg, rgba(86, 11, 53, 0.98), rgba(29, 3, 18, 0.98)) !important;
        -webkit-overflow-scrolling: touch;
        font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", serif;
      }

      .st-heart-hb-settings-head-v7 {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .st-heart-hb-settings-title-v7 {
        font-size: 1.08em;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .st-heart-hb-close-v7,
      .st-heart-hb-btn-v7 {
        border: 1px solid rgba(235, 211, 171, 0.48);
        background: rgba(255,255,255,0.07);
        color: #fff1dd;
        cursor: pointer;
        font: inherit;
        touch-action: manipulation;
      }

      .st-heart-hb-close-v7 {
        width: 32px;
        height: 32px;
        font-size: 18px;
        line-height: 1;
      }

      .st-heart-hb-btn-v7 {
        padding: 7px 10px;
        font-size: 0.88em;
        white-space: nowrap;
      }

      .st-heart-hb-btn-v7.primary {
        border-color: rgba(255, 220, 166, 0.72);
        background: rgba(255, 220, 166, 0.14);
      }

      .st-heart-hb-btn-v7.danger {
        border-color: rgba(255, 164, 190, 0.48);
        color: #ffd4df;
      }

      .st-heart-hb-tip-v7 {
        margin: 0 0 12px;
        padding: 9px 10px;
        border: 1px solid rgba(235, 211, 171, 0.25);
        background: rgba(255,255,255,0.045);
        color: rgba(247, 234, 216, 0.86);
        font-size: 0.86em;
        line-height: 1.65;
      }

      .st-heart-hb-settings-grid-v7 {
        display: grid;
        grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
        gap: 12px;
      }

      .st-heart-hb-section-v7 {
        border: 1px solid rgba(235, 211, 171, 0.36);
        background: rgba(15, 3, 10, 0.22);
        padding: 10px;
      }

      .st-heart-hb-section-title-v7 {
        font-weight: 700;
        margin-bottom: 8px;
        color: #fff1dd;
      }

      .st-heart-hb-color-row-v7 {
        display: grid;
        grid-template-columns: 74px 46px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 0.88em;
      }

      .st-heart-hb-color-row-v7 input[type="color"] {
        width: 46px;
        height: 34px;
        padding: 0;
        border: 1px solid rgba(235, 211, 171, 0.42);
        background: transparent;
      }

      .st-heart-hb-input-v7 {
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

      .st-heart-hb-input-v7::placeholder {
        color: rgba(247, 234, 216, 0.42);
      }

      .st-heart-hb-preview-v7 {
        display: flex;
        align-items: flex-start;
        gap: 0;
        margin-top: 10px;
      }

      .st-heart-hb-preview-avatar-v7 {
        width: 60px;
        height: 60px;
        flex: 0 0 60px;
        border: 1px solid var(--st-heart-hb-preview-border, #DDCFA4);
        background: var(--st-heart-hb-preview-avatar, #560B35);
      }

      .st-heart-hb-preview-dialogue-v7 {
        min-height: 48px;
        flex: 1 1 auto;
        margin-top: 7px;
        margin-left: -1px;
        border: 1px solid var(--st-heart-hb-preview-border, #DDCFA4);
        background: var(--st-heart-hb-preview-dialog, #560B35);
        color: var(--st-heart-hb-preview-text, #F2EAD7);
        padding: 8px 10px;
        line-height: 1.55;
        font-size: 0.86em;
      }

      .st-heart-hb-mood-list-v7 {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .st-heart-hb-mood-block-v7 {
        border: 1px solid rgba(235, 211, 171, 0.3);
        background: rgba(255,255,255,0.035);
        padding: 9px;
      }

      .st-heart-hb-mood-head-v7,
      .st-heart-hb-url-row-v7,
      .st-heart-hb-actions-v7 {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .st-heart-hb-mood-head-v7 {
        margin-bottom: 7px;
      }

      .st-heart-hb-label-v7 {
        flex: 0 0 auto;
        color: rgba(247, 234, 216, 0.82);
        font-size: 0.86em;
      }

      .st-heart-hb-url-list-v7 {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .st-heart-hb-actions-v7 {
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .st-heart-hb-footer-v7 {
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
        .st-heart-hb-settings-grid-v7 {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 460px) {
        dialog.st-heart-hb-dialog-v7 {
          width: calc(100vw - 14px) !important;
          max-width: calc(100vw - 14px) !important;
          max-height: 92vh !important;
        }

        .st-heart-hb-settings-card-v7 {
          max-height: 92vh !important;
          padding: 11px !important;
        }

        .st-heart-hb-color-row-v7 {
          grid-template-columns: 62px 42px minmax(0, 1fr);
          gap: 6px;
        }

        .st-heart-hb-url-row-v7 {
          align-items: stretch;
        }

        .st-heart-hb-footer-v7 {
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
  }

  function cleanMoodName(mood) {
    return String(mood || '').trim() || '普通';
  }

  function resolveMoodKey(mood, pools) {
    const raw = cleanMoodName(mood);

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

  function getAvatarByMood(mood) {
    const pools = getAvatarPools();
    const key = resolveMoodKey(mood, pools);
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
    return hashString([data.id, data.outerMood, data.outer, data.innerMood, data.inner].join('|'));
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
        outerMood: cleanMoodName(outerMatch[2] || '普通'),
        outer: block.slice(outerStart, innerMatch.index).trim(),
        innerMood: cleanMoodName(innerMatch[2] || '普通'),
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
        outerMood: cleanMoodName(combined[1]),
        outer: combined[2].trim(),
        innerMood: cleanMoodName(combined[3]),
        inner: combined[4].trim(),
      };
      data.hash = makeHBHash(data);
      return data;
    }

    const old = raw.match(/\[HB\]\s*outer[:：]\s*([\s\S]*?)\s*inner[:：]\s*([\s\S]*?)\s*\[\/HB\]/i);

    if (old) {
      const data = {
        id: messageId,
        outerMood: '普通',
        outer: old[1].trim(),
        innerMood: '普通',
        inner: old[2].trim(),
      };
      data.hash = makeHBHash(data);
      return data;
    }

    return null;
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
    const textNode = doc.createTextNode('');
    container.appendChild(textNode);

    function appendNextChunk() {
      if (container.__heartTypingRun !== runId) return;
      if (index >= chars.length) return;

      const nextIndex = Math.min(index + TYPE_CHUNK_SIZE, chars.length);
      textNode.data += chars.slice(index, nextIndex).join('');
      index = nextIndex;

      container.__heartTypingTimer = setTimeout(appendNextChunk, SPEED_MS);
    }

    appendNextChunk();
  }

  function buildHeartBox(data, doc) {
    const box = doc.createElement('div');
    box.className = 'st-heart-hb-box';
    box.dataset.mode = 'outer';
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

    const outerAvatar = getAvatarByMood(data.outerMood);
    const innerAvatar = getAvatarByMood(data.innerMood);

    function render() {
      const mode = box.dataset.mode || 'outer';
      const currentText = mode === 'outer' ? data.outer : data.inner;
      const currentMood = mode === 'outer' ? data.outerMood : data.innerMood;

      img.src = mode === 'outer' ? outerAvatar : innerAvatar;
      img.alt = currentMood;

      fillTypedText(text, currentText);
    }

    inner.addEventListener('click', () => {
      box.dataset.mode = box.dataset.mode === 'outer' ? 'inner' : 'outer';
      render();
    });

    render();
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
      <label class="st-heart-hb-color-row-v7">
        <span>${escapeHtml(label)}</span>
        <input type="color" data-theme-key="${safeKey}" value="${safeValue}">
        <input class="st-heart-hb-input-v7" type="text" data-theme-text="${safeKey}" value="${safeValue}" placeholder="#560B35">
      </label>
    `;
  }

  function moodBlockHtml(mood = '', urls = ['']) {
    const cleanUrls = Array.isArray(urls) && urls.length ? urls : [''];

    return `
      <div class="st-heart-hb-mood-block-v7" data-mood-block="1">
        <div class="st-heart-hb-mood-head-v7">
          <span class="st-heart-hb-label-v7">心情名</span>
          <input class="st-heart-hb-input-v7" type="text" data-mood-name="1" value="${escapeHtml(mood)}" placeholder="普通 / sex / 害羞 / 病娇">
          <button type="button" class="st-heart-hb-btn-v7 danger" data-action="remove-mood">删除</button>
        </div>
        <div class="st-heart-hb-url-list-v7" data-url-list="1">
          ${cleanUrls.map((url) => `
            <div class="st-heart-hb-url-row-v7" data-url-row="1">
              <input class="st-heart-hb-input-v7" type="url" data-avatar-url="1" value="${escapeHtml(url)}" placeholder="图片网址，最好以 .png / .jpg / .webp 结尾">
              <button type="button" class="st-heart-hb-btn-v7 danger" data-action="remove-url">-</button>
            </div>
          `).join('')}
        </div>
        <div class="st-heart-hb-actions-v7">
          <button type="button" class="st-heart-hb-btn-v7" data-action="add-url">+ 添加图片网址</button>
        </div>
      </div>
    `;
  }

  function renderMoodBlocks(pools) {
    const clean = sanitizePools(pools);
    const keys = Object.keys(clean);

    if (!keys.length) return moodBlockHtml('', ['']);
    return keys.map((mood) => moodBlockHtml(mood, clean[mood])).join('');
  }

  function collectSettings(container) {
    const themeDraft = {};

    container.querySelectorAll('[data-theme-key]').forEach((input) => {
      themeDraft[input.dataset.themeKey] = input.value;
    });

    const poolsDraft = {};

    container.querySelectorAll('[data-mood-block]').forEach((block) => {
      const mood = String(block.querySelector('[data-mood-name]')?.value || '').trim();
      const urls = Array.from(block.querySelectorAll('[data-avatar-url]'))
        .map((input) => String(input.value || '').trim())
        .filter(Boolean);

      if (mood && urls.length) poolsDraft[mood] = Array.from(new Set(urls));
    });

    return {
      theme: sanitizeTheme(themeDraft),
      pools: sanitizePools(poolsDraft),
    };
  }

  function updatePreview(container, theme) {
    const clean = sanitizeTheme(theme);
    const preview = container.querySelector('.st-heart-hb-preview-v7');

    if (!preview) return;

    preview.style.setProperty('--st-heart-hb-preview-dialog', clean.dialogBg);
    preview.style.setProperty('--st-heart-hb-preview-avatar', clean.avatarBg);
    preview.style.setProperty('--st-heart-hb-preview-border', clean.borderColor);
    preview.style.setProperty('--st-heart-hb-preview-text', clean.textColor);
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
        doc.getElementById('st-heart-hb-settings-dialog-v7')?.remove?.();
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
    const originalPools = cloneJson(getAvatarPools());
    let latestTheme = sanitizeTheme(originalTheme);

    const dialog = doc.createElement('dialog');
    dialog.id = 'st-heart-hb-settings-dialog-v7';
    dialog.className = 'st-heart-hb-dialog-v7';

    dialog.innerHTML = `
      <div class="st-heart-hb-settings-card-v7">
        <div class="st-heart-hb-settings-head-v7">
          <div class="st-heart-hb-settings-title-v7">头像心声框设置</div>
          <button type="button" class="st-heart-hb-close-v7" data-action="cancel">×</button>
        </div>

        <div class="st-heart-hb-tip-v7">
          V7 从零重写设置界面，使用已经测试成功的网页原生 dialog。这里可以改心情头像，也可以直接改对话框和头像框颜色。
        </div>

        <div class="st-heart-hb-settings-grid-v7">
          <section class="st-heart-hb-section-v7">
            <div class="st-heart-hb-section-title-v7">颜色设置</div>
            ${colorRow('对话框', 'dialogBg', originalTheme.dialogBg)}
            ${colorRow('头像框', 'avatarBg', originalTheme.avatarBg)}
            ${colorRow('边框', 'borderColor', originalTheme.borderColor)}
            ${colorRow('文字', 'textColor', originalTheme.textColor)}

            <div class="st-heart-hb-actions-v7">
              <button type="button" class="st-heart-hb-btn-v7" data-action="reset-colors">恢复默认颜色</button>
            </div>

            <div class="st-heart-hb-preview-v7">
              <div class="st-heart-hb-preview-avatar-v7"></div>
              <div class="st-heart-hb-preview-dialogue-v7">颜色预览：保存后，已经显示的心声框也会同步刷新。</div>
            </div>
          </section>

          <section class="st-heart-hb-section-v7">
            <div class="st-heart-hb-section-title-v7">心情头像配置</div>
            <div class="st-heart-hb-tip-v7">
              AI 输出示例：<br>
              普通|outer：表面话。<br>
              sex|inner：内心话。<br>
              心情名要和这里的名字一致。
            </div>
            <div class="st-heart-hb-mood-list-v7" data-mood-list="1">
              ${renderMoodBlocks(originalPools)}
            </div>
            <div class="st-heart-hb-actions-v7">
              <button type="button" class="st-heart-hb-btn-v7" data-action="add-mood">+ 添加心情</button>
              <button type="button" class="st-heart-hb-btn-v7" data-action="reset-avatars">恢复默认头像</button>
            </div>
          </section>
        </div>

        <div class="st-heart-hb-footer-v7">
          <button type="button" class="st-heart-hb-btn-v7" data-action="cancel">关闭</button>
          <button type="button" class="st-heart-hb-btn-v7 primary" data-action="save">保存</button>
        </div>
      </div>
    `;

    (doc.body || doc.documentElement).appendChild(dialog);

    const container = dialog.querySelector('.st-heart-hb-settings-card-v7');

    function updateDraft() {
      const current = collectSettings(container);
      latestTheme = current.theme;
      applyTheme(latestTheme);
      updatePreview(container, latestTheme);
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
        dialog.close('cancel');
        return;
      }

      if (action === 'save') {
        const current = collectSettings(container);
        const cleanPools = sanitizePools(current.pools);

        if (!Object.keys(cleanPools).length) {
          alert('保存失败：至少保留一个心情，并且这个心情下至少有一个图片网址。');
          return;
        }

        saveAvatarPools(cleanPools);
        saveTheme(current.theme);
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

      if (action === 'reset-avatars') {
        const list = container.querySelector('[data-mood-list]');
        if (list) list.innerHTML = renderMoodBlocks(DEFAULT_AVATAR_POOLS);
        updateDraft();
        return;
      }

      if (action === 'add-mood') {
        const list = container.querySelector('[data-mood-list]');
        if (list) {
          list.insertAdjacentHTML('beforeend', moodBlockHtml('', ['']));
          list.querySelector('[data-mood-block]:last-child [data-mood-name]')?.focus?.();
        }
        updateDraft();
        return;
      }

      if (action === 'remove-mood') {
        btn.closest('[data-mood-block]')?.remove?.();
        updateDraft();
        return;
      }

      if (action === 'add-url') {
        const block = btn.closest('[data-mood-block]');
        const list = block?.querySelector?.('[data-url-list]');

        if (list) {
          list.insertAdjacentHTML('beforeend', `
            <div class="st-heart-hb-url-row-v7" data-url-row="1">
              <input class="st-heart-hb-input-v7" type="url" data-avatar-url="1" value="" placeholder="图片网址，最好以 .png / .jpg / .webp 结尾">
              <button type="button" class="st-heart-hb-btn-v7 danger" data-action="remove-url">-</button>
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
        avatarPoolsCache = sanitizePools(originalPools);
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
      console.error('[头像心声框 V7] 打开设置 dialog 失败：', e);
      alert('打开设置界面失败：' + e.message);
      dialog.remove();
    }
  }

  function setupButtons() {
    const P = getP();
    const replaceButtons = P.replaceScriptButtons || window.replaceScriptButtons;
    const onButton = P.eventOnButton || window.eventOnButton;

    if (typeof replaceButtons !== 'function' || typeof onButton !== 'function') {
      console.warn('[头像心声框 V7] 未找到酒馆助手按钮 API：replaceScriptButtons / eventOnButton');
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
      console.warn('[头像心声框 V7] 事件绑定失败：', eventName, e);
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

    console.log('[头像心声框 V7] loaded：原生 dialog 设置界面 / 可调颜色 / 任意心情头像');
  }

  boot();
})();
