/* 头像心声框：远程加载器模板
   用法：
   1. 把 st-heart-hb-configurable-avatar.js 上传到 GitHub 仓库。
   2. 把下面 REMOTE_SCRIPT_URL 改成你的 jsDelivr 地址。
   3. 酒馆里只保留这一小段加载器。
*/

(() => {
  const REMOTE_SCRIPT_URL = 'https://cdn.jsdelivr.net/gh/你的GitHub用户名/你的仓库名@main/st-heart-hb-configurable-avatar.js?v=1';

  const LOADER_FLAG = '__ST_HEART_HB_REMOTE_LOADER_V1__';

  if (window[LOADER_FLAG]) return;
  window[LOADER_FLAG] = true;

  const doc = document;

  const oldScript = doc.querySelector('script[data-st-heart-hb-remote="1"]');
  if (oldScript) oldScript.remove();

  const script = doc.createElement('script');
  script.src = REMOTE_SCRIPT_URL;
  script.async = true;
  script.dataset.stHeartHbRemote = '1';

  script.onload = () => {
    console.log('[头像心声框] 远程脚本加载成功');
  };

  script.onerror = () => {
    console.error('[头像心声框] 远程脚本加载失败，请检查网址是否可访问：', REMOTE_SCRIPT_URL);
  };

  (doc.head || doc.documentElement || doc.body).appendChild(script);
})();
