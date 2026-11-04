import { extractContent, splitText, stripLeadingStatus } from './text.mjs';
import { ReaderPlayer } from './player.mjs';

const KEY = 'content_reader_v1';
const synth = window.speechSynthesis;
let panel, status, voiceSelect, settings;
let player;
let armed = false, generating = false, pending = new Set(), spoken = new Map();
const context = () => SillyTavern.getContext();
const tell = text => { if (status) status.textContent = text; };

function clean(raw) {
    const content = extractContent(raw);
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelectorAll('script,style,template,iframe,svg,pre,code').forEach(el => el.remove());
    doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,section,blockquote').forEach(el => el.append('\n'));
    const text = (doc.body.textContent ?? '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_`#~]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return settings.skipStatus ? stripLeadingStatus(text) : text;
}

function stop(message = '已停止') {
    player?.stop(); tell(message);
}

function syncButtons() {
    document.querySelectorAll('#chat .mes .cr-read').forEach(button => {
        const id = Number(button.closest('.mes').getAttribute('mesid'));
        const active = player?.active && player.key === id;
        const label = active ? (player.paused ? '▶ 继续' : '⏸ 暂停') : '🔊 正文';
        if (button.textContent !== label) button.textContent = label;
        button.setAttribute('aria-label', label);
    });
}

function speak(text, key = null) {
    if (!synth || !window.SpeechSynthesisUtterance) return tell('此浏览器没有提供系统朗读接口。');
    if (!text) return stop('没有找到完整的 <content> 正文，或过滤后正文为空。');
    player.play(splitText(text), key);
}

function readMessage(id) {
    const message = context().chat[Number(id)];
    if (!message || message.is_user || message.is_system) return tell('请选择角色回复。');
    armed = true;
    id = Number(id);
    if (player.active && player.key === id) player.toggle();
    else speak(clean(message.mes), id);
}

function refreshVoices() {
    if (!voiceSelect || !synth) return;
    voiceSelect.replaceChildren(new Option('自动选择中文音色', ''));
    for (const voice of synth.getVoices()) {
        voiceSelect.add(new Option(`${voice.name} · ${voice.lang}${voice.localService ? ' · 本机' : ''}`, voice.voiceURI));
    }
    voiceSelect.value = settings.voice;
    if (voiceSelect.selectedIndex < 0) voiceSelect.value = '';
}

function save() { context().saveSettingsDebounced(); }

function addButtons() {
    document.querySelectorAll('#chat .mes').forEach(el => {
        const id = Number(el.getAttribute('mesid'));
        const message = context().chat[id];
        if (!message || message.is_user || message.is_system || el.querySelector('.cr-read')) return;
        const target = el.querySelector('.mes_buttons');
        if (!target) return;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'cr-read menu_button';
        button.textContent = '🔊 正文'; button.title = '朗读这条消息的 content 正文';
        button.addEventListener('click', () => readMessage(el.getAttribute('mesid')));
        target.append(button);
    });
    syncButtons();
}

function autoRead() {
    if (generating) return;
    const ids = [...pending]; pending.clear();
    if (!settings.auto || !armed) return;
    const chat = context().chat;
    const texts = [];
    for (const id of ids) {
        const message = chat[id];
        if (!message || message.is_user || message.is_system || spoken.get(id) === message.mes) continue;
        const text = clean(message.mes);
        if (text) { texts.push(text); spoken.set(id, message.mes); }
    }
    if (texts.length) speak(texts.join('\n\n'), ids.length === 1 ? ids[0] : null);
}

function init() {
    if (document.getElementById('content-reader-settings')) return;
    const ctx = context();
    ctx.extensionSettings[KEY] ??= { auto: false, rate: 1, voice: '' };
    settings = ctx.extensionSettings[KEY];
    settings.skipStatus ??= true;
    settings.rate = Math.min(2, Math.max(0.5, Number(settings.rate) || 1));
    player = new ReaderPlayer(synth, text => {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = synth.getVoices();
        const voice = voices.find(v => v.voiceURI === settings.voice) ?? voices.find(v => /^zh/i.test(v.lang));
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang ?? 'zh-CN'; utterance.rate = settings.rate;
        return utterance;
    }, {
        fallback: /Android/i.test(navigator.userAgent),
        changed: (state, error) => {
            syncButtons();
            if (error) tell(`朗读失败（${error}），请切换音色或重新播放。`);
            else if (state.active) tell(state.paused ? '已暂停，点击同一按钮继续。' : `正在朗读 ${state.index + 1} / ${state.chunks.length}`);
            else tell('朗读完成或已停止。');
        },
    });
    panel = document.createElement('div'); panel.id = 'content-reader-settings';
    panel.innerHTML = `<div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b>正文听书 · 0.2.0</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">
        <p>只读完整的 &lt;content&gt; 正文。每次刷新后，先点击「试音」或播放一次。</p>
        <label><input type="checkbox" data-cr="auto"> 回复完成后自动朗读</label>
        <label><input type="checkbox" data-cr="skip-status"> 跳过正文开头的【状态栏】</label>
        <label>音色 <select class="text_pole" data-cr="voice"></select></label>
        <label>语速 <span data-cr="rate-label"></span><input data-cr="rate" type="range" min="0.5" max="2" step="0.1"></label>
        <div class="cr-controls"><button type="button" class="menu_button" data-cr="test">试音 / 开启朗读</button><button type="button" class="menu_button" data-cr="latest">读最新回复</button><button type="button" class="menu_button" data-cr="pause">暂停 / 继续</button><button type="button" class="menu_button" data-cr="stop">停止</button><button type="button" class="menu_button" data-cr="refresh">刷新音色</button></div>
        <p data-cr="status" role="status" aria-live="polite"></p>
        <small>系统语音由设备提供；是否联网取决于所选引擎。锁屏或切后台可能中断。请关闭酒馆原有 TTS 自动播放，避免重叠。</small>
      </div></div>`;
    (document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings'))?.append(panel);
    const get = name => panel.querySelector(`[data-cr="${name}"]`);
    status = get('status'); voiceSelect = get('voice');
    get('skip-status').checked = settings.skipStatus;
    get('skip-status').onchange = event => { settings.skipStatus = event.target.checked; save(); stop('过滤设置已保存，请重新播放。'); };
    get('auto').checked = settings.auto;
    get('auto').onchange = event => { settings.auto = event.target.checked; save(); tell('设置已保存；自动播放前请先点击试音。'); };
    get('rate').value = settings.rate; get('rate-label').textContent = `${settings.rate}×`;
    get('rate').oninput = event => { settings.rate = Number(event.target.value); get('rate-label').textContent = `${settings.rate}×`; save(); };
    voiceSelect.onchange = () => { settings.voice = voiceSelect.value; save(); };
    get('refresh').onclick = refreshVoices;
    get('test').onclick = () => { armed = true; refreshVoices(); speak('你好，正文听书已经准备好了。'); };
    get('latest').onclick = () => {
        const chat = context().chat;
        for (let id = chat.length - 1; id >= 0; id--) if (!chat[id].is_user && !chat[id].is_system) return readMessage(id);
        tell('当前聊天没有角色回复。');
    };
    get('stop').onclick = () => { pending.clear(); stop(); };
    get('pause').onclick = () => {
        if (player.active) player.toggle(); else tell('请先播放一条正文。');
    };
    refreshVoices(); synth?.addEventListener('voiceschanged', refreshVoices);
    tell(synth ? '等待播放。先点试音，确认手机有可用的中文语音。' : '此浏览器不支持系统朗读。');
    const on = (name, fn) => { if (ctx.event_types[name]) ctx.eventSource.on(ctx.event_types[name], fn); };
    on('GENERATION_STARTED', () => { generating = true; pending.clear(); stop('正在生成，等待正文完成。'); });
    on('MESSAGE_RECEIVED', id => { if (Number.isInteger(Number(id))) pending.add(Number(id)); if (!generating) setTimeout(autoRead, 0); });
    on('GENERATION_ENDED', () => { generating = false; setTimeout(autoRead, 0); });
    on('GENERATION_STOPPED', () => { generating = false; pending.clear(); stop('生成已停止，未自动朗读。'); });
    on('CHAT_CHANGED', () => { generating = false; armed = false; pending.clear(); spoken.clear(); stop('已切换聊天，请点击播放或试音开启朗读。'); });
    for (const name of ['MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED']) on(name, () => { pending.clear(); stop('消息已变化，请重新播放。'); });
    let scheduled = false;
    const chatElement = document.querySelector('#chat');
    if (chatElement) new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true; requestAnimationFrame(() => { scheduled = false; addButtons(); });
    }).observe(chatElement, { childList: true, subtree: true });
    addButtons();
    window.addEventListener('pagehide', () => stop());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
