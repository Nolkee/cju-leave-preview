> **仅供学习与界面交互演示，请勿用于虚假请假、伪造请假证明或冒充正式校务系统。**

# 重庆交通大学 CJU 请假

手机端请假流程练习项目，包含请假记录、申请表、详情、附件与签字预览、删除和到期自动销假。

申请记录和附件保存在当前浏览器的 `localStorage` 中。审批和销假是网页内的状态变化。学校和企业微信系统不会收到在本项目中提交的申请。

## 本地预览

在项目根目录运行：

```sh
python3 -m http.server 4173
```

在浏览器打开 [本地预览](http://127.0.0.1:4173/)。

## 项目结构

- `index.html`、`style.css`、`app.js` 是网页入口、样式和交互逻辑。
- `dist/` 是可直接部署的静态文件。修改源码后，将对应文件同步到 `dist/`。
- `site.webmanifest` 和图标文件用于网页快捷方式。

## 双线路（Vercel 优先，Netlify 兜底）

`*.vercel.app` 在国内会被 DNS 污染，不翻墙打不开，所以加了智能切换：

- 主站：`https://cju-leave-demo.vercel.app/`（Vercel）
- 兜底站：`https://cju-leave-preview.netlify.app/`（Netlify） 静态站（`*.netlify.app`，部署 `dist/`）
- 入口请分享 Netlify 地址。Netlify 上的 `index.html` 会在打开时用 3 秒试探 Vercel 通不通，通就跳到 Vercel（保留 `#` 路由），不通或超时就留在 Netlify 正常显示。
- 上次结果记在浏览器 `localStorage`（`cju-leave-route-v1`，12 小时有效），上次走 Netlify 就直接留，不再等 3 秒。
- 手动强制：`?route=vercel` 直接去 Vercel，`?route=netlify`（或 `?route=pxxl`）强制留当前站。本地预览（localhost）不做探测。
