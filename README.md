# Finance Planner

个人财务规划助手，含“冷静期应用锁”。支持 Web 与 Android。

## 技术栈

React + Vite + TypeScript · Express · Dexie · Capacitor Android

## 开发

```bash
npm install
npm run dev:all   # 前端 + API
```

单独启动：

```bash
npm run dev      # 前端
npm run server   # API
```

## 构建

```bash
npm run build
```

Android 工程在 `android/`，用 Capacitor 同步并打包。

