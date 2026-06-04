import fsPromises from 'node:fs/promises';
import path from 'node:path';

export interface ProjectMeta {
  name: string;
  version: string;
  description?: string;
  author?: string;
}

export async function guessProjectMeta(workspaceRoot: string): Promise<ProjectMeta> {
  // 1. WeChat Mini Program (app.json)
  try {
    const appJsonPath = path.join(workspaceRoot, 'app.json');
    const raw = await fsPromises.readFile(appJsonPath, 'utf-8');
    const data = JSON.parse(raw);
    const name = data?.window?.navigationBarTitleText;
    if (name) {
      let version = '1.0.0';
      try {
        const pkgRaw = await fsPromises.readFile(path.join(workspaceRoot, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgRaw);
        version = pkg.version || '1.0.0';
      } catch {}
      return { name, version };
    }
  } catch {}

  // 2. Node.js / Web (package.json)
  try {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    const raw = await fsPromises.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    if (pkg.name) {
      return {
        name: pkg.name,
        version: pkg.version || '1.0.0',
        description: pkg.description,
        author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
      };
    }
  } catch {}

  // 3. Rust (Cargo.toml)
  try {
    const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
    const raw = await fsPromises.readFile(cargoPath, 'utf-8');
    const nameMatch = raw.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = raw.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (nameMatch) {
      return {
        name: nameMatch[1],
        version: versionMatch ? versionMatch[1] : '1.0.0',
      };
    }
  } catch {}

  // 4. Java Maven (pom.xml)
  try {
    const pomPath = path.join(workspaceRoot, 'pom.xml');
    const raw = await fsPromises.readFile(pomPath, 'utf-8');
    const nameMatch = raw.match(/<name>([^<]+)<\/name>/);
    const artifactIdMatch = raw.match(/<artifactId>([^<]+)<\/artifactId>/);
    const versionMatch = raw.match(/<version>([^<]+)<\/version>/);
    const extractedName = nameMatch ? nameMatch[1] : artifactIdMatch?.[1];
    if (extractedName) {
      return {
        name: extractedName.trim(),
        version: versionMatch ? versionMatch[1].trim() : '1.0.0',
      };
    }
  } catch {}

  // 5. Python (pyproject.toml)
  try {
    const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
    const raw = await fsPromises.readFile(pyprojectPath, 'utf-8');
    const nameMatch = raw.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = raw.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (nameMatch) {
      return {
        name: nameMatch[1],
        version: versionMatch ? versionMatch[1] : '1.0.0',
      };
    }
  } catch {}

  // 6. Go Module (go.mod)
  try {
    const goModPath = path.join(workspaceRoot, 'go.mod');
    const raw = await fsPromises.readFile(goModPath, 'utf-8');
    const modMatch = raw.match(/^module\s+([^\s\n]+)/m);
    if (modMatch) {
      const modName = modMatch[1].split('/').pop() || modMatch[1];
      return {
        name: modName,
        version: '1.0.0',
      };
    }
  } catch {}

  // 7. Flutter / Dart (pubspec.yaml)
  try {
    const pubspecPath = path.join(workspaceRoot, 'pubspec.yaml');
    const raw = await fsPromises.readFile(pubspecPath, 'utf-8');
    const nameMatch = raw.match(/^\s*name\s*:\s*([^\s\n]+)/m);
    const versionMatch = raw.match(/^\s*version\s*:\s*([^\s\n]+)/m);
    if (nameMatch) {
      return {
        name: nameMatch[1].trim(),
        version: versionMatch ? versionMatch[1].trim() : '1.0.0',
      };
    }
  } catch {}

  // 8. C# (.csproj)
  try {
    const files = await fsPromises.readdir(workspaceRoot);
    const csprojFile = files.find(f => f.toLowerCase().endsWith('.csproj'));
    if (csprojFile) {
      const csprojPath = path.join(workspaceRoot, csprojFile);
      const raw = await fsPromises.readFile(csprojPath, 'utf-8');
      const assemblyNameMatch = raw.match(/<AssemblyName>([^<]+)<\/AssemblyName>/i);
      const rootNamespaceMatch = raw.match(/<RootNamespace>([^<]+)<\/RootNamespace>/i);
      const versionMatch = raw.match(/<Version>([^<]+)<\/Version>/i);
      const name = assemblyNameMatch?.[1] || rootNamespaceMatch?.[1] || path.basename(csprojFile, path.extname(csprojFile));
      return {
        name: name.trim(),
        version: versionMatch ? versionMatch[1].trim() : '1.0.0',
      };
    }
  } catch {}

  // Fallback
  return {
    name: path.basename(workspaceRoot),
    version: '1.0.0',
  };
}
