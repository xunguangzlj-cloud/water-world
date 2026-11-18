# 水世界 · 深海花园

一个可以自由游动的中文 WebGPU 海底世界。从鲸尾石雕出发，可以穿过海藻林、游进沉船峡谷，也可以去水母洄游湾拨动水流，看水母依次亮起来。

**[在线游玩](https://xunguangzlj-cloud.github.io/water-world/)** · [下载单文件离线版](https://raw.githubusercontent.com/xunguangzlj-cloud/water-world/main/index.html)

## 怎么玩

使用支持 WebGPU 的浏览器打开游戏，点击「开始潜水」，或从「前往潜点」直接选择目的地。靠近可交互的位置，画面上会出现投喂礁鱼、敲钟、转动星盘或拨动水流的按钮。

| 操作 | 电脑 | 手机操控模式 |
| --- | --- | --- |
| 游动与加速 | WASD 游动，按住 Shift 加速 | 左侧摇杆控制方向，推到外圈加速 |
| 转动视角 | 按住鼠标左键拖动 | 在右侧画面滑动 |
| 上浮、下潜 | E 上浮，Q 下潜 | 按住上浮或下潜按钮 |
| 切换第一、第三人称 | V | 点视角切换按钮 |
| 与附近物体互动 | R 或点击互动按钮 | 点互动按钮 |

手机支持横屏与竖屏。在第三人称下可以看到角色划水、打腿和转弯倾身。离线游玩时，将下载的文件保存为 `index.html`，用支持 WebGPU 的桌面浏览器打开即可。

## 从源码构建

海域、鱼群、角色渲染和交互逻辑在 [source/src](source/src)。仓库包含已打包的角色资源，普通构建只需要 Node.js 与 npm。

```sh
cd source
npm ci
npm run build
```

构建结果在仓库根目录的 `index.html`，其中已嵌入角色资源。用于重新制作角色资源的 Python 脚本在 [tools/avatar](tools/avatar)，需要相应的原始角色 GLB、NumPy 和 Pillow。

## 参考作品与致谢

- 感谢 **Maksymilian Dendura（Noniv）** 创作并以 MIT 许可公开《Abyssal Garden》。本项目从该仓库派生，沿用了程序化海底地形、海藻、水下光照与合成音景，并在此基础上扩展了中文交互、手机操控、海域和游泳角色。[原作仓库](https://github.com/Noniv/abyssal-garden) · [原作 MIT 许可](LICENSE)
- 感谢**《暖光玩具房》V30 的创作者**。本项目使用了作品中的角色模型、骨骼与服饰贴图，并为水下场景重新编排了游泳动作。角色素材的权利归相应权利人所有。[《暖光玩具房》网页试玩](https://v25.dafeiyugame.site/)
