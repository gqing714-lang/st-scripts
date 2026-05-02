/* 头像心声框：可视化头像配置版 / 任意心情名 / 轻量逐字 / 紫红底色 / 手机弹窗修正版 / 保留最新5个

AI回复格式：
[HB]
普通|outer：角色表面说出口的话、外在表现。禁止与正文中发言完全相同。
sex|inner：角色未说出口的真实心声、欲望、判断、隐藏情绪或真实意图。
[/HB]

心情名可以自定义。
只要你在“头像设置”里添加了对应心情名和图片网址，AI 就可以输出：
害羞|outer：……
病娇|inner：……

使用方式：
1. 正则只负责隐藏 [HB] 原文，不生成HTML。
2. 脚本读取 ctx.chat 里的原始 [HB]。
3. 点击心声框主体：切换 outer / inner。
4. 点击“底图”：开关头像底图。
5. 点击“头像设置”：添加/删除心情与图片网址。
6. 保存后配置会写入 localStorage。
7. 逐字为轻量版，手机端更稳。
8. 自动清理旧心声框，只保留最新5个。
9. 修正手机端弹窗可能挂到不可见 document 或被遮挡的问题。
*/

(() => {
  if (window.__ST_HEART_HB_CONFIGURABLE_AVATAR_KEEP5_MOBILEFIX_V1__) return;
  window.__ST_HEART_HB_CONFIGURABLE_AVATAR_KEEP5_MOBILEFIX_V1__ = true;

  const SPEED_MS = 24;
  const TYPE_CHUNK_SIZE = 2;
  const KEEP_HB_BOX_COUNT = 5;

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

  const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700&display=swap';

  const HB_REGEX_NEW = /\[HB\]\s*([^\n\r|：:]+?)\s*\|\s*outer[:：]\s*([\s\S]*?)\s*([^\n\r|：:]+?)\s*\|\s*inner[:：]\s*([\s\S]*?)\s*\[\/HB\]/i;
  const HB_REGEX_OLD = /\[HB\]\s*outer[:：]\s*([\s\S]*?)\s*inner[:：]\s*([\s\S]*?)\s*\[\/HB\]/i;

  const STORAGE_KEY_BG = 'st-heart-hb-avatar-bg-enabled';
  const STORAGE_KEY_AVATAR_POOLS = 'st-heart-hb-avatar-pools-config-v1';

  const HELPER_BUTTON_BG = '底图';
  const HELPER_BUTTON_SETTINGS = '头像设置';

  const SETTINGS_OVERLAY_ID = 'st-heart-hb-avatar-config-overlay';

  let heartHbRenderTimer = null;
  let avatarPoolsCache = null;

  function getP() {
    try {
      if (window.top && window.top !== window && window.top.document) return window.top;
    } catch (e) {}

    try {
      if (window.parent && window.parent !== window && window.parent.document) return window.parent;
    } catch (e) {}

    return window;
  }

  function getDoc() {
    try {
      const topDoc = window.top?.document;
      if (topDoc?.body) return topDoc;
    } catch (e) {}

    try {
      const parentDoc = window.parent?.document;
      if (parentDoc?.body) return parentDoc;
    } catch (e) {}

    return document;
  }

  function getStorage() {
    try {
      return getP().localStorage || window.localStorage;
    } catch (e) {
      return window.localStorage;
    }
  }

  function clonePools(pools) {
    return JSON.parse(JSON.stringify(pools || {}));
  }

  function sanitizePools(rawPools) {
    const output = {};

    if (!rawPools || typeof rawPools !== 'object') return output;

    Object.keys(rawPools).forEach((rawMood) => {
      const mood = String(rawMood || '').trim();
      const urls = Array.isArray(rawPools[rawMood]) ? rawPools[rawMood] : [];

      const cleanUrls = Array.from(new Set(
        urls
          .map((url) => String(url || '').trim())
          .filter(Boolean)
      ));

      if (mood && cleanUrls.length) {
        output[mood] = cleanUrls;
      }
    });

    return output;
  }

  function getAvatarPools() {
    if (avatarPoolsCache) return avatarPoolsCache;

    try {
      const saved = getStorage().getItem(STORAGE_KEY_AVATAR_POOLS);

      if (saved) {
        const parsed = JSON.parse(saved);
        const clean = sanitizePools(parsed);

        if (Object.keys(clean).length) {
          avatarPoolsCache = clean;
          return avatarPoolsCache;
        }
      }
    } catch (e) {
      console.warn('[头像心声框] 读取头像配置失败，使用默认配置：', e);
    }

    avatarPoolsCache = clonePools(DEFAULT_AVATAR_POOLS);
    return avatarPoolsCache;
  }

  function saveAvatarPools(pools) {
    const clean = sanitizePools(pools);

    if (!Object.keys(clean).length) {
      avatarPoolsCache = clonePools(DEFAULT_AVATAR_POOLS);
    } else {
      avatarPoolsCache = clean;
    }

    try {
      getStorage().setItem(STORAGE_KEY_AVATAR_POOLS, JSON.stringify(avatarPoolsCache));
    } catch (e) {
      console.warn('[头像心声框] 保存头像配置失败：', e);
    }
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
    return hashString([
      data.id,
      data.outerMood,
      data.outer,
      data.innerMood,
      data.inner,
    ].join('|'));
  }

  function getBgEnabled() {
    try {
      const saved = getStorage().getItem(STORAGE_KEY_BG);
      if (saved === '0') return false;
      return true;
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
    const doc = getDoc();
    const enabled = getBgEnabled();

    doc.querySelectorAll('.st-heart-hb-box').forEach((box) => {
      box.classList.toggle('st-heart-hb-bg-off', !enabled);
    });
  }

  function setupHelperButtons() {
    const P = getP();

    const replaceButtons =
      P.replaceScriptButtons ||
      window.replaceScriptButtons;

    const onButton =
      P.eventOnButton ||
      window.eventOnButton;

    if (typeof replaceButtons === 'function') {
      replaceButtons([
        {
          name: HELPER_BUTTON_BG,
          visible: true,
        },
        {
          name: HELPER_BUTTON_SETTINGS,
          visible: true,
        },
      ]);
    }

    if (typeof onButton === 'function') {
      onButton(HELPER_BUTTON_BG, () => {
        setBgEnabled(!getBgEnabled());
      });

      onButton(HELPER_BUTTON_SETTINGS, () => {
        openAvatarSettingsPanel();
      });
    }
  }

  function injectFont() {
    const doc = getDoc();

    if (!doc.head) return;

    if (!doc.getElementById('st-heart-hb-font-preconnect-1')) {
      const preconnect1 = doc.createElement('link');
      preconnect1.id = 'st-heart-hb-font-preconnect-1';
      preconnect1.rel = 'preconnect';
      preconnect1.href = 'https://fonts.googleapis.com';
      doc.head.appendChild(preconnect1);
    }

    if (!doc.getElementById('st-heart-hb-font-preconnect-2')) {
      const preconnect2 = doc.createElement('link');
      preconnect2.id = 'st-heart-hb-font-preconnect-2';
      preconnect2.rel = 'preconnect';
      preconnect2.href = 'https://fonts.gstatic.com';
      preconnect2.crossOrigin = 'anonymous';
      doc.head.appendChild(preconnect2);
    }

    if (doc.getElementById('st-heart-hb-google-font')) return;

    const link = doc.createElement('link');
    link.id = 'st-heart-hb-google-font';
    link.rel = 'stylesheet';
    link.href = FONT_LINK;

    doc.head.appendChild(link);
  }

  function injectStyle() {
    const doc = getDoc();

    injectFont();

    if (doc.getElementById('st-heart-hb-style-configurable-avatar-keep5-mobilefix')) return;

    const style = doc.createElement('style');
    style.id = 'st-heart-hb-style-configurable-avatar-keep5-mobilefix';

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
        color: #f2ead7;
        overflow: visible;
        filter: drop-shadow(0 7px 14px rgba(44, 3, 25, 0.32));
      }

      .st-heart-hb-avatar {
        width: 74px;
        height: 74px;
        flex: 0 0 74px;
        border: 1px solid rgba(221, 207, 164, 0.9);
        background:
          radial-gradient(circle at 50% 35%, rgba(145, 35, 91, 0.76), #560B35 58%, rgba(22, 3, 14, 0.98) 100%);
        overflow: hidden;
        position: relative;
        z-index: 2;
        box-shadow:
          inset 0 0 0 1px rgba(86, 11, 53, 0.68),
          inset 0 0 16px rgba(0, 0, 0, 0.26),
          0 3px 8px rgba(44, 3, 25, 0.28);
        transition:
          background 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease;
      }

      .st-heart-hb-bg-off .st-heart-hb-avatar {
        background: transparent;
        box-shadow:
          0 3px 8px rgba(44, 3, 25, 0.28);
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
        border: 1px solid rgba(221, 207, 164, 0.88);
        background:
          radial-gradient(circle at 12% 0%, rgba(165, 43, 105, 0.24), transparent 34%),
          linear-gradient(180deg, rgba(86, 11, 53, 0.98), rgba(31, 3, 19, 0.98));
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
          inset 0 1px 0 rgba(255,255,255,0.06);
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
        color: rgba(244, 202, 221, 0.95);
        text-shadow: 0 0 7px rgba(244, 160, 200, 0.34);
        pointer-events: none;
        animation: stHeartHbDiamondFloat 2.8s ease-in-out infinite;
      }

      @keyframes stHeartHbDiamondFloat {
        0%, 100% {
          transform: translateY(0);
          opacity: 0.72;
        }

        50% {
          transform: translateY(-4px);
          opacity: 1;
        }
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

      #st-heart-hb-avatar-config-overlay,
      #st-heart-hb-avatar-config-overlay * {
        box-sizing: border-box;
      }

      #st-heart-hb-avatar-config-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(12, 3, 9, 0.58);
        font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", serif;
        color: #f7ead8;
      }

      .st-heart-hb-config-panel {
        width: min(680px, calc(100vw - 28px));
        max-height: min(760px, calc(100vh - 42px));
        display: flex;
        flex-direction: column;
        border: 1px solid rgba(235, 211, 171, 0.72);
        background:
          radial-gradient(circle at 0% 0%, rgba(170, 52, 112, 0.22), transparent 32%),
          linear-gradient(180deg, rgba(86, 11, 53, 0.98), rgba(29, 3, 18, 0.98));
        box-shadow:
          0 18px 46px rgba(0, 0, 0, 0.45),
          inset 0 1px 0 rgba(255,255,255,0.08);
        overflow: hidden;
      }

      .st-heart-hb-config-header {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(235, 211, 171, 0.36);
      }

      .st-heart-hb-config-title {
        font-size: 1em;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .st-heart-hb-config-close {
        width: 30px;
        height: 30px;
        border: 1px solid rgba(235, 211, 171, 0.48);
        background: rgba(255,255,255,0.06);
        color: #f7ead8;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      .st-heart-hb-config-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 12px;
        -webkit-overflow-scrolling: touch;
      }

      .st-heart-hb-config-tip {
        margin: 0 0 12px;
        padding: 9px 10px;
        border: 1px solid rgba(235, 211, 171, 0.25);
        background: rgba(255,255,255,0.045);
        color: rgba(247, 234, 216, 0.86);
        font-size: 0.86em;
        line-height: 1.65;
      }

      .st-heart-hb-config-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .st-heart-hb-config-mood-block {
        border: 1px solid rgba(235, 211, 171, 0.38);
        background: rgba(15, 3, 10, 0.22);
        padding: 10px;
      }

      .st-heart-hb-config-mood-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .st-heart-hb-config-label {
        flex: 0 0 auto;
        color: rgba(247, 234, 216, 0.82);
        font-size: 0.86em;
      }

      .st-heart-hb-config-input {
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

      .st-heart-hb-config-input::placeholder {
        color: rgba(247, 234, 216, 0.42);
      }

      .st-heart-hb-config-url-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .st-heart-hb-config-url-row {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .st-heart-hb-config-btn {
        border: 1px solid rgba(235, 211, 171, 0.45);
        background: rgba(255,255,255,0.07);
        color: #fff1dd;
        padding: 7px 10px;
        cursor: pointer;
        font: inherit;
        font-size: 0.86em;
        white-space: nowrap;
      }

      .st-heart-hb-config-btn:hover {
        background: rgba(255,255,255,0.12);
      }

      .st-heart-hb-config-btn-danger {
        border-color: rgba(255, 164, 190, 0.46);
        color: #ffd4df;
      }

      .st-heart-hb-config-btn-primary {
        border-color: rgba(255, 220, 166, 0.68);
        background: rgba(255, 220, 166, 0.13);
      }

      .st-heart-hb-config-block-actions {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 9px;
      }

      .st-heart-hb-config-footer {
        flex: 0 0 auto;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        border-top: 1px solid rgba(235, 211, 171, 0.36);
        background: rgba(0,0,0,0.12);
      }

      .st-heart-hb-config-footer-left,
      .st-heart-hb-config-footer-right {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .st-heart-hb-config-status {
        padding: 0 14px 10px;
        color: rgba(247, 234, 216, 0.72);
        font-size: 0.82em;
      }

      @media (max-width: 460px) {
        #st-heart-hb-avatar-config-overlay {
          align-items: stretch !important;
          justify-content: center !important;
          padding: 10px !important;
        }

        .st-heart-hb-config-panel {
          width: 100%;
          max-height: calc(100vh - 20px);
        }

        .st-heart-hb-config-mood-head,
        .st-heart-hb-config-url-row {
          align-items: stretch;
        }

        .st-heart-hb-config-url-row {
          flex-direction: row;
        }

        .st-heart-hb-config-footer {
          align-items: stretch;
          flex-direction: column;
        }

        .st-heart-hb-config-footer-left,
        .st-heart-hb-config-footer-right {
          width: 100%;
        }

        .st-heart-hb-config-btn {
          flex: 1 1 auto;
        }
      }

      @media (max-width: 380px) {
        .st-heart-hb-box {
          max-width: calc(100vw - 12px);
        }

        .st-heart-hb-avatar {
          width: 62px;
          height: 62px;
          flex-basis: 62px;
        }

        .st-heart-hb-dialogue {
          width: 0;
          max-width: none;
          padding: 8px 26px 15px 10px;
          font-size: 0.88em;
        }
      }

      @media (max-width: 330px) {
        .st-heart-hb-box {
          max-width: calc(100vw - 8px);
        }

        .st-heart-hb-avatar {
          width: 56px;
          height: 56px;
          flex-basis: 56px;
        }

        .st-heart-hb-dialogue {
          font-size: 0.86em;
          padding-right: 24px;
        }
      }
    `;

    doc.head.appendChild(style);
  }

  function closeAvatarSettingsPanel() {
    const doc = getDoc();
    doc.getElementById(SETTINGS_OVERLAY_ID)?.remove();
  }

  function openAvatarSettingsPanel() {
    injectStyle();

    const doc = getDoc();

    closeAvatarSettingsPanel();

    let workingPools = clonePools(getAvatarPools());

    const overlay = doc.createElement('div');
    overlay.id = SETTINGS_OVERLAY_ID;

    const panel = doc.createElement('div');
    panel.className = 'st-heart-hb-config-panel';

    const header = doc.createElement('div');
    header.className = 'st-heart-hb-config-header';

    const title = doc.createElement('div');
    title.className = 'st-heart-hb-config-title';
    title.textContent = '头像设置';

    const closeBtn = doc.createElement('button');
    closeBtn.className = 'st-heart-hb-config-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeAvatarSettingsPanel);

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = doc.createElement('div');
    body.className = 'st-heart-hb-config-body';

    const tip = doc.createElement('div');
    tip.className = 'st-heart-hb-config-tip';
    tip.textContent = '心情名要和 [HB] 里的前缀一致。例如：sex|inner：……。同一心情可以放多张图，脚本会随机抽一张。';

    const list = doc.createElement('div');
    list.className = 'st-heart-hb-config-list';

    body.appendChild(tip);
    body.appendChild(list);

    const status = doc.createElement('div');
    status.className = 'st-heart-hb-config-status';
    status.textContent = '';

    const footer = doc.createElement('div');
    footer.className = 'st-heart-hb-config-footer';

    const footerLeft = doc.createElement('div');
    footerLeft.className = 'st-heart-hb-config-footer-left';

    const footerRight = doc.createElement('div');
    footerRight.className = 'st-heart-hb-config-footer-right';

    const addMoodBtn = doc.createElement('button');
    addMoodBtn.type = 'button';
    addMoodBtn.className = 'st-heart-hb-config-btn';
    addMoodBtn.textContent = '+ 添加心情';

    const resetBtn = doc.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'st-heart-hb-config-btn st-heart-hb-config-btn-danger';
    resetBtn.textContent = '恢复默认';

    const cancelBtn = doc.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'st-heart-hb-config-btn';
    cancelBtn.textContent = '关闭';

    const saveBtn = doc.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'st-heart-hb-config-btn st-heart-hb-config-btn-primary';
    saveBtn.textContent = '保存';

    footerLeft.appendChild(addMoodBtn);
    footerLeft.appendChild(resetBtn);
    footerRight.appendChild(cancelBtn);
    footerRight.appendChild(saveBtn);

    footer.appendChild(footerLeft);
    footer.appendChild(footerRight);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(status);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    (doc.body || doc.documentElement).appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeAvatarSettingsPanel();
    });

    cancelBtn.addEventListener('click', closeAvatarSettingsPanel);

    function createUrlRow(value = '') {
      const row = doc.createElement('div');
      row.className = 'st-heart-hb-config-url-row';

      const input = doc.createElement('input');
      input.className = 'st-heart-hb-config-input st-heart-hb-config-url-input';
      input.type = 'url';
      input.placeholder = '图片网址，例如 https://example.com/avatar.png';
      input.value = value;

      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'st-heart-hb-config-btn st-heart-hb-config-btn-danger';
      removeBtn.textContent = '-';

      removeBtn.addEventListener('click', () => {
        row.remove();
      });

      row.appendChild(input);
      row.appendChild(removeBtn);

      return row;
    }

    function createMoodBlock(mood = '', urls = ['']) {
      const block = doc.createElement('div');
      block.className = 'st-heart-hb-config-mood-block';

      const head = doc.createElement('div');
      head.className = 'st-heart-hb-config-mood-head';

      const label = doc.createElement('div');
      label.className = 'st-heart-hb-config-label';
      label.textContent = '心情名';

      const moodInput = doc.createElement('input');
      moodInput.className = 'st-heart-hb-config-input st-heart-hb-config-mood-name';
      moodInput.type = 'text';
      moodInput.placeholder = '普通 / sex / 不高兴 / 害羞';
      moodInput.value = mood;

      head.appendChild(label);
      head.appendChild(moodInput);

      const urlList = doc.createElement('div');
      urlList.className = 'st-heart-hb-config-url-list';

      const cleanUrls = Array.isArray(urls) && urls.length ? urls : [''];

      cleanUrls.forEach((url) => {
        urlList.appendChild(createUrlRow(url));
      });

      const actions = doc.createElement('div');
      actions.className = 'st-heart-hb-config-block-actions';

      const addUrlBtn = doc.createElement('button');
      addUrlBtn.type = 'button';
      addUrlBtn.className = 'st-heart-hb-config-btn';
      addUrlBtn.textContent = '+ 添加图片网址';

      const removeMoodBtn = doc.createElement('button');
      removeMoodBtn.type = 'button';
      removeMoodBtn.className = 'st-heart-hb-config-btn st-heart-hb-config-btn-danger';
      removeMoodBtn.textContent = '删除心情';

      addUrlBtn.addEventListener('click', () => {
        const row = createUrlRow('');
        urlList.appendChild(row);
        row.querySelector('input')?.focus();
      });

      removeMoodBtn.addEventListener('click', () => {
        block.remove();
      });

      actions.appendChild(addUrlBtn);
      actions.appendChild(removeMoodBtn);

      block.appendChild(head);
      block.appendChild(urlList);
      block.appendChild(actions);

      return block;
    }

    function renderList() {
      list.textContent = '';

      const clean = sanitizePools(workingPools);
      const keys = Object.keys(clean);

      if (!keys.length) {
        list.appendChild(createMoodBlock('', ['']));
        return;
      }

      keys.forEach((mood) => {
        list.appendChild(createMoodBlock(mood, clean[mood]));
      });
    }

    function collectPoolsFromUI() {
      const result = {};

      list.querySelectorAll('.st-heart-hb-config-mood-block').forEach((block) => {
        const mood = String(block.querySelector('.st-heart-hb-config-mood-name')?.value || '').trim();

        const urls = Array.from(block.querySelectorAll('.st-heart-hb-config-url-input'))
          .map((input) => String(input.value || '').trim())
          .filter(Boolean);

        if (mood && urls.length) {
          result[mood] = Array.from(new Set(urls));
        }
      });

      return result;
    }

    addMoodBtn.addEventListener('click', () => {
      const block = createMoodBlock('', ['']);
      list.appendChild(block);
      block.querySelector('.st-heart-hb-config-mood-name')?.focus();
    });

    resetBtn.addEventListener('click', () => {
      workingPools = clonePools(DEFAULT_AVATAR_POOLS);
      renderList();
      status.textContent = '已恢复为默认配置。点击“保存”后生效。';
    });

    saveBtn.addEventListener('click', () => {
      const nextPools = collectPoolsFromUI();

      if (!Object.keys(nextPools).length) {
        status.textContent = '至少要保留一个心情，并且这个心情下至少有一个图片网址。';
        return;
      }

      saveAvatarPools(nextPools);
      rebuildVisibleHeartBoxesAfterConfigChange();
      status.textContent = '已保存。';

      setTimeout(() => {
        closeAvatarSettingsPanel();
      }, 180);
    });

    renderList();
  }

  function getChat() {
    const P = getP();

    const ctx =
      P.SillyTavern?.getContext?.() ||
      P.getContext?.() ||
      window.SillyTavern?.getContext?.() ||
      window.getContext?.();

    return ctx?.chat || P.chat || window.chat || null;
  }

  function parseHBFromText(text, messageId) {
    const raw = String(text || '');

    const newMatch = raw.match(HB_REGEX_NEW);

    if (newMatch) {
      const data = {
        id: messageId,
        outerMood: cleanMoodName(newMatch[1]),
        outer: newMatch[2].trim(),
        innerMood: cleanMoodName(newMatch[3]),
        inner: newMatch[4].trim(),
      };

      data.hash = makeHBHash(data);

      return data;
    }

    const oldMatch = raw.match(HB_REGEX_OLD);

    if (oldMatch) {
      const data = {
        id: messageId,
        outerMood: '普通',
        outer: oldMatch[1].trim(),
        innerMood: '普通',
        inner: oldMatch[2].trim(),
      };

      data.hash = makeHBHash(data);

      return data;
    }

    return null;
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

    for (let i = chat.length - 1; i >= Math.max(0, chat.length - 20); i--) {
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
        const $mes = fn(messageId);

        if ($mes && $mes.length) {
          return $mes[0];
        }
      }
    } catch (e) {}

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
    const doc = getDoc();

    const boxes = Array.from(doc.querySelectorAll('.st-heart-hb-box'));

    if (boxes.length <= KEEP_HB_BOX_COUNT) return;

    boxes.sort((a, b) => {
      const aid = Number(a.dataset.hbMessageId || -1);
      const bid = Number(b.dataset.hbMessageId || -1);
      return bid - aid;
    });

    boxes.slice(KEEP_HB_BOX_COUNT).forEach((box) => {
      cancelTypingInBox(box);
      box.remove();
    });
  }

  function fillTypedText(container, text) {
    const doc = getDoc();

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

  function buildHeartBox(data) {
    const doc = getDoc();

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

  function forceRenderHBForMessage(messageId) {
    injectStyle();

    const data = findHBByMessageId(messageId);

    if (!data) return false;

    const host = getMessageHost(data.id);

    if (!host) return false;

    host.querySelectorAll?.('.st-heart-hb-box').forEach((node) => {
      cancelTypingInBox(node);
      node.remove();
    });

    const box = buildHeartBox(data);
    host.appendChild(box);

    cleanupOldHeartBoxes();
    applyBgModeToAll();

    return true;
  }

  function rebuildVisibleHeartBoxesAfterConfigChange() {
    const doc = getDoc();

    const ids = Array.from(doc.querySelectorAll('.st-heart-hb-box'))
      .map((box) => Number(box.dataset.hbMessageId))
      .filter((id) => Number.isFinite(id));

    const uniqueIds = Array.from(new Set(ids));

    if (!uniqueIds.length) {
      renderHBForMessage(undefined);
      return;
    }

    uniqueIds.forEach((id) => {
      forceRenderHBForMessage(id);
    });

    cleanupOldHeartBoxes();
    applyBgModeToAll();
  }

  function renderHBForMessage(messageId) {
    injectStyle();

    let data = null;

    if (typeof messageId === 'number') {
      data = findHBByMessageId(messageId);
    }

    if (!data) {
      data = findLastHB();
    }

    if (!data) return false;

    const host = getMessageHost(data.id);

    if (!host) return false;

    const existingBox = host.querySelector?.('.st-heart-hb-box');

    if (existingBox && existingBox.dataset.hbHash === String(data.hash || '')) {
      cleanupOldHeartBoxes();
      applyBgModeToAll();
      return true;
    }

    host.querySelectorAll?.('.st-heart-hb-box').forEach((node) => {
      cancelTypingInBox(node);
      node.remove();
    });

    const box = buildHeartBox(data);
    host.appendChild(box);

    cleanupOldHeartBoxes();
    applyBgModeToAll();

    return true;
  }

  function delayedRender(messageId) {
    const id = Number(messageId);

    if (heartHbRenderTimer) {
      clearTimeout(heartHbRenderTimer);
      heartHbRenderTimer = null;
    }

    heartHbRenderTimer = setTimeout(() => {
      renderHBForMessage(Number.isFinite(id) ? id : undefined);
    }, 260);
  }

  function safeEventOn(eventName, handler) {
    try {
      const P = getP();
      const on = P.eventOn || window.eventOn;

      if (eventName && typeof on === 'function') {
        on(eventName, handler);
      }
    } catch (e) {
      console.warn('[头像心声框：可视化头像配置版] 事件绑定失败：', eventName, e);
    }
  }

  function bindEvents() {
    const P = getP();
    const ev = P.tavern_events || window.tavern_events;

    if (!ev) return;

    safeEventOn(ev.MESSAGE_RECEIVED, (messageId) => {
      delayedRender(messageId);
    });

    // 不监听 MESSAGE_UPDATED。
    // 这个事件在流式回复时可能频繁触发，会反复重建心声框，导致逐字动画卡顿。
    // safeEventOn(ev.MESSAGE_UPDATED, (messageId) => {
    //   delayedRender(messageId);
    // });

    safeEventOn(ev.MESSAGE_EDITED, (messageId) => {
      delayedRender(messageId);
    });

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

  injectStyle();
  setupHelperButtons();
  bindEvents();

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

  console.log('[头像心声框：可视化头像配置版 / 任意心情 / 手机弹窗修正 / 保留最新5个] loaded');
})();
