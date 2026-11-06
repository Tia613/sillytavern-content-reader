// Only complete, non-nested content blocks are eligible for narration.
export function extractContent(raw) {
    const blocks = [];
    const stack = [];
    const text = String(raw ?? '');
    const recovered = [];
    for (const match of text.matchAll(/<\s*(\/?)content\s*>/gi)) {
        if (!match[1]) {
            if (stack.length) stack.at(-1).nested = true;
            const start = match.index + match[0].length;
            const before = text.slice(text.lastIndexOf('\n', match.index - 1) + 1, match.index);
            const standalone = !before.trim() && /^[^\S\r\n]*(?:\r?\n|$)/.test(text.slice(start));
            stack.push({ start, standalone, nested: false });
        } else if (stack.length) {
            const block = stack.pop();
            if (!block.nested) {
                const body = text.slice(block.start, match.index);
                if (!stack.length) blocks.push(body);
                else if (block.standalone) recovered.push(body);
            }
            // A closed outer block is truly nested and remains excluded.
            if (!stack.length) recovered.length = 0;
        }
    }
    return blocks.concat(recovered).join('\n\n');
}

export function stripLeadingStatus(text) {
    let rest = String(text).trimStart();
    while (rest.startsWith('【')) {
        let depth = 0, end = -1;
        for (let i = 0; i < rest.length; i++) {
            if (rest[i] === '【') depth++;
            if (rest[i] === '】' && --depth === 0) { end = i; break; }
        }
        if (end < 0) return rest; // Preserve text when brackets are incomplete.
        rest = rest.slice(end + 1).trimStart();
    }
    return rest;
}

export function splitText(text, limit = 140) {
    const result = [];
    for (const sentence of text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*|[。！？!?；;\n]+/gu) ?? []) {
        const chars = Array.from(sentence.trim());
        while (chars.length) result.push(chars.splice(0, limit).join(''));
    }
    return result.filter(Boolean);
}
