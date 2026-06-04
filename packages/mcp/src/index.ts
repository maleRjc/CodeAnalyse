import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runGeneratePipeline, CodeExtractor, writeDocument } from "@ruanzhu/core";
import fs from "node:fs/promises";
import path from "node:path";

const server = new Server(
  {
    name: "ruanzhu-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ruanzhu_extract_code",
        description: "扫描指定项目目录，抽取符合软件著作权规范的源代码文本（前1500行 + 后1500行，清洗空行注释，分段页码格式）",
        inputSchema: {
          type: "object",
          properties: {
            workspaceRoot: {
              type: "string",
              description: "项目文件夹的绝对路径 (例如 D:\\AutoCode\\my-project)",
            },
            apiKey: {
              type: "string",
              description: "DeepSeek API Key。如果不传，将尝试从环境变量 DEEPSEEK_API_KEY 读取",
            },
          },
          required: ["workspaceRoot"],
        },
      },
      {
        name: "ruanzhu_generate_documents",
        description: "运行全流程生成逻辑：扫描项目，通过 AI (DeepSeek) 分析架构并生成说明书和申请表格，执行合规打磨，输出文件到目标目录",
        inputSchema: {
          type: "object",
          properties: {
            workspaceRoot: {
              type: "string",
              description: "项目文件夹的绝对路径 (例如 D:\\AutoCode\\my-project)",
            },
            projectName: {
              type: "string",
              description: "软件全称。如果不传，将尝试读取项目 package.json 中的 name 字段，或以目录名命名",
            },
            version: {
              type: "string",
              description: "软件版本号 (例如 1.0.0)。如果不传，将尝试读取 package.json",
            },
            apiKey: {
              type: "string",
              description: "DeepSeek API Key。如果不传，将尝试从环境变量 DEEPSEEK_API_KEY 读取；如果都未配置，将生成空分析及基础模版",
            },
            mode: {
              type: "string",
              enum: ["local", "ai-full"],
              description: "生成模式。local (本地静态扫描 + 模版，如果传入 API Key 则包含 AI 生成段落)；ai-full (全流程 AI 架构及代码块提取生成，建议使用)",
            },
            polishLoops: {
              type: "number",
              description: "AI 深度合规审查与自我打磨循环次数 (默认 3 次)",
            },
            outDir: {
              type: "string",
              description: "生成文件输出目录的绝对路径。默认在项目根目录下创建 ruanzhu-output 文件夹",
            },
            licenseKey: {
              type: "string",
              description: "软著助手激活码。默认使用演示激活码 RUANZHU-DEMO-PRO 以开启无水印和 Word 导出功能",
            },
          },
          required: ["workspaceRoot"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "ruanzhu_extract_code") {
      const workspaceRoot = String(args?.workspaceRoot);
      if (!workspaceRoot) {
        throw new Error("Missing required argument: workspaceRoot");
      }

      console.error(`[ruanzhu-mcp] Calling ruanzhu_extract_code for workspaceRoot: ${workspaceRoot}`);

      // 验证目录是否存在
      try {
        const stats = await fs.stat(workspaceRoot);
        if (!stats.isDirectory()) {
          throw new Error("workspaceRoot must be a directory");
        }
      } catch (err) {
        console.error(`[ruanzhu-mcp] Directory error: "${workspaceRoot}" is invalid or inaccessible.`);
        return {
          content: [
            {
              type: "text",
              text: `Error: The directory "${workspaceRoot}" does not exist or is inaccessible.`,
            },
          ],
          isError: true,
        };
      }

      const apiKey = String(args?.apiKey || process.env.DEEPSEEK_API_KEY || "").trim();
      const extractor = new CodeExtractor(workspaceRoot);
      const extraction = await extractor.extractForCopyright(apiKey || undefined);
      console.error(`[ruanzhu-mcp] Successfully extracted code: ${extraction.totalLines} total lines, ${extraction.selectedFiles.length} files.`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              totalLines: extraction.totalLines,
              selectedFilesCount: extraction.selectedFiles.length,
              selectedFiles: extraction.selectedFiles,
              extractedCodePreview: extraction.extractedCode.slice(0, 1000) + "\n... (truncated for preview) ...",
              totalPages: extraction.pages.length,
            }, null, 2),
          },
        ],
      };
    }

    if (name === "ruanzhu_generate_documents") {
      const workspaceRoot = String(args?.workspaceRoot);
      if (!workspaceRoot) {
        throw new Error("Missing required argument: workspaceRoot");
      }

      console.error(`[ruanzhu-mcp] Calling ruanzhu_generate_documents for workspaceRoot: ${workspaceRoot}`);

      // 验证目录是否存在
      try {
        const stats = await fs.stat(workspaceRoot);
        if (!stats.isDirectory()) {
          throw new Error("workspaceRoot must be a directory");
        }
      } catch (err) {
        console.error(`[ruanzhu-mcp] Directory error: "${workspaceRoot}" is invalid or inaccessible.`);
        return {
          content: [
            {
              type: "text",
              text: `Error: The directory "${workspaceRoot}" does not exist or is inaccessible.`,
            },
          ],
          isError: true,
        };
      }

      // 获取 package.json 默认元数据
      let defaultName = path.basename(workspaceRoot);
      let defaultVersion = "1.0.0";
      try {
        const pkgRaw = await fs.readFile(path.join(workspaceRoot, "package.json"), "utf-8");
        const pkg = JSON.parse(pkgRaw);
        if (pkg.name) defaultName = pkg.name;
        if (pkg.version) defaultVersion = pkg.version;
      } catch {}

      const projectName = String(args?.projectName || defaultName);
      const version = String(args?.version || defaultVersion);
      const mode = (args?.mode as any) || "local";
      const polishLoops = typeof args?.polishLoops === "number" ? args.polishLoops : 3;
      const licenseKey = String(args?.licenseKey || "RUANZHU-DEMO-PRO");
      const outDir = String(args?.outDir || path.join(workspaceRoot, "ruanzhu-output"));

      // API Key 解析顺序: 传入参数 -> 环境变量
      const apiKey = String(args?.apiKey || process.env.DEEPSEEK_API_KEY || "").trim();

      console.error(`[ruanzhu-mcp] Options resolved: projectName="${projectName}", version="${version}", mode="${mode}", polishLoops=${polishLoops}, outDir="${outDir}", hasApiKey=${!!apiKey}`);

      const progressLogs: string[] = [];
      const onProgress = (stage: string, message: string) => {
        const logMsg = `[Progress] [${stage}] ${message}`;
        progressLogs.push(logMsg);
        console.error(`[ruanzhu-mcp] ${logMsg}`);
      };

      const result = await runGeneratePipeline({
        workspaceRoot,
        projectName,
        version,
        apiKey: apiKey || undefined,
        mode,
        polishLoops,
        onProgress,
      });

      // 确保输出目录存在
      await fs.mkdir(outDir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);

      // 验证许可证以确定是否加水印以及是否能顺利导出 docx
      const { validateLicenseKey } = await import("@ruanzhu/core");
      const isLicensed = validateLicenseKey(licenseKey);

      const sourceCodePath = path.join(outDir, `源代码清单_${stamp}.md`);
      const sourceCodeTxtPath = path.join(outDir, `源代码清单_${stamp}.txt`);
      const manualMdPath = path.join(outDir, `软件说明书_${stamp}.md`);
      const applicationFormPath = path.join(outDir, `申请表格_${stamp}.md`);
      const manualDocxPath = path.join(outDir, `软件说明书_${stamp}.docx`);

      console.error(`[ruanzhu-mcp] Writing files to output directory...`);
      await writeDocument(result.documents.sourceCode, sourceCodeTxtPath, "txt", { licensed: isLicensed });
      await writeDocument(result.documents.sourceCode, sourceCodePath, "md", { licensed: isLicensed });
      await writeDocument(result.documents.manual, manualMdPath, "md", { licensed: isLicensed });
      await writeDocument(result.documents.applicationForm, applicationFormPath, "md", { licensed: isLicensed });
      await writeDocument(result.documents.manual, manualDocxPath, "docx", { licensed: isLicensed });
      console.error(`[ruanzhu-mcp] Successfully wrote documents to ${outDir}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              projectName,
              version,
              isLicensed,
              outputDirectory: outDir,
              writtenFiles: [
                sourceCodeTxtPath,
                sourceCodePath,
                manualMdPath,
                applicationFormPath,
                manualDocxPath,
              ],
              progressLogs,
              documentsSummary: {
                sourceCodeLines: result.extraction.totalLines,
                manualLength: result.documents.manual.length,
                applicationFormLength: result.documents.applicationForm.length,
              },
            }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    console.error(`[ruanzhu-mcp] Error executing tool:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RuanZhu MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error in MCP Server:", error);
  process.exit(1);
});
