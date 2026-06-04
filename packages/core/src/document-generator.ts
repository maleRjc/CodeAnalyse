import type { CodeAnalysis, CopyrightDocuments, ExtractionResult } from './types.js';

export class DocumentGenerator {
  private projectName: string;
  private version: string;

  constructor(projectName = '未命名软件', version = '1.0') {
    this.projectName = projectName;
    this.version = version;
  }

  generateSourceCode(extraction: ExtractionResult): string {
    let result = '';

    for (let i = 0; i < extraction.pages.length; i++) {
      const pageNum = i + 1;
      const totalPages = extraction.pages.length;

      result += `[${this.projectName} v${this.version}] 第${pageNum}页 共${totalPages}页\n`;
      result += '\n';
      result += extraction.pages[i];

      if (pageNum < totalPages) {
        result += '\n\f';
      }
    }

    return result;
  }

  generateManual(extraction: ExtractionResult, analysis: CodeAnalysis): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    const innovationText = analysis.innovation || '1. 采用高内聚、低耦合的分层架构设计，极大提高了系统模块的可维护性与后续扩展性\n2. 具备完善的异常捕获与管道数据容错机制，确保核心业务在极端输入下的稳定运行';

    const langs = this.detectLanguages(extraction).toLowerCase();
    let defaultArch = '采用单体分层架构体系。';
    let defaultRuntime = '操作系统兼容环境';
    if (langs.includes('ts') || langs.includes('js') || langs.includes('vue')) {
      defaultArch = '采用现代的前后端分离/组件化模块架构。';
      defaultRuntime = 'Node.js v18+ 运行时环境';
    } else if (langs.includes('py')) {
      defaultArch = '采用模块化MVC或服务驱动架构。';
      defaultRuntime = 'Python 3.8+ 解释器环境';
    } else if (langs.includes('c') || langs.includes('cpp') || langs.includes('h')) {
      defaultArch = '采用原生模块化底层系统设计，具备良好的内存使用效率与跨平台移植能力。';
      defaultRuntime = 'C/C++ 原生编译运行环境';
    } else if (langs.includes('java')) {
      defaultArch = '采用基于多层架构体系的分层应用模式。';
      defaultRuntime = 'JRE 1.8+ 虚拟运行环境';
    }

