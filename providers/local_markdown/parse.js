const fs = require('fs');
const path = require('path');
const marked = require('./marked.min.js');
const md = fs.readFileSync(process.argv[2], 'utf8');

// --- Obsidian wikilinks -> standard markdown before marked sees them ---
// marked doesn't understand [[target#heading|alias]], so it leaves the raw
// [[...]] as literal text in the .docx. Rewrite:
//   [[Heading|alias]] / [[#Heading]] / [[This Doc#Heading]] -> [display](#slug)
//     for same-document refs (link to the heading anchor, matching the TOC), and
//   [[Other Doc#Heading|alias]] -> plain display text (no broken external link).
const selfName = path.basename(process.argv[2], '.md').trim().toLowerCase();
function slug(h) {
    return h.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-');
}
function dewiki(text) {
    return text.replace(/\[\[([^\]]+)\]\]/g, (m, inner) => {
        let target = inner, alias = null;
        const pipe = inner.indexOf('|');
        if (pipe >= 0) { target = inner.slice(0, pipe); alias = inner.slice(pipe + 1); }
        let file = target, heading = null;
        const hash = target.indexOf('#');
        if (hash >= 0) { file = target.slice(0, hash); heading = target.slice(hash + 1); }
        const display = (alias || heading || file).trim();
        const base = file.replace(/\.md$/i, '').trim().toLowerCase();
        const sameDoc = base === '' || base === selfName;
        if (sameDoc && heading) return `[${display}](#${slug(heading)})`;
        return display;   // cross-document ref -> readable text, no dangling link
    });
}

const tokens = marked.lexer(dewiki(md));
fs.writeFileSync(process.argv[3], JSON.stringify(tokens, null, 1));
// summary
const counts = {};
tokens.forEach(t => counts[t.type] = (counts[t.type] || 0) + 1);
console.error('top-level token types:', JSON.stringify(counts));
