import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  Header,
  Footer,
  AlignmentType,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  BorderStyle,
} from 'docx';
import { applyWatermark } from './license.js';

export type SaveFormat = 'md' | 'txt' | 'docx' | 'pdf';

export async function writeDocument(
  content: string,
  filePath: string,
  format: SaveFormat,
  options?: { licensed?: boolean; workspaceRoot?: string },
): Promise<void> {
  const licensed = options?.licensed ?? false;
  const isSourceCode = content.includes(' 共') && content.includes('页\n');
  
  // 如果是源码，不再将水印强行塞入正文（会破坏 60 页计算），而是交由 Word 页眉处理
  const body = licensed ? content : (isSourceCode ? content : applyWatermark(content, false));

  if (format === 'docx') {
    await writeDocx(body, filePath, licensed, options?.workspaceRoot);
    return;
  }
  await fs.writeFile(filePath, body, 'utf-8');
}

function lineToParagraph(line: string, isSourceCode = false): Paragraph | null {
  const trimmed = line.trimEnd();

  // 1. 源码清单的换页控制行：仅产生 PageBreak 分页符，不再将页眉文本打印到正文里
  if (isSourceCode && trimmed.startsWith('\f')) {
    return new Paragraph({
      children: [new PageBreak()],
    });
  }

  // 2. 忽略源码清单中普通的第一页硬编码页眉
  if (isSourceCode && trimmed.startsWith('[') && trimmed.includes('第') && trimmed.includes('页')) {
    return null;
  }

  // 清除非法 XML 控制字符 (过滤掉 \x00-\x08, \x0B, \x0C, \x0E-\x1F)，防止 Word 报文件损坏
  const safeText = (trimmed || ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  let displayText = safeText;
  if (isSourceCode) {
    let currentWidth = 0;
    let truncated = '';
    for (let i = 0; i < displayText.length; i++) {
      const charCode = displayText.charCodeAt(i);
      // 中文字符等全角字符占用宽度约为英文字符的2倍
      const charWidth = charCode > 0xff ? 2 : 1;
      // 85 是一个安全阈值，确保在 A4 纸张、10.5pt 字体下绝对不会换行
      if (currentWidth + charWidth > 85) {
        break;
      }
      currentWidth += charWidth;
      truncated += displayText[i];
    }
    displayText = truncated;
  }

  // 3. 源码清单正文行：使用 Times New Roman 10.5pt (五号，即 size: 21) 渲染代码
  // 为了解决“大段空白区域”问题，并且绝对防止 50 行溢出到下一页变成 120 页，
  // 必须设置 before: 0, after: 0 消除默认段后距，同时给定一个安全的固定行距（13磅，line: 260）。
  if (isSourceCode) {
    return new Paragraph({
      spacing: { line: 260, lineRule: 'exact', before: 0, after: 0 },
      children: [
        new TextRun({
          text: displayText,
          font: 'Times New Roman',
          size: 21,
        }),
      ],
    });
  }

  // 4. 说明书与表格文档的渲染逻辑
  if (trimmed.startsWith('### ')) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun(safeText.slice(4))],
    });
  }
  if (trimmed.startsWith('## ')) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun(safeText.slice(3))],
    });
  }
  if (trimmed.startsWith('# ')) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(safeText.slice(2))],
    });
  }
  if (trimmed === '---') {
    return new Paragraph({ children: [new TextRun('')] });
  }

  const isCodeLike = trimmed.startsWith('[') && trimmed.includes('第') && trimmed.includes('页');

  return new Paragraph({
    children: [
      new TextRun({
        text: safeText,
        font: isCodeLike ? 'Times New Roman' : '宋体',
        size: isCodeLike ? 21 : 24,
      }),
    ],
  });
}

function createWordTable(rowsData: { key: string; val: string }[]): Table {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: '信息字段名称', bold: true, size: 20 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: '登记申报内容', bold: true, size: 20 })],
              }),
            ],
          }),
        ],
      }),
      ...rowsData.map(
        (item) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: item.key, size: 18 })] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: item.val, size: 18 })] })],
              }),
            ],
          }),
      ),
    ],
  });
}

