// Android engines can ignore pause()/resume(). Cancel there, retaining the last
// reported word boundary; native pause retains the exact position on other engines.
export class ReaderPlayer {
    constructor(synth, makeUtterance, { fallback = false, changed = () => {} } = {}) {
        Object.assign(this, { synth, makeUtterance, fallback, changed });
        this.token = 0;
        this.stop();
    }
    stop() {
        this.token++;
        this.active = false; this.paused = false; this.index = 0;
        this.offset = 0; this.boundary = 0; this.chunks = []; this.key = null;
        this.current = null;
        this.synth?.cancel(); this.changed(this);
    }
    play(chunks, key) {
        this.stop(); this.chunks = chunks; this.key = key;
        this.active = chunks.length > 0;
        this.next();
    }
    next() {
        if (!this.active || this.paused) return;
        if (this.index >= this.chunks.length) {
            this.active = false; this.current = null; this.changed(this); return;
        }
        const token = this.token;
        const base = this.offset;
        const utterance = this.makeUtterance(this.chunks[this.index].slice(base));
        this.current = utterance;
        utterance.onboundary = event => {
            if (token === this.token && Number.isInteger(event.charIndex)) this.boundary = base + event.charIndex;
        };
        utterance.onend = () => {
            if (token !== this.token) return;
            this.current = null; this.index++; this.offset = 0; this.boundary = 0;
            this.next();
        };
        utterance.onerror = event => {
            if (token !== this.token) return;
            this.stop(); this.changed(this, event.error);
        };
        this.changed(this);
        this.synth.speak(utterance);
    }
    toggle() {
        if (!this.active) return;
        if (!this.paused) {
            this.paused = true;
            if (this.fallback) {
                this.token++; this.offset = this.boundary; this.current = null;
                this.synth.cancel();
            } else this.synth.pause();
            this.changed(this);
        } else {
            this.paused = false;
            if (this.current) { this.synth.resume(); this.changed(this); }
            else this.next();
        }
    }
}
