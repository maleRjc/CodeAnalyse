import path from 'node:path';

/**
 * 字符级状态机：去除 C风格/Python风格注释并保留字符串字面量
 */
export function stripCommentsAndEmptyLines(code: string, ext: string): string {
  let inString = false;
  let stringChar = '';
  let inSingleComment = false;
  let inMultiComment = false;
  let result = '';
  let i = 0;

  const isHashComment = ['py', 'python', 'sh', 'ps1', 'yaml', 'yml', 'r', 'pl', 'rb'].includes(ext);
  const isSql = ext === 'sql';

  while (i < code.length) {
    const char = code[i];
    const nextChar = code[i + 1] || '';

    // 处理字符串状态
    if (inString) {
      if (char === '\\') {
        result += char + nextChar;
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      result += char;
      i++;
      continue;
    }

    // Python / Shell / Ruby 等 '#' 风格注释处理
    if (isHashComment) {
      if (inSingleComment) {
        if (char === '\n') {
          inSingleComment = false;
          result += char;
        }
        i++;
        continue;
      }
      // Python 三引号多行字符串/注释
      if (ext === 'py' || ext === 'python') {
        if (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") {
          const triple = code.slice(i, i + 3);
          i += 3;
          const endIdx = code.indexOf(triple, i);
          if (endIdx !== -1) {
            i = endIdx + 3;
          } else {
            i = code.length;
          }
          continue;
        }
      }
      if (char === '#') {
        inSingleComment = true;
        i++;
        continue;
      }
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      }
      result += char;
      i++;
      continue;
    }

    // SQL 注释处理
    if (isSql) {
      if (inSingleComment) {
        if (char === '\n') {
          inSingleComment = false;
          result += char;
        }
        i++;
        continue;
      }
      if (inMultiComment) {
        if (char === '*' && nextChar === '/') {
          inMultiComment = false;
          i += 2;
        } else {
          i++;
        }
        continue;
      }
      if (char === '-' && nextChar === '-') {
        inSingleComment = true;
        i += 2;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inMultiComment = true;
        i += 2;
        continue;
      }
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      }
      result += char;
      i++;
      continue;
    }

    // C 风格语言注释处理 (JS/TS/C++/Go/Java/Rust)
    if (inSingleComment) {
      if (char === '\n') {
        inSingleComment = false;
        result += char;
      }
      i++;
      continue;
    }

    if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleComment = true;
      i += 2;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      i += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    result += char;
    i++;
  }

  // 按行分割，去除尾部空白，过滤空行
  return result
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')
    .join('\n');
}

/**
 * 剥离大段十六进制/十进制字节数组定义，并在原位留存语义占位符
 */
export function stripLargeByteArrays(code: string, ext: string): string {
  const lowerExt = ext.toLowerCase();

  if (lowerExt === 'cpp' || lowerExt === 'c' || lowerExt === 'h' || lowerExt === 'hpp') {
    // 匹配类似 const BYTE Pixel_PX_main[234] = { 68, 88, ... }; 的结构
    const cppRegex = /(const\s+(?:BYTE|unsigned\s+char|char|uint8_t))\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*\{([^{}]*)\}/gi;
    return code.replace(cppRegex, (match, typeDecl, name, body) => {
      const commaCount = (body.match(/,/g) || []).length;
      if (commaCount > 15 || body.length > 50) {
        return `${typeDecl} ${name}[] = {}; // [Bytecode array ${name} removed]`;
      }
      return match;
    });
  }

  if (lowerExt === 'ts' || lowerExt === 'js' || lowerExt === 'tsx' || lowerExt === 'jsx') {
    // 匹配 const name = new Uint8Array([ ... ])
    const jsUint8Regex = /(const|let|var)\s+(\w+)\s*=\s*new\s+Uint8Array\(\s*\[([^\[\]]*)\]\s*\)/gi;
    let result = code.replace(jsUint8Regex, (match, declaration, name, body) => {
      const commaCount = (body.match(/,/g) || []).length;
      if (commaCount > 15 || body.length > 50) {
        return `${declaration} ${name} = new Uint8Array([]); // [Bytecode array ${name} removed]`;
      }
      return match;
    });

    // 匹配 const name = [ 0x01, 0x02, ... ]
    const jsArrayRegex = /(const|let|var)\s+(\w+)\s*=\s*\[([^\[\]]*)\]/gi;
    result = result.replace(jsArrayRegex, (match, declaration, name, body) => {
      const isNumberArray = /^\s*(?:0x[0-9a-fA-F]+|\d+)\s*(?:,\s*(?:0x[0-9a-fA-F]+|\d+)\s*)*,?\s*$/.test(body);
      const commaCount = (body.match(/,/g) || []).length;
      if (isNumberArray && (commaCount > 15 || body.length > 50)) {
        return `${declaration} ${name} = []; // [Bytecode array ${name} removed]`;
      }
      return match;
    });

    return result;
  }

  return code;
}

/**
 * 本地通用代码清洗主入口
 */
export function cleanCodeLocally(content: string, filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const withoutComments = stripCommentsAndEmptyLines(content, ext);
  const withoutByteArrays = stripLargeByteArrays(withoutComments, ext);
  return withoutByteArrays;
}
