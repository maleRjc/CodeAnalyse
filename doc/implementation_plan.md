# Local Code Analysis and Document Generator Setup (CodeAnalyse)

This plan outlines the steps to build and set up a local code analysis and software copyright document generator inside the `D:\AutoCode\CodeAnalyse` directory by copying, customizing, and borrowing the UI of the `D:\AutoCode\RuanZhu` codebase.

## User Review Required

We need your decisions on a few critical aspects before proceeding with code modifications:

> [!IMPORTANT]
> 1. **Application Customization (Renaming)**: Do you want to rename the software to `CodeAnalyse` (e.g., "代码分析助手" / "Code Analyse Assistant") or keep the name "AI软著助手" (AI RuanZhu)?
> 2. **Licensing & Payment Module**: Since this is your local code analysis workspace, do you want to keep the payment modal and licensing checks (which currently require activation keys or the `RUANZHU-DEMO-BY-PROJECT` key), or should we bypass/disable them so that the full features (无水印导出, Word/PDF export) are active by default?

## Open Questions

> [!NOTE]
> - Should we automatically configure a default AI API key inside `D:\AutoCode\CodeAnalyse` if there's one you prefer to use?
> - Do you want the landing page (`apps/web`) to be copied as well, or should we only focus on the Electron desktop app (`apps/desktop`)?

---

## Proposed Changes

### Setup and Copying

We will duplicate the `RuanZhu` project structure into `CodeAnalyse`, excluding dependencies, git records, and build artifacts to keep it clean.

#### [NEW] [CodeAnalyse Project Structure](file:///d:/AutoCode/CodeAnalyse)
Copy all source directories and files from `d:\AutoCode\RuanZhu` to `d:\AutoCode\CodeAnalyse` using the following robocopy command:
```powershell
robocopy D:\AutoCode\RuanZhu D:\AutoCode\CodeAnalyse /E /XD node_modules .git release out dist ruanzhu-output tmp-cli-out
```

### Customization & Code Adjustment

Depending on your choices in "User Review Required", we will perform the following edits:

#### [MODIFY] [package.json](file:///d:/AutoCode/CodeAnalyse/package.json)
Rename the project name to `codeanalyse` and adjust configurations if required.

#### [MODIFY] [apps/desktop/package.json](file:///d:/AutoCode/CodeAnalyse/apps/desktop/package.json)
Modify product details (like `"productName": "AI软著助手"`) to match the new name if customized.

#### [MODIFY] [apps/desktop/src/main/index.ts](file:///d:/AutoCode/CodeAnalyse/apps/desktop/src/main/index.ts)
- Modify window title and product information.
- If chosen, modify the licensing verification code to always return `licensed = true` (bypass payment locks).

#### [MODIFY] [apps/desktop/src/renderer/App.tsx](file:///d:/AutoCode/CodeAnalyse/apps/desktop/src/renderer/App.tsx)
- Customize the landing layout titles.
- Disable/hide the "项目授权" (Project License) tab and licensing status displays if the license system is bypassed.

---

## Verification Plan

### Automated Tests
- Once dependencies are installed, run unit tests to verify:
  ```bash
  npm run test -w @ruanzhu/core
  ```

### Manual Verification
- Run `npm install` in the `D:\AutoCode\CodeAnalyse` workspace root.
- Execute `npm run dev` to start the Electron desktop application.
- Choose a directory to scan and verify the code analysis score, compliance checks, and document preview functionality.
- Try exporting to Word/PDF to ensure licensing checks are correctly bypassed or activated.