async function writeDocx(
  content: string,
  filePath: string,
  licensed: boolean = true,
  workspaceRoot?: string,
): Promise<void> {
  const lines = content.split('\n');
  const isSourceCode = content.includes(' 共') && content.includes('页\n');
  const isForm = !isSourceCode && (content.includes('申请表格') || content.includes('表格信息'));

  let docHeaderTitle = '软件著作权登记材料';
  if (isSourceCode) {
    const firstLine = lines[0] || '';
    const match = firstLine.match(/^\[(.*?)\]/);
    if (match && match[1]) {
      docHeaderTitle = match[1];
    }
  } else {
    const nameMatch = content.match(/软件(?:全称|名称)：([^\n]+)/);
    const versionMatch = content.match(/版本(?:号)?：([^\n]+)/);
    if (nameMatch && versionMatch) {
      let versionText = versionMatch[1].trim();
      if (!versionText.toLowerCase().includes('v')) {
        versionText = `V${versionText}`;
      }
      docHeaderTitle = `${nameMatch[1].trim()} ${versionText}`;
    } else {
      const firstLine = lines[0] || '';
      if (firstLine.includes('软件说明书')) {
        docHeaderTitle = '软件说明书';
      } else if (firstLine.includes('表格信息')) {
        docHeaderTitle = '软件著作权申请表格信息';
      }
    }
  }

  // 如果未激活，在页眉强制加入水印标记
  const finalHeaderTitle = licensed ? docHeaderTitle : `【未激活预览】${docHeaderTitle}`;

  const children: (Paragraph | Table)[] = [];

  if (isForm) {
    let currentTableRows: { key: string; val: string }[] = [];

    const flushTable = () => {
      if (currentTableRows.length > 0) {
        children.push(createWordTable(currentTableRows));
        children.push(new Paragraph({ children: [new TextRun('')] }));
        currentTableRows = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('# ')) {
        flushTable();
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 28 })],
          }),
        );
        children.push(new Paragraph({ children: [new TextRun('')] }));
      } else if (trimmed.startsWith('## ')) {
        flushTable();
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 24 })],
          }),
        );
        children.push(new Paragraph({ children: [new TextRun('')] }));
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const itemText = trimmed.slice(2);
        const colonIndex = itemText.indexOf('：') !== -1 ? itemText.indexOf('：') : itemText.indexOf(':');
        if (colonIndex !== -1) {
          const key = itemText.slice(0, colonIndex).trim();
          const val = itemText.slice(colonIndex + 1).trim();
          currentTableRows.push({ key, val });
        } else {
          flushTable();
          children.push(new Paragraph({ children: [new TextRun({ text: trimmed, size: 20 })] }));
        }
      } else if (trimmed.startsWith('说明') || trimmed.startsWith('---') || trimmed.startsWith('注')) {
        flushTable();
        if (trimmed !== '---') {
          children.push(
            new Paragraph({ children: [new TextRun({ text: trimmed, size: 18, color: '666666' })] }),
          );
        }
      } else {
        flushTable();
        children.push(new Paragraph({ children: [new TextRun({ text: trimmed, size: 20 })] }));
      }
    }
    flushTable();
  } else {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isSourceCode && trimmed === '') {
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        if (
          (prevLine.startsWith('[') && prevLine.includes('第') && prevLine.includes('页')) ||
          (prevLine.startsWith('\f[') && prevLine.includes('第') && prevLine.includes('页'))
        ) {
          continue;
        }
      }

      // ─── 截图/图片自动嵌入处理 ───
      const mdImageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
      let isScreenshotPlaceholder = false;
      let matchedSlot: { prefix: string; label: string } | null = null;

      if (mdImageMatch) {
        const relPath = mdImageMatch[2];
        const absoluteImagePath = workspaceRoot ? path.resolve(workspaceRoot, relPath) : '';
        if (absoluteImagePath && fsSync.existsSync(absoluteImagePath)) {
          try {
            const imgBuffer = fsSync.readFileSync(absoluteImagePath);
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: 500,
                    height: 280,
                  },
                  type: 'png',
                })
              ]
            }));
            continue;
          } catch {
            // fallback to text
          }
        }
      }

      // 检查占位符匹配
      if (trimmed.includes('安装') && (trimmed.includes('截图') || trimmed.includes('插') || trimmed.includes('请在此'))) {
        matchedSlot = { prefix: 'setup', label: '安装步骤' };
        isScreenshotPlaceholder = true;
      } else if (trimmed.includes('主界面') && (trimmed.includes('截图') || trimmed.includes('插') || trimmed.includes('请在此'))) {
        matchedSlot = { prefix: 'main_ui', label: '软件主界面' };
        isScreenshotPlaceholder = true;
      } else if (trimmed.includes('功能') && (trimmed.includes('截图') || trimmed.includes('插') || trimmed.includes('请在此'))) {
        matchedSlot = { prefix: 'feature_run', label: '核心功能运行' };
        isScreenshotPlaceholder = true;
      } else if ((trimmed.includes('结果') || trimmed.includes('退出') || trimmed.includes('总结')) && (trimmed.includes('截图') || trimmed.includes('插') || trimmed.includes('请在此'))) {
        matchedSlot = { prefix: 'result', label: '运行结果/退出' };
        isScreenshotPlaceholder = true;
      }

      if (isScreenshotPlaceholder && matchedSlot) {
        const imagesDir = workspaceRoot ? path.resolve(workspaceRoot, '.ruanzhu', 'images') : '';
        const foundImages: string[] = [];
        
        if (imagesDir && fsSync.existsSync(imagesDir)) {
          let index = 0;
          while (true) {
            const imgPath = path.join(imagesDir, `${matchedSlot.prefix}_${index}.png`);
            if (fsSync.existsSync(imgPath)) {
              foundImages.push(imgPath);
              index++;
            } else {
              break;
            }
          }
        }

        if (foundImages.length > 0) {
          for (const imgPath of foundImages) {
            try {
              const imgBuffer = fsSync.readFileSync(imgPath);
              children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
                children: [
                  new ImageRun({
                    data: imgBuffer,
                    transformation: {
                      width: 500,
                      height: 280,
                    },
                    type: 'png',
                  })
                ]
              }));
            } catch {
              // fallback to text
            }
          }
          continue;
        } else {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `（提示：请在客户端右侧上传「${matchedSlot.label}」截图，导出时将自动内嵌该截图）`,
                color: 'FF0000',
                italics: true,
                size: 20,
              })
            ]
          }));
          continue;
        }
      }

      const p = lineToParagraph(line, isSourceCode);
      if (p) children.push(p);
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width: 11906,
            height: 16838,
          },
          margin: {
            top: 1134,
            bottom: 1134,
            left: 1417,
            right: 1417,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: finalHeaderTitle,
                  font: '宋体',
                  size: 21,
                  color: licensed ? '000000' : 'FF0000',
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: '第', font: '宋体', size: 21 }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: '宋体',
                  size: 21,
                }),
                new TextRun({ text: '页 共', font: '宋体', size: 21 }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: '宋体',
                  size: 21,
                }),
                new TextRun({ text: '页', font: '宋体', size: 21 }),
              ],
            }),
          ],
        }),
      },
      children: children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);
}

