# 软著申请助手（RuanZhu）

独立桌面应用：扫描本地项目代码，生成软件著作权申请常用的源代码清单、软件说明书与申请表格信息。

## 环境要求

- Node.js >= 18.18

## 开发

```bash
npm install
npm run dev
```

## 打包（Windows 便携版）

```bash
npm run dist
```

产物：`apps/desktop/release/RuanZhu-1.0.0-x64-portable.exe`

## 使用说明

1. 启动应用，点击「选择项目文件夹」
2. 可选：填写 AI API Key（用于 AI 填充说明书；留空则生成模板）
3. 填写软件名称、版本号
4. 点击「一键生成软著文档」
5. 在右侧预览并导出 Markdown / TXT / Word

**版本说明**

| 版本 | 能力 |
|------|------|
| 免费版 | 预览（带水印）、导出 Markdown/TXT |
| 完整版 | 无水印、导出 Word、批量处理 |

演示激活码：`RUANZHU-DEMO-PRO`

## 测试

```bash
npm test
```

生成内容仅供参考，提交登记前请人工核对。

详见 [doc/实现方案.md](doc/实现方案.md)。
