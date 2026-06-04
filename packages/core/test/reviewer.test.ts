import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAndPolish } from '../src/deepseek-reviewer.js';

test('evaluateAndPolish skips AI when apiKey is missing', async () => {
  const docs = {
    sourceCode: 'A'.repeat(100) + '\nShort line\n' + 'B'.repeat(90),
    manual: 'This is a manual',
    applicationForm: 'This is an application form',
  };

  const onProgressMsgs: string[] = [];
  const result = await evaluateAndPolish(
    docs,
    undefined,
    undefined,
    0,
    (msg) => onProgressMsgs.push(msg)
  );

  assert.equal(result.manual, 'This is a manual');
  assert.equal(result.applicationForm, 'This is an application form');

  const lines = result.sourceCode.split('\n');
  assert.equal(lines[0], 'A'.repeat(100));
  assert.equal(lines[1], 'Short line');
  assert.equal(lines[2], 'B'.repeat(90));

  assert.ok(onProgressMsgs.some(m => m.includes('跳过 AI')));
});

test('evaluateAndPolish loops and corrects non-compliant content using mock fetch', async () => {
  const docs = {
    sourceCode: 'console.log("hello");',
    manual: 'Draft manual',
    applicationForm: 'Draft application form',
  };

  let callCount = 0;
  const mockFetch = async (url: string, init: any) => {
    callCount++;
    const body = JSON.parse(init.body);
    const systemPrompt = body.messages[0].content;

    if (systemPrompt.includes('资深审查专家')) {
      // 评估器调用
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '不合规反馈：说明书字数不足500字，缺少界面介绍。' } }],
          }),
        } as any;
      } else {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'COMPLIANT' } }],
          }),
        } as any;
      }
    } else if (systemPrompt.includes('文档工程师')) {
      // 生成器/修复器调用
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            manual: 'Updated Compliant Manual with more than 500 words of content...',
            applicationForm: 'Updated Compliant Application Form',
          }) } }],
        }),
      } as any;
    }
    return { ok: false } as any;
  };

  const onProgressMsgs: string[] = [];
  const result = await evaluateAndPolish(
    docs,
    'mock-api-key',
    mockFetch as any,
    3,
    (msg) => onProgressMsgs.push(msg)
  );

  assert.equal(result.manual, 'Updated Compliant Manual with more than 500 words of content...');
  assert.equal(result.applicationForm, 'Updated Compliant Application Form');
  assert.ok(onProgressMsgs.some(m => m.includes('第 1 轮审查未通过')));
  assert.ok(onProgressMsgs.some(m => m.includes('自动修复并更新成功')));
  assert.ok(onProgressMsgs.some(m => m.includes('第 2 轮审查通过')));
});
