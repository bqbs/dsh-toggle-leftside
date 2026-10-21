# dsh-compact-left

[English](README.md) | 中文

一个 DSH 客户端插件，为折叠状态的左侧边栏增加「悬停临时展开」能力。

官方外壳把侧边栏当作二元的 `收起 ⟷ 展开` 开关，没有中间预览态。本插件从指针焦点驱动同一个
`ctx.layout.toggleSidebar()` 动作，补上一个临时的中间状态。

## 行为

```
COLLAPSED ──鼠标悬停左边缘 150ms──▶ PEEK
PEEK      ──指针离开 200ms───────▶ COLLAPSED
PEEK      ──点击折叠按钮─────────▶ PINNED
PINNED    ──点击折叠按钮─────────▶ COLLAPSED   （官方原有行为）
```

- **PEEK** 是临时展开：指针停留在内部可以正常点选项目，移开后自动收起。
- **PINNED** 就是外壳自身的展开状态。插件不额外保存它的标志位，因此鼠标离开已固定的侧边栏
  **永远不会**把它收起。插件只会撤销由它自己发起的展开。
- 触发悬停的是窗口左边缘的一条热区（`EDGE_PX`）加上折叠按钮本身，指针不必精准落在那个
  28px 的小按钮上。
- 插件不自己绘制任何 tooltip。悬停展开期间它会收起外壳自己的气泡，否则该气泡会浮现在刚被
  展开的侧边栏上方。

## 为什么指针几何要实时测量

外壳没有「侧边栏是否展开」的稳定 API，插件只能从侧边栏自身的 DOM 读取：

- 类名是 CSS Module 哈希，因此按后缀匹配（`_root`、`_collapsed`、`_toggle`、`_frame`），
  而不是绑定某一次构建的哈希。
- Windows 上折叠态的按钮是 `position: fixed` 悬浮在标题栏里，而展开态是网格轨道（grid track），
  所以「是否在内」是两者的并集，且在每次事件与定时器触发时实时测量，不用缓存矩形。
- 窗口离开（`pointerleave`）时**不能**重新测量最后位置：最后一次 `pointermove` 仍停在侧边栏上，
  重测会得出「指针从未离开」的结论，导致永远不收起。这条路径改用自身的证据判定。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `index.js` | Bundle 的宿主（Host）半边；渲染由 Client 模块负责。 |
| `client.js` | 全部客户端逻辑：悬停状态机、tooltip 抑制、设置项。 |
| `cordis.patch.yml` | 把插件插入 DSH 加载器。 |
| `locale/*.json` | 插件的标题与描述。 |
| `icon.svg` | 侧边栏图稿。 |

## 设置

插件在「设置 → 左侧折叠栏」下注册一个开关，值保存在 `localStorage` 的
`dsh-compact-left:hoverPeek`。该值在使用时即时读取，因此切换后**无需刷新**，下一次悬停即生效。

## 开发

插件通过链接进入 DSH profile，而不是发布到 npm。在该 profile 的 `package.json` 里加一条
`link:` 依赖并重新安装即可：

```json
"dependencies": {
  "@local/dsh-compact-left": "link:<本仓库的路径>"
}
```

安装后，profile 会把它解析为指向本仓库的链接：

```
$HOME/.dsh/profiles/<profile>/node_modules/@local/dsh-compact-left
  -> <本仓库的路径>
```

Windows 上 `$HOME` 即 `%USERPROFILE%`。

`client.js` 通过 `window.__ModuleLoader__` 作为单个 bundle 加载，在运行中的 DSH 里从 graph
快照解析：**修改后需要重新加载窗口**才能看到变化。