export async function writeVersionDescription(projectName: string, version: string, filePath: string, changes?: string): Promise<void> {
  const changeItems = changes ? changes.split('\n').filter(line => line.trim()) : [
    '新增智能 AI 代码排版与分析核心模块',
    '重构了说明书截图上传与管理，支持多图顺序内嵌',
    '新增了代码合规性自检与安全性过滤模块'
  ];

  const rows = changeItems.map((item, idx) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 10, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: String(idx + 1), alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: item.split('：')[0] || '核心模块升级', font: '宋体' })] })],
        }),
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: '提供基础的功能框架与基本逻辑。', font: '宋体' })] })],
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: item.split('：')[1] || item, font: '宋体' })] })],
        }),
      ]
    });
  });

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({
              text: "计算机软件著作权登记版本说明书",
              bold: true,
              size: 32,
              font: "宋体"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `本说明书针对软件「${projectName}」从低版本升级至高版本 V${version} 的修改点进行详细对照说明。`,
              font: "宋体"
            })
          ],
          spacing: { after: 300 }
        }),
        
        // Table 1: Base info
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "软件名称", bold: true, font: "宋体" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: projectName, font: "宋体" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "申请版本号", bold: true, font: "宋体" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `V${version}`, font: "宋体" })] })] }),
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "原登记号", bold: true, font: "宋体" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "（请在此处填写原版本软著登记号，如 2025SR123456）", font: "宋体" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "原登记日期", bold: true, font: "宋体" })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "（请在此处填写原登记日期）", font: "宋体" })] })] }),
              ]
            })
          ],
        }),

        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 300, after: 100 },
          children: [
            new TextRun({
              text: "修改/升级点对照表",
              bold: true,
              size: 24,
              font: "宋体"
            })
          ]
        }),

        // Table 2: Changes Comparison
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "序号", bold: true, font: "宋体" })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "升级/修改模块", bold: true, font: "宋体" })] })] }),
                new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "原版本（V1.0）功能", bold: true, font: "宋体" })] })] }),
                new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "当前版本（V" + version + "）功能与修改详情", bold: true, font: "宋体" })] })] }),
              ]
            }),
            ...rows
          ]
        }),

        new Paragraph({
          text: "",
          spacing: { before: 400 }
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "著作权人（签章/签名）：_______________________\n\n", font: "宋体" }),
            new TextRun({ text: "日期：________年____月____日", font: "宋体" })
          ]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);
}

