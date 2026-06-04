import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guessProjectMeta } from '../dist/index.js';

const tempRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'temp_meta_test'
);

describe('guessProjectMeta tests', () => {
  before(async () => {
    await fs.mkdir(tempRoot, { recursive: true });
  });

  after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test('WeChat Mini Program metadata extraction', async () => {
    const miniProjPath = path.join(tempRoot, 'mini_program');
    await fs.mkdir(miniProjPath, { recursive: true });
    
    const appJsonContent = JSON.stringify({
      window: {
        navigationBarTitleText: "微信小程序测试软件"
      }
    });
    const packageJsonContent = JSON.stringify({
      version: "2.1.3"
    });
    
    await fs.writeFile(path.join(miniProjPath, 'app.json'), appJsonContent);
    await fs.writeFile(path.join(miniProjPath, 'package.json'), packageJsonContent);

    const meta = await guessProjectMeta(miniProjPath);
    assert.equal(meta.name, "微信小程序测试软件");
    assert.equal(meta.version, "2.1.3");
  });

  test('Rust Cargo.toml metadata extraction', async () => {
    const rustProjPath = path.join(tempRoot, 'rust_project');
    await fs.mkdir(rustProjPath, { recursive: true });

    const cargoContent = `
[package]
name = "rust_test_crate"
version = "0.5.2"
edition = "2021"
`;
    await fs.writeFile(path.join(rustProjPath, 'Cargo.toml'), cargoContent);

    const meta = await guessProjectMeta(rustProjPath);
    assert.equal(meta.name, "rust_test_crate");
    assert.equal(meta.version, "0.5.2");
  });

  test('Java Maven pom.xml metadata extraction', async () => {
    const mavenProjPath = path.join(tempRoot, 'maven_project');
    await fs.mkdir(mavenProjPath, { recursive: true });

    const pomContent = `
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <groupId>com.test</groupId>
    <artifactId>maven-test-artifact</artifactId>
    <version>1.4.0-SNAPSHOT</version>
    <name>Maven Test Project Name</name>
</project>
`;
    await fs.writeFile(path.join(mavenProjPath, 'pom.xml'), pomContent);

    const meta = await guessProjectMeta(mavenProjPath);
    assert.equal(meta.name, "Maven Test Project Name");
    assert.equal(meta.version, "1.4.0-SNAPSHOT");
  });

  test('Go Module go.mod metadata extraction', async () => {
    const goProjPath = path.join(tempRoot, 'go_project');
    await fs.mkdir(goProjPath, { recursive: true });

    const goModContent = `
module github.com/user/go-test-module

go 1.20
`;
    await fs.writeFile(path.join(goProjPath, 'go.mod'), goModContent);

    const meta = await guessProjectMeta(goProjPath);
    assert.equal(meta.name, "go-test-module");
    assert.equal(meta.version, "1.0.0");
  });

  test('Fallback metadata extraction (directory name)', async () => {
    const fallbackPath = path.join(tempRoot, 'some_random_directory');
    await fs.mkdir(fallbackPath, { recursive: true });

    const meta = await guessProjectMeta(fallbackPath);
    assert.equal(meta.name, "some_random_directory");
    assert.equal(meta.version, "1.0.0");
  });

  test('Flutter pubspec.yaml metadata extraction', async () => {
    const flutterProjPath = path.join(tempRoot, 'flutter_project');
    await fs.mkdir(flutterProjPath, { recursive: true });

    const pubspecContent = `
name: flutter_test_app
description: A new Flutter project.
version: 1.2.3+4
`;
    await fs.writeFile(path.join(flutterProjPath, 'pubspec.yaml'), pubspecContent);

    const meta = await guessProjectMeta(flutterProjPath);
    assert.equal(meta.name, "flutter_test_app");
    assert.equal(meta.version, "1.2.3+4");
  });

  test('C# csproj metadata extraction', async () => {
    const csProjPath = path.join(tempRoot, 'csharp_project');
    await fs.mkdir(csProjPath, { recursive: true });

    const csprojContent = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <AssemblyName>CSharpTestAssembly</AssemblyName>
    <Version>3.4.5</Version>
  </PropertyGroup>
</Project>
`;
    await fs.writeFile(path.join(csProjPath, 'TestProject.csproj'), csprojContent);

    const meta = await guessProjectMeta(csProjPath);
    assert.equal(meta.name, "CSharpTestAssembly");
    assert.equal(meta.version, "3.4.5");
  });
});
