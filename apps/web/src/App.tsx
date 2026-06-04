import { useState } from 'react';
import './App.css';

const SAMPLE_SOURCE_CODE = `/**
 * FreeRDP: A Remote Desktop Protocol Implementation
 * Advanced Input Virtual Channel Extension
 *
 * Copyright 2022 Armin Novak <anovak@thincast.com>
 * Copyright 2022 Thincast Technologies GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

#include <freerdp/config.h>
#include <stdio.h>
#include <stdlib.h>
#include <winpr/crt.h>
#include <winpr/synch.h>
#include <winpr/thread.h>
#include <winpr/stream.h>

#include <freerdp/log.h>
#include <freerdp/channels/log.h>
#include <freerdp/client/channels.h>

#define TAG CHANNELS_TAG("advanced-input")

typedef struct
{
	ChannelClientContext common;
	void* msgs;
	BOOL initialized;
} AdvancedInputClientContext;

/* 每页正好 50 行，配备中国版权局要求的页眉与页码 */
/* [FreeRDP v1.0.0]                      第1页 共60页 */
`;

const SAMPLE_MANUAL = `# 软著文档助手 — 软件说明书

## 1. 软件概述
软著文档助手是一款专为软件开发者及企业设计的一键软著申报文档排版利器。软件采用纯本地运行架构，用户无需上传任何代码或个人隐私文件至云端，即可在几秒内生成专业、合规的软件著作权申请文档。

## 2. 软件运行环境与配置
* **操作系统**：Windows 10 / 11 64位系统
* **处理器**：Intel Core i3 或以上，或 M1/M2 等兼容环境
* **物理内存**：最低 4 GB RAM

## 3. 核心功能与操作流程
1. **载入项目**：拖入或选择包含源码的项目根目录。
2. **AI 架构解析**：可选接入本地 API 密钥，调用先进模型自动编写系统技术指标。
3. **物理分页生成**：一键整理提取前 30 页及后 30 页代码（符合每页 50 行，含标准页眉）。
4. **原生 Word 导出**：支持一键导出 Word .docx 格式，自带物理换页与完美双列表格。
`;

