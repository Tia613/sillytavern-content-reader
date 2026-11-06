import test from 'node:test';
import assert from 'node:assert/strict';
import { ReaderPlayer } from '../player.mjs';

function setup(fallback) {
    const calls = [];
    const synth = {
        cancel() { calls.push('cancel'); }, pause() { calls.push('pause'); },
        resume() { calls.push('resume'); }, speak(u) { calls.push(u); },
    };
    return { calls, player: new ReaderPlayer(synth, text => ({ text }), { fallback }) };
}
test('native toggle pauses and resumes the existing utterance', () => {
    const { player, calls } = setup(false);
    player.play(['第一句。', '第二句。'], 7);
    const u = player.current;
    player.toggle(); assert.equal(player.paused, true);
    player.toggle(); assert.equal(player.current, u);
    assert.equal(calls.at(-1), 'resume');
    u.onend(); assert.equal(player.current.text, '第二句。');
});
test('Android resumes current segment from reported boundary, ignoring old callbacks', () => {
    const { player } = setup(true);
    player.play(['前一段。', '已经读过，剩余正文。'], 7);
    player.current.onend();
    const old = player.current;
    old.onboundary({ charIndex: 5 });
    player.toggle(); old.onerror({ error: 'canceled' }); old.onend();
    assert.equal(player.index, 1); assert.equal(player.paused, true);
    player.toggle(); assert.equal(player.current.text, '剩余正文。');
    player.current.onend(); assert.equal(player.active, false);
});
test('without boundaries fallback repeats current segment, never the whole message', () => {
    const { player } = setup(true);
    player.play(['第一段', '第二段'], 1); player.current.onend();
    player.toggle(); player.toggle();
    assert.equal(player.current.text, '第二段');
    player.stop(); assert.equal(player.active, false); assert.equal(player.key, null);
});
