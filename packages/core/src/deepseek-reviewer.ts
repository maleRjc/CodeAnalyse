import type { CopyrightDocuments } from './types.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/**
 * 辅助函数：从 sourceCode 中提取前 8000 字符的干净代码片段，清除页眉、页码和换页符干扰
 */
function cleanCodeForReview(sourceCode: string): string {
  if (!sourceCode) return '';
  const lines = sourceCode.split('\n');
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim();
    // 过滤掉类似 [projectName vVersion] 第X页 共Y页 的页眉行
    if (trimmed.startsWith('[') && trimmed.includes('] 第') && trimmed.includes('页 共')) {
      return false;
    }
    // 过滤掉换页符
    if (trimmed === '\f') {
      return false;
    }
    return true;
  });
  return cleanLines.join('\n').slice(0, 8000);
}

export async function evaluateAndPolish(
  documents: CopyrightDocuments,
  apiKey?: string,
  fetchFn?: typeof fetch,
  maxIterations = 15,
  onProgress?: (msg: string) => void
): Promise<CopyrightDocuments> {
  const activeFetch = fetchFn || fetch;
  let currentDocs = { ...documents };
  
  if (apiKey && apiKey.trim() && maxIterations > 0) {
    const codeSnippet = cleanCodeForReview(currentDocs.sourceCode);
    const loops = Math.min(maxIterations, 15);

    for (let i = 0; i < loops; i++) {
      onProgress?.(`开始第 ${i + 1} 轮 AI 深度合规性审查与自我打磨...`);
      
      // 1. 评估阶段：调用 DeepSeek 评估文档是否符合软著要求
      const evalPrompt = `你是中国国家版权局软件著作权登记处的资深审查专家。
你需要对用户提交的【软件说明书】和【申请表格】文本材料进行严格的合规性审查。

【审查标准及要求】：
1. 检查是否存在敏感词汇或安全隐患（如：硬编码的密码、私钥、内部测试IP地址、“密码破解”、“未授权使用”、“限制破解”等）。
2. 检查【软件说明书】结构是否完整，必须包含以下章节大纲：
   - 项目立项引言（含开发背景、软件目标）
   - 软件主体功能概述（含主要功能描述、技术架构、开发环境）
   - 软件运行部署环境（含硬件环境、软件环境）
   - 软件用户操作流（含安装步骤、操作流程、界面介绍）
   - 关键技术与创新特性（含创新点、技术优势）
   - 总结
3. 检查说明书字数是否合适（建议主体字数在 500 到 1300 字之间，不可过于简略或过度赘述）。
4. 检查【申请表格】中的信息是否合理，是否存在缺失的关键字段或明显拼写错误。
5. 【输出格式要求】：
   - 如果审查完全通过，没有任何合规问题，请只返回 "COMPLIANT" 纯文本，不要带有任何其他多余字符或解释。
   - 如果发现不合规项，请逐条详细列出存在的问题和具体的修改意见，直接以文本列表形式输出。`;

      let evalResult = '';
      try {
        const response = await activeFetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: evalPrompt },
              {
                role: 'user',
                content: `当前说明书草稿：\n${currentDocs.manual}\n\n===分界线===\n当前表格信息草稿：\n${currentDocs.applicationForm}`,
              },
            ],
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          onProgress?.(`AI 审查评估请求失败: ${errText.slice(0, 100)}。保持当前版本。`);
          break;
        }

        const data = await response.json() as { choices?: { message?: { content?: string } }[] };
        evalResult = data.choices?.[0]?.message?.content?.trim() || '';

      } catch (err) {
        onProgress?.(`审查评估接口发生网络异常: ${err instanceof Error ? err.message : String(err)}。已跳过 AI 审查。`);
        break;
      }

      // 如果完全合规，直接退出循环
      if (evalResult === 'COMPLIANT' || evalResult.toUpperCase().includes('COMPLIANT')) {
        onProgress?.(`第 ${i + 1} 轮审查通过！材料已完全合规。`);
        break;
      }

      onProgress?.(`第 ${i + 1} 轮审查未通过，发现以下问题：\n${evalResult.slice(0, 300)}...`);
      onProgress?.(`正在根据审查反馈，调用 AI 自动修复并重新生成文档...`);

      // 2. 重新生成阶段：调用 DeepSeek 基于原始代码与审查反馈重新生成/修复文档
      const regenSystemPrompt = `你是资深的软件文档工程师与软著申请专家。
你需要参考用户的【源代码片段】、【当前文档草稿】以及审查专家反馈的【不合规问题与修改意见】，重新修改和完善软著申请材料。

【严格要求】：
1. 必须紧密结合源代码的真实技术逻辑，绝不可凭空捏造无关功能。
2. 必须逐一解决审查专家提到的所有不合规项。
3. 必须保持专业的程序员文档口吻，绝对禁止使用AI味浓重的高频修饰词（如：“旨在”、“总而言之”、“综上所述”、“通过该系统”、“为用户提供”等）。
4. 必须输出纯 JSON 对象，不能带有 markdown 格式标记或解释性话语。JSON 包含以下字段：
{
  "manual": "重新修改后的完整软件说明书（Markdown格式）",
  "applicationForm": "重新修改后的申请表格信息（Markdown格式）"
}`;

      try {
        const response = await activeFetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: regenSystemPrompt },
              {
                role: 'user',
                content: `【源代码片段】：\n${codeSnippet}\n\n【当前文档草稿 - 说明书】：\n${currentDocs.manual}\n\n【当前文档草稿 - 表格】：\n${currentDocs.applicationForm}\n\n【审查专家意见】：\n${evalResult}`,
              },
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          onProgress?.(`AI 重新生成失败: ${errText.slice(0, 100)}。保留上一版。`);
          break;
        }

        const data = await response.json() as { choices?: { message?: { content?: string } }[] };
        const rawContent = data.choices?.[0]?.message?.content?.trim() || '';

        // 解析返回的 JSON 格式
        let parsed: { manual?: string; applicationForm?: string } | null = null;
        const trimmed = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          const match = trimmed.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              parsed = JSON.parse(match[0]);
            } catch {}
          }
        }

        if (parsed && parsed.manual && parsed.applicationForm) {
          currentDocs.manual = parsed.manual.trim();
          currentDocs.applicationForm = parsed.applicationForm.trim();
          onProgress?.(`文档自动修复并更新成功，准备进入下一轮复审。`);
        } else {
          onProgress?.(`AI 修复格式解析异常，保留上一次的最佳版本。`);
          break;
        }

      } catch (err) {
        onProgress?.(`修复重构发生网络异常: ${err instanceof Error ? err.message : String(err)}。停止打磨。`);
        break;
      }
    }
  } else {
    onProgress?.(`未配置 API Key 或打磨次数为 0，跳过 AI 审查打磨阶段。`);
  }

  return currentDocs;
}