const SAMPLE_FORM = `| 申报表单字段 | 提取数值与特征值 (由本地扫描与 AI 分析自动归纳) |
| :--- | :--- |
| **软件名称 (全称)** | 软著文档助手系统 |
| **软件名称 (简称)** | 软著文档助手 |
| **版本号** | V1.0.0 |
| **开发完成日期** | 2026年06月02日 |
| **发表状态** | 未发表 |
| **权利获取方式** | 原始取得 |
| **权利范围** | 全部权利 |
| **技术特点** | 纯本地提取分析，精确 50 行物理分页，自动表格规约 |
| **编程语言分布** | TypeScript (65%), Node.js (25%), React (10%) |
| **源程序量评估** | 2,150 行 (有效提取) |
`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'source' | 'manual' | 'form'>('source');

  const getPreviewText = () => {
    switch (activeTab) {
      case 'source':
        return SAMPLE_SOURCE_CODE;
      case 'manual':
        return SAMPLE_MANUAL;
      case 'form':
        return SAMPLE_FORM;
    }
  };

  const handleDownload = () => {
    // 触发桌面端便携包的下载。由于在 Electron Vite 工程中包将生成在指定 release 目录，
    // 在真实官网环境下，此路径应指向打包发布的静态文件 URL。
    window.location.href = './RuanZhu-1.0.0-x64-portable.exe';
  };

  return (
    <div className="landing-container">
      {/* 头部导航 */}
      <header className="navbar">
        <div className="nav-brand">软著文档助手</div>
        <div className="nav-links">
          <a href="#features">核心功能</a>
          <a href="#preview">效果演示</a>
          <a href="#pricing">按次收费</a>
          <button className="nav-btn" onClick={handleDownload}>免费下载</button>
        </div>
      </header>

      {/* Hero 章节 */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">🛡️ 100% 保护源码隐私 · 纯本地极速排版</div>
          <h1 className="hero-title">
            软件著作权申请文档<br />
            <span className="gradient-text">一键生成，十秒搞定</span>
          </h1>
          <p className="hero-subtitle">
            纯本地执行，绝不上传源码！智能过滤注释与垃圾代码，精准 50 行物理分页，自动合成原生 Word 页眉、页脚及申报表格，让软著申请省时又专业。
          </p>
          <div className="hero-actions">
            <button className="download-btn-premium" onClick={handleDownload}>
              下载 Windows 便携版 <span>(RuanZhu.exe)</span>
            </button>
            <a href="#preview" className="learn-more-btn">
              查看文档效果演示
            </a>
          </div>
          <div className="hero-footer-meta">
            <span>🚀 无需安装 · 双击即用</span>
            <span>⚡️ 支持 JS/TS/Py/Java/Go/C++ 等</span>
            <span>💎 9.9 元/项目 · 多次修改免费</span>
          </div>
        </div>
      </section>

      {/* 核心卖点卡片 */}
      <section id="features" className="features-section">
        <div className="section-header">
          <h2>全方位满足版权局申报标准</h2>
          <p>针对传统排版慢、页码对不上、Word 转换出错等痛点，我们开发了专业的本地化排版工具。</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="card-icon">🔒</div>
            <h3>源码绝对隐私安全</h3>
            <p>基于本地 Electron 客户端，所有项目扫描、AI 分析和文档排版均在您的电脑上离线完成，无任何安全漏洞。</p>
          </div>

          <div className="feature-card">
            <div className="card-icon">📏</div>
            <h3>50行物理精确分页</h3>
            <p>首创物理分页技术，自动去除冗长注释及空行，使代码清单在包含标准页眉后，每页物理恰好 50 行，毫无错行烦恼。</p>
          </div>

          <div className="feature-card">
            <div className="card-icon">📄</div>
            <h3>原生 Word 表格排版</h3>
            <p>说明书自动映射为 Word 结构化章节；申请表格自动归纳提炼并导出为精美的 Word 原生数据表，无需手动调整格式。</p>
          </div>

          <div className="feature-card">
            <div className="card-icon">🧠</div>
            <h3>AI 智能项目提炼</h3>
            <p>可接入主流 AI 大模型。自动根据扫描的代码文件和架构逻辑，智能化生成完整的技术规格与说明书大纲，减少手动编写工作。</p>
          </div>

          <div className="feature-card">
            <div className="card-icon">✍️</div>
            <h3>双向可编辑预览</h3>
            <p>生成完成后在客户端提供双向绑定的编辑框。导出前允许用户对源代码、说明书及表格进行二次微调，所见即所得。</p>
          </div>

          <div className="feature-card">
            <div className="card-icon">📂</div>
            <h3>同项目免重复收费</h3>
            <p>采用精密的本地项目指纹加密技术（防拷贝）。一次激活，多次打开和编辑同一项目不再收取任何费用，经济实惠。</p>
          </div>
        </div>
      </section>

      {/* 高保真文档生成预览演示 */}
      <section id="preview" className="preview-section">
        <div className="section-header">
          <h2>高保真输出文档效果预览</h2>
          <p>以下为软著助手在桌面客户端直接渲染的真实文档样式，支持用户直接二次编辑并导出。</p>
        </div>

        <div className="preview-container">
          <div className="preview-toolbar">
            <div className="preview-tabs">
              <button
                className={activeTab === 'source' ? 'active' : ''}
                onClick={() => setActiveTab('source')}
              >
                💾 源代码清单 (60页)
              </button>
              <button
                className={activeTab === 'manual' ? 'active' : ''}
                onClick={() => setActiveTab('manual')}
              >
                📘 软件说明书 (Word/MD)
              </button>
              <button
                className={activeTab === 'form' ? 'active' : ''}
                onClick={() => setActiveTab('form')}
              >
                📋 智能申请表格 (参数表)
              </button>
            </div>
            <div className="preview-actions-mock">
              <span>所见即所得编辑器</span>
            </div>
          </div>

          <div className="preview-body">
            {activeTab === 'source' && (
              <div className="word-header-mock">
                <span>FreeRDP 软件源代码清单 [v1.0.0]</span>
                <span>第 1 页 共 60 页</span>
              </div>
            )}
            <textarea
              className="preview-editor-mock"
              value={getPreviewText()}
              readOnly
            />
            {activeTab === 'source' && (
              <div className="word-divider-mock"></div>
            )}
          </div>
        </div>
      </section>

      {/* 定价方案 */}
      <section id="pricing" className="pricing-section">
        <div className="section-header">
          <h2>清晰、合理的收费模式</h2>
          <p>无需订阅，不收包月服务费。每次生成与调整完全透明，真正实现按项目付费。</p>
        </div>

        <div className="pricing-grid">
          <div className="pricing-card free-tier">
            <h3>免费预览版</h3>
            <div className="price">¥ 0 <span>/ 永久</span></div>
            <p className="price-desc">适合初次体验及格式核对的用户</p>
            <ul>
              <li>✅ 纯本地无限制扫描项目文件</li>
              <li>✅ 支持 AI 智能提炼系统特征</li>
              <li>✅ 实时双向可编辑预览界面</li>
              <li>❌ 导出 Word 文档暂不支持 (🔒)</li>
              <li>❌ 预览文本底部带有水印提示</li>
            </ul>
            <button className="pricing-btn-secondary" onClick={handleDownload}>免费下载体验</button>
          </div>

          <div className="pricing-card premium-tier">
            <div className="premium-badge">🔥 最受欢迎</div>
            <h3>项目激活码</h3>
            <div className="price">¥ 9.9 <span>/ 单个项目</span></div>
            <p className="price-desc">商业级、高效率，合规保障</p>
            <ul>
              <li>✅ 免费版所有的基础功能</li>
              <li>✅ <b>去除所有预览/打印水印</b></li>
              <li>✅ <b>一键导出原汁原味原生 Word (.docx)</b></li>
              <li>✅ <b>原生 Word 页眉、页脚及物理分页符</b></li>
              <li>✅ <b>本地项目凭证防挪动 (随工程目录拷贝不失效)</b></li>
              <li>✅ <b>同一个项目多次打开、反复修改仅收一次费</b></li>
            </ul>
            <button className="pricing-btn-primary" onClick={handleDownload}>立即下载激活</button>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="footer">
        <p>© 2026 软著文档助手. 版权所有。</p>
        <p className="footer-tips">安全声明：本软件完全在 Windows 本地沙箱离线运行，源码绝不上传任何服务器，请放心使用。</p>
      </footer>
    </div>
  );
}
