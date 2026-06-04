import type { CodeAnalysis, ExtractionResult } from './types.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `你是软件架构师与文档工程师。你需要基于用户提供的代码片段和结构，提取并重组出一份技术说明材料。
【严格要求】：
1. 必须基于代码真实逻辑，严禁凭空捏造。
2. 绝对不能使用AI常见词汇（如：旨在、总而言之、总的来说、综上所述、通过该系统、为用户提供等）。语言风格必须是平实的中国程序员开发文档口吻。
3. 返回 JSON 对象，不要 markdown 代码块。字段如下：
- background: string 开发背景与痛点分析（要求200字以上，结合具体代码领域）
- goals: string 软件目标与定位（要求100字以上）
- features: string 软件功能和技术特点说明（【核心重点】：必须非常详尽，不少于 600 字。不能用简单的列表，要分核心模块详细描述实现机制与业务流转。必须与提供的代码高度一致）
- architecture: string 技术架构与数据流转说明（要求300字以上）
- innovation: string 创新点或技术难点攻关（要求200字以上）`;

export async function analyzeWithDeepSeek(
  extraction: ExtractionResult,
  apiKey: string,
  fetchFn?: typeof fetch,
): Promise<CodeAnalysis> {
  const snippet = extraction.extractedCode.slice(0, 5000);
  const activeFetch = fetchFn || fetch;

  const response = await activeFetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `软件代码总行数：${extraction.totalLines}\n参与文件数：${extraction.selectedFiles.length}\n代码片段：\n${snippet}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API 错误 (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return {};
  }

  return parseAnalysisJson(raw);
}

function parseAnalysisJson(raw: string): CodeAnalysis {
  const trimmed = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(trimmed) as CodeAnalysis;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as CodeAnalysis;
      } catch {
        return {};
      }
    }
    return {};
  }
}