export async function evaluateAndPolishSourceCode(
  sourceCode: string,
  apiKey?: string,
  fetchFn?: typeof fetch,
  maxIterations = 15,
  onProgress?: (msg: string) => void
): Promise<string> {
  const activeFetch = fetchFn || fetch;
  let currentCode = sourceCode;

  if (!apiKey || !apiKey.trim() || maxIterations <= 0) {
    onProgress?.('未配置 API Key 或打磨次数为 0，跳过源代码 AI 审查打磨。');
    return currentCode;
  }

  const loops = Math.min(maxIterations, 15);
  for (let i = 0; i < loops; i++) {
    onProgress?.(`开始第 ${i + 1} 轮源代码合规性 AI 审查...`);

    // 1. 评估阶段
    const evalPrompt = `你是一个软件著作权申报审查专家。
你需要对用户提交的软件著作权登记【源程序清单材料】进行严格的合规性与可读性审查。

【审查标准及要求】：
1. 检查是否存在大段十六进制/二进制字节码或编译产物数组（例如：\nconst BYTE Pixel_PX_main[] = { 0x44, 0x58, ... } 或类似于大量以 0x 开头的字节数组数据）。这些绝对不符合“源程序”定义，极易导致审查被驳回。
2. 检查是否有残留的注释（行内/多行/文档注释）和多余的空行。
3. 检查代码是否逻辑连贯可读，有无明显的残缺截断。
4. 检查是否残留了明显的第三方开源软件/授权许可头（如 GPL/Apache 协议头）。
5. 检查是否由于截断产生了明显的语法逻辑死锁，例如：定义了非 void 函数却在末尾缺少 return 语句；或者类定义末尾有多余的双分号（如 \`} myexception;;\`）。

【输出格式要求】：
- 如果审查完全通过，没有任何合规问题，请只返回 "COMPLIANT" 纯文本，不要带有任何其他多余字符或解释。
- 如果发现不合规项，请逐条详细列出存在的问题和修改意见，直接以列表形式输出。`;

    let evalResult = '';
    try {
      // 避免单次发送数据过大，取前 8000 字符的典型代码片段进行评估
      const codeSnippet = cleanCodeForReview(currentCode);
      const response = await activeFetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: evalPrompt },
            { role: 'user', content: `以下为当前的源代码清单片段：\n\n${codeSnippet}` },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        onProgress?.(`AI 源码审查请求失败: ${errText.slice(0, 100)}。保持当前版本。`);
        break;
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      evalResult = data.choices?.[0]?.message?.content?.trim() || '';

    } catch (err) {
      onProgress?.(`源码审查接口发生网络异常: ${err instanceof Error ? err.message : String(err)}。已跳过打磨。`);
      break;
    }

    if (evalResult === 'COMPLIANT' || evalResult.toUpperCase().includes('COMPLIANT')) {
      onProgress?.(`第 ${i + 1} 轮源代码合规性审查通过！`);
      break;
    }

    onProgress?.(`第 ${i + 1} 轮源码审查未通过，发现以下问题：\n${evalResult.slice(0, 300)}...`);
    onProgress?.(`正在根据审查反馈，调用 AI 进行代码自愈修复...`);

    // 2. 修复打磨阶段
    const fixPrompt = `你是一个专业的软件重构专家和软著申报整理专家。
你需要根据【审查专家的反馈意见】，对给出的【源代码清单】中不符合软著合规要求或有语法逻辑死锁的局部代码片段进行定向替换修复。

【特别说明】：
在给出的源码中，部分超长二进制字节码数组（如 const BYTE Pixel_PX_main[] 等）已被本地清洗引擎替换为了包含注释的空定义（例如：const BYTE Pixel_PX_main[] = {}; // [Bytecode array Pixel_PX_main removed]）。
1. 若这些数组是用于创建 DirectX 顶点着色器/像素着色器（Vertex/Pixel Shader）的，请将其完整替换并还原为人类可读、合规的原始 HLSL 着色器源代码函数（例如实现渲染或图像数据格式转换的 VSMain/PSMain 顶点着色器和像素着色器逻辑），以确保代码包逻辑闭合、满足独创性。
2. 修复可能遗漏的 return 语句、多余双分号、以及其他合规建议提到的语法瑕疵。

请返回一个标准的 JSON 对象，格式如下（只输出纯 JSON，禁止包裹 \`\`\` 标记）：
{
  "replacements": [
    {
      "search": "待替换的原始代码片段（必须与原代码中的文本和换行符完全一致）",
      "replace": "替换后的修复代码片段"
    }
  ]
}

【严格限制】：只返回修改后的替换映射 JSON 对象，不可携带任何解释性文字或 markdown 格式块。确保 "search" 内容在原代码中唯一存在。`;

    try {
      const response = await activeFetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: fixPrompt },
            {
              role: 'user',
              content: `【审查意见】：\n${evalResult}\n\n【待修改源代码】：\n${currentCode.slice(0, 35000)}`
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        onProgress?.(`AI 源码修复请求失败: ${errText.slice(0, 100)}。`);
        break;
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const rawContent = data.choices?.[0]?.message?.content?.trim() || '';

      let parsed: { replacements?: { search: string; replace: string }[] } | null = null;
      try {
        const trimmed = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(trimmed);
      } catch {
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {}
        }
      }

      if (parsed && Array.isArray(parsed.replacements) && parsed.replacements.length > 0) {
        let replacementCount = 0;
        for (const item of parsed.replacements) {
          const searchStr = item.search;
          const replaceStr = item.replace;
          if (searchStr && currentCode.includes(searchStr)) {
            currentCode = currentCode.replaceAll(searchStr, replaceStr);
            replacementCount++;
          } else if (searchStr) {
            // Normalizing line endings for robust match
            const normalizedCode = currentCode.replace(/\r\n/g, '\n');
            const normalizedSearch = searchStr.replace(/\r\n/g, '\n');
            const normalizedReplace = replaceStr.replace(/\r\n/g, '\n');
            if (normalizedCode.includes(normalizedSearch)) {
              currentCode = normalizedCode.replaceAll(normalizedSearch, normalizedReplace);
              replacementCount++;
            }
          }
        }
        onProgress?.(`第 ${i + 1} 轮源代码自愈修复完成，共应用了 ${replacementCount} 处合规性修正。`);
      } else {
        onProgress?.(`AI 修复自愈未识别到需要修改的片段映射。`);
        break;
      }

    } catch (err) {
      onProgress?.(`源码自愈修复网络异常: ${err instanceof Error ? err.message : String(err)}。`);
      break;
    }
  }

  return currentCode;
}
