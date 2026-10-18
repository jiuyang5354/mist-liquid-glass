# MIST 3.5 · Image Atelier & Glass Refinement

## v3.6.5 / 收藏卡片悬停同步
- 修复悬停期间只更新文字位置、玻璃停留在上一次位置，导致进入与离开时视觉运动相反的问题。
- 几何位置更新时同步请求 GPU 重绘；悬停过渡完成后恢复按需绘制。

## v3.6.4 / 编辑按钮图标居中
- 将省略号文字替换为三个 SVG 圆点，图标按几何中心对齐圆形按钮，消除字体基线带来的偏移。

## v3.6.3 / 收藏卡片按钮圆角协调
- 编辑按钮改为 28px 圆形，距卡片顶部、右侧各 12px，底色与描边减淡。
- 标题右侧预留 36px，与圆形按钮保持间距。

## v3.6.2 / 收藏卡片布局修正
- 修复通用玻璃图层样式覆盖编辑按钮定位，导致「…」按钮掉到卡片左下角并撑高卡片。
- 编辑按钮恢复右上角定位；标题为按钮预留空间，长名称按原有省略规则显示。

## v3.6.1 / 液态玻璃性能优化
- 用共享 WebGL2 画布替换逐块 SVG 位移滤镜和背景副本，保留 v3.6.0 已校准的折射与高光公式。
- 两个后台 Worker 分别处理背景栅格、光学贴图和 GPU 初始化、纹理上传、绘制，减少页面主线程阻塞。
- 9×9 柔化拆成横向与纵向两次 GPU 绘制；静止时按需重绘，漂移绘制上限 60 次/秒，后台暂停。
- 强度滑块合并贴图请求并缓存；移除鼠标移动时对全部玻璃的位置读取与样式写入。
- 保留全部影像预设、自定义壁纸、实时材质预览和原有本地存储键。

## v3.6.0 / 参考材质校准
- 搜索框与快捷按钮改为按 Outpace 校准的 n=1.5 曲面位移、平滑圆角与方向性 SVG 高光。
- 收藏卡片按 Bubbbly 的六次幂透镜、0.22 内部放大和 9×9 纹理取样移植到 SVG。
- 柔化在背景取样前进行，避免在弯曲边缘改变参考的模糊半径。
- 移除均匀的多层亮边和鼠标光斑；保留文字、搜索、收藏、本地设置与影像预设。
- 设置材质圆片接入实时光学；同步漂移、尺寸变化和卡片悬停时的背景坐标。
- 本地基准、材质移植和桌面/小屏行为分别核对；SVG 移植保留 8 位贴图量化与浏览器合成误差。

## v3.5.2 / 液态玻璃增强
- 增强默认强度下的水滴折射、透明高光与边缘厚度，让材质变化可见。
- 漂移时保留折射层，使用共享背景变换同步摄影层。
- 折射输入限制在玻璃局部范围，减少全视口副本参与滤镜的面积。
- 保留本地设置，并将界面版本标识更新为 V3.5.2。

- 8 editable image presets with preserved settings.
- Contrast, saturation, color temperature, haze, vignette, and independent overlay textures.
- Image filters are applied to both the wallpaper and the optical clone to avoid mismatched lens sampling.
- Reduced refraction displacement, neutralized green tint, and use lightweight frosted panel in place of a large SVG map.
- Old settings remain in `mist-tab-state-v1` storage key.


## v3.5.1 / 缓慢漂移修复
- 修复启用缓慢漂移后 Chromium 中标题、搜索栏或收藏卡片渲染不完整。
- 所有图片层的运动整合为一个容器动画，避免每张玻璃卡片的背景副本同时动画。
- 运动时自动切换为轻量原生模糊玻璃，停止运动恢复原折射质感。
- 兼容系统“减少动态效果”偏好，保留所有影像预设和设置存储键。
