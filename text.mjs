// Only complete, non-nested content blocks are eligible for narration.
export function extractContent(raw) {
    const blocks = [];
    let start = -1;
    let nested = false;
    let depth = 0;
    for (const match of String(raw ?? '').matchAll(/<\s*(\/?)content\s*>/gi)) {
        if (!match[1]) {
            if (depth === 0) { start = match.index + match[0].length; nested = false; }
            else nested = true;
            depth++;
        } else if (depth > 0) {
            depth--;
            if (depth === 0 && !nested) blocks.push(String(raw).slice(start, match.index));
        }
    }
    return blocks.join('\n\n');
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