export async function writeCooperativeAgreement(filePath: string): Promise<void> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({ text: "软件合作开发协议书", bold: true, size: 32, font: "宋体" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "甲方：__________________________________", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "乙方：__________________________________", font: "宋体" })], spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "鉴于甲乙双方友好协商，决定共同开发软件产品，特订立本协议：", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第一条 合作开发软件基本信息", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "1.1 软件暂定名称：__________________________________", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "1.2 软件版本号：V1.0", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第二条 研发分工与比例", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "2.1 甲方负责：软件核心架构、后台逻辑开发及系统主要测试。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "2.2 乙方负责：软件前端UI设计、接口对接以及用户手册文档编写。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "2.3 双方合作研发比例约定为：甲方 50%，乙方 50%（或可根据实际开发工作量另行商定）。", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第三条 知识产权归属与权属分配", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "3.1 双方合作开发的软件作品，其计算机软件著作权及相关知识产权归双方共同所有。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "3.2 双方在向国家版权中心申报计算机软件著作权登记时，申请人应列明甲方及乙方为共同著作权人。", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第四条 争议解决与其它", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "4.1 因本协议引起的任何争议，双方应友好协商解决；协商不成的，可向被告所在地人民法院提起诉讼。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "4.2 本协议自双方签字/盖章之日起生效，一式两份，双方各执一份，具有同等法律效力。", font: "宋体" })], spacing: { after: 400 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                  },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "甲方（盖章/签字）：__________________", font: "宋体" })], spacing: { after: 120 } }),
                    new Paragraph({ children: [new TextRun({ text: "日期：________年____月____日", font: "宋体" })] }),
                  ],
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                  },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "乙方（盖章/签字）：__________________", font: "宋体" })], spacing: { after: 120 } }),
                    new Paragraph({ children: [new TextRun({ text: "日期：________年____月____日", font: "宋体" })] }),
                  ],
                }),
              ],
            }),
          ],
        })
      ]
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);
}

export async function writeCommissionedContract(filePath: string): Promise<void> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({ text: "软件受托/委托开发合同书", bold: true, size: 32, font: "宋体" })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "委托方（甲方）：__________________________________", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "受托方（乙方）：__________________________________", font: "宋体" })], spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "委托人甲方与受托人乙方就以下软件开发事宜达成一致，特订立本合同以兹共同遵守：", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第一条 委托开发软件基本信息", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "1.1 委托开发软件名称：__________________________________", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "1.2 开发周期：自合同生效之日起 ________ 个工作日内完成。", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第二条 软件开发费用及支付方式", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "2.1 本合同软件研发总费用为人民币：¥___________ 元（大写：______________________）。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "2.2 支付方式：本合同签订之日起支付首笔 50% 预付款；乙方交付符合甲方要求的成果并验收通过后，支付余下 50% 尾款。", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第三条 知识产权归属（核心条款）", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "3.1 乙方依据本合同为甲方开发的软件，其完整计算机软件著作权、财产权、发表权及一切相关知识产权均【全部归委托方甲方所有】。乙方在完成交付并获得合同约定的全额付款后，不再享有该软件的任何著作权所有权利。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "3.2 甲方有权单方独立向国家版权中心申报该软件的计算机软件著作权登记，并登记为【唯一著作权人】。乙方应积极协助甲方提供相关申报鉴别材料（包括但不限于配合提供前60页连续的源程序代码、操作说明大纲等），且不得在申请表中将乙方列为著作权人。", font: "宋体" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "第四条 保密条款与争议解决", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "4.1 乙方应对在开发过程中获悉的甲方商业秘密、核心业务逻辑、及交付的代码成果承担严格保密义务，未经甲方书面许可，乙方不得将上述内容提供或透露给任何第三方。", font: "宋体" })] }),
        new Paragraph({ children: [new TextRun({ text: "4.2 因履行本合同发生的争议，双方应友好协商解决；协商不成可向甲方所在地有管辖权的人民法院提起诉讼。", font: "宋体" })], spacing: { after: 400 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                  },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "委托方甲方（盖章）：__________________", font: "宋体" })], spacing: { after: 120 } }),
                    new Paragraph({ children: [new TextRun({ text: "授权代表签字：__________________", font: "宋体" })], spacing: { after: 120 } }),
                    new Paragraph({ children: [new TextRun({ text: "日期：________年____月____日", font: "宋体" })] }),
                  ],
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                  },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "受托方乙方（盖章/签字）：__________________", font: "宋体" })], spacing: { after: 120 } }),
                    new Paragraph({ children: [new TextRun({ text: "授权代表签字：__________________", font: "宋体" })], spacing: { after: 120 } }),
                    new Paragraph({ children: [new TextRun({ text: "日期：________年____月____日", font: "宋体" })] }),
                  ],
                }),
              ],
            }),
          ],
        })
      ]
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);
}
