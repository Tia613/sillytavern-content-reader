import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContent, splitText, stripLeadingStatus } from '../text.mjs';

test('reads complete content only, preserving order and multiline text', () => {
    assert.equal(extractContent('秘密<content>第一段\n你好</content>状态<CONTENT>第二段</CONTENT>'), '第一段\n你好\n\n第二段');
});
test('does not leak unclosed or nested blocks', () => {
    assert.equal(extractContent('状态<content>未完成'), '');
    assert.equal(extractContent('<content>外<content>内</content>外</content>'), '');
    assert.equal(extractContent('<content>完整</content><content>未完成'), '完整');
});
test('long text stays ordered, bounded and preserves unicode characters', () => {
    const text = '你😀好'.repeat(200) + '。下一句！';
    const chunks = splitText(text);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(chunk => Array.from(chunk).length <= 140));
});
test('recovers a standalone body after a stray opening tag in a note', () => {
    assert.equal(extractContent('备注提及<content>收尾。\n<content>\n正文。\n</content>'), '\n正文。\n');
    assert.equal(extractContent('<content>外\n<content>\n内\n</content>外</content>'), '');
});
test('filters leading multiline status, preserving brackets later in the story', () => {
    assert.equal(stripLeadingStatus('\n【时间：今天\n天气：[晴]】\n正文【保留】'), '正文【保留】');
    assert.equal(stripLeadingStatus('【外【内】外】 【第二栏】\n正文'), '正文');
    assert.equal(stripLeadingStatus('【未闭合正文'), '【未闭合正文');
    assert.equal(stripLeadingStatus('没有状态栏【保留】'), '没有状态栏【保留】');
});