    return `# 软件说明书

## 一、项目立项引言

### 1.1 开发背景
${analysis.background || '本系统致力于提供结构化数据处理及核心业务流控方案，以模块化的数据提取与加工逻辑，降低配置维护开销并实现全流程一体化管理。'}

### 1.2 软件目标
${analysis.goals || '提供稳定、完整的工业级功能逻辑管理方案，协助开展参数校验及流控状态分析工作。'}

## 二、软件主体功能概述

### 2.1 主要功能
${analysis.features || this.generateFeaturesFromCode(extraction)}

### 2.2 技术架构
${analysis.architecture || defaultArch}

### 2.3 开发环境
- 开发语言：${this.detectLanguages(extraction)}
- 框架版本：系统底层原生框架开发包
- 数据库：本地轻量级数据库 / 本地文件安全持久化

## 三、软件运行部署环境

### 3.1 硬件环境
- 处理器：双核 2.0GHz 或更高主频处理器
- 内存：8GB 或以上系统内存
- 硬盘空间：10GB 以上空闲存储空间

### 3.2 软件环境
- 操作系统：Windows 10/11, macOS, Linux 现代主流操作系统
- 运行时：${defaultRuntime}
- 依赖组件：系统基础开发环境与语言标准库

## 四、软件用户操作流

### 4.1 安装步骤
1. 解压软件发布包至目标部署目录；
2. 检查安装环境中所需的系统运行时依赖包是否已正确就绪。

### 4.2 操作流程
${this.generateOperationGuide()}

### 4.3 界面介绍
本软件的界面设计整洁大方。顶部主要包含系统主菜单与工作空间信息，左侧包含配置控制栏与状态处理，右侧为核心的文本预览、格式输出与任务状态展示区域。用户点击对应功能按钮即可触发数据处理与生成。

## 五、关键技术与创新特性

### 5.1 创新点
${innovationText}

### 5.2 技术优势
1. 模块边界清晰，代码可重用度高，极其便于进行二次开发和维护。
2. 核心分析模块使用无状态设计，对本地磁盘资源与 CPU 的开销极低，响应迅速。

## 六、总结

本软件已完成核心业务的逻辑验证与应用上线，经测试系统在各种输入场景下均能稳定响应，完全达到系统设计预期的各项技术指标。

---
软件名称：${this.projectName}
版本：${this.version}
完成日期：${dateStr}
`;
  }

  private generateFeaturesFromCode(extraction: ExtractionResult): string {
    const features: string[] = [];
    const keywords = ['main', 'index', 'app', 'service', 'controller', 'handler', 'plugin'];

    for (const file of extraction.selectedFiles) {
      const fileName = file.path.toLowerCase();
      for (const keyword of keywords) {
        if (fileName.includes(keyword)) {
          features.push(`- ${file.path}: 参与实现核心功能模块及配置逻辑的封装`);
          break;
        }
      }
      if (features.length >= 6) {
        break; // 限制展示项数，防止列表过长
      }
    }

    if (features.length === 0) {
      features.push('- 核心逻辑控制模块：提供系统的核心操作流派发与处理能力');
      features.push('- 基础公共工具模块：实现本地资源的高效读取与分析清洗');
    }

    return features.join('\n');
  }

  private detectLanguages(extraction: ExtractionResult): string {
    const extensions = new Set<string>();
    for (const file of extraction.selectedFiles) {
      const ext = file.path.split('.').pop();
      if (ext) extensions.add(ext);
    }
    return Array.from(extensions).join(', ') || '未知';
  }

  private generateOperationGuide(): string {
    return `1. 启动本软件运行程序进入工作主界面
2. 选定对应的项目工作文件夹以供分析
3. 填写所需的自定义配置及相关控制参数
4. 点击执行功能按钮，稍等数秒即可在相应目录生成并预览所需产物`;
  }

  generateApplicationForm(extraction: ExtractionResult, analysis: CodeAnalysis = {}): string {
    const now = new Date();
    
    // 智能推理开发语言
    const detectLangs = this.detectLanguages(extraction);
    
    // 智能推理运行环境
    const lowerLangs = detectLangs.toLowerCase();
    const softwareEnvs: string[] = [];
    if (lowerLangs.includes('java')) softwareEnvs.push('Android 8.0 及以上');
    if (lowerLangs.includes('js') || lowerLangs.includes('ts') || lowerLangs.includes('tsx') || lowerLangs.includes('jsx')) {
      softwareEnvs.push('Chrome/Edge主流浏览器', 'Node.js 18+');
    }
    if (lowerLangs.includes('py')) softwareEnvs.push('Python 3.9+');
    if (lowerLangs.includes('c') || lowerLangs.includes('cpp') || lowerLangs.includes('h') || lowerLangs.includes('hpp')) {
      softwareEnvs.push('Windows 10/11', '主流 Linux 发行版（如 Ubuntu 20.04+）');
    }
    if (softwareEnvs.length === 0) {
      softwareEnvs.push('Windows 10/11');
    }
    const softwareEnvText = softwareEnvs.join('，或 ');

    // 智能提取功能与特点（如果配置了 AI，直接展示 AI 分析出的主要功能）
    let featuresText = '';
    if (analysis.features) {
      featuresText = analysis.features;
    } else {
      featuresText = `- 功能 1：实现基于 ${detectLangs} 技术栈的核心业务数据处理与逻辑分析。\n- 功能 2：提供模块化的本地/远程系统接口服务，支持数据的高效读取与本地落盘。\n- 功能 3：提供便捷的系统配置与控制台命令/界面交互入口。`;
    }

    return `# 软件著作权申请表格信息（草稿填写参考）

> **⚠️ 2026年版权中心新规重要提示**
> 1. **不可直接作为最终申请表**：旧版申请表已废止。本页提取的信息仅供参考，请**务必**前往中国版权保护中心官网在线填报新版申请表。
> 2. **填表要求**：经办人必须是具体负责人，必须亲笔抄写诚信说明并签名，严禁打印代签。
> 3. **功能说明**：官网填报时，软件功能与技术特点字数要求为 500-1300 字。本软件提供的说明书已扩展了字数，请自行在此基础上进行人工润色，消除AI痕迹后再行填报。
> 4. **证书形式**：2026 年起默认发放电子证书（PDF）。如需纸质证书请在官网填报时主动勾选。

## 基本信息
- 软件全称：${this.projectName}
- 软件简称：${this.projectName.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '') || this.projectName}
- 版本号：${this.version}
- 分类号：30200-0000（计算机软件）
- 开发完成日期：${now.toISOString().split('T')[0]}
- 发表状态：[未发表]（⚠️若已发表，请修改为实际日期与发表城市）
- 首次发表日期：无（若已发表请填实际日期，如 YYYY-MM-DD）
- 首次发表城市：无（若已发表请填实际发表国家和城市，例如：中国 北京）
- 开发方式：独立开发
- 权利产生方式：原始取得
- 权利范围：全部权利

## 技术信息
- 软件代码行数：${extraction.totalLines} 行
- 开发语言：${detectLangs}
- 软件运行环境：
  - 硬件环境：双核 CPU 1.5GHz 及以上；内存：2GB 及以上；可用硬盘空间：100MB 及以上。
  - 软件环境：${softwareEnvText}。
- 编程语言：${detectLangs.split(', ').slice(0, 2).join(', ')}

## 功能与特点
${featuresText}

## 著作权人信息
- 名称：[请填写您的公司全称或个人姓名]
- 地址：[请填写执照注册地址或个人常用居住地]
- 联系人：[请填写经办人姓名]
- 电话：[请填写联系人手机号]
- 邮箱：[请填写联系邮箱]

---
说明：生成内容由 AI 智能匹配完成。请根据您软件的实际发布状态与执照信息修改上述 [ ] 中的必填内容。
`;
  }

  async generateAll(
    extraction: ExtractionResult,
    analysis: CodeAnalysis = {},
  ): Promise<CopyrightDocuments> {
    return {
      sourceCode: this.generateSourceCode(extraction),
      manual: this.generateManual(extraction, analysis),
      applicationForm: this.generateApplicationForm(extraction, analysis),
    };
  }
}
