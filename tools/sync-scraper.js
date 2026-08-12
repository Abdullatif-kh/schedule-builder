#!/usr/bin/env node
/**
 * Generates extension/scraper-core.js from university-courses-scraper.js.
 *
 * The console script is the single hand-edited source of truth. The Chrome
 * extension needs the same parsing logic but must NOT auto-run on injection,
 * so this tool keeps the class and drops the trailing auto-start block, then
 * wraps everything in an IIFE that publishes the class on `globalThis`.
 * The IIFE also makes re-injection safe (no "already declared" errors when the
 * popup button is pressed twice).
 *
 * Usage:
 *   node tools/sync-scraper.js          # write extension/scraper-core.js
 *   node tools/sync-scraper.js --check  # exit 1 if the generated file is stale
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'university-courses-scraper.js');
const TARGET = path.join(ROOT, 'extension', 'scraper-core.js');
const CLASS_NAME = 'UniversityCoursesScraper';

function extractClass(source) {
    const lines = source.split('\n');
    const classLine = lines.findIndex(line => line.trimStart().startsWith(`class ${CLASS_NAME}`));

    if (classLine === -1) {
        throw new Error(`Could not find "class ${CLASS_NAME}" in ${SOURCE}`);
    }

    // The class body is indented, so the first unindented "}" closes the class.
    let endLine = -1;
    for (let i = classLine + 1; i < lines.length; i++) {
        if (/^\}\s*$/.test(lines[i])) {
            endLine = i;
            break;
        }
    }

    if (endLine === -1) {
        throw new Error(`Could not find the closing brace of class ${CLASS_NAME}`);
    }

    // Keep the leading comment header too, drop the auto-run tail.
    return lines.slice(0, endLine + 1).join('\n').trimEnd();
}

function build() {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const classBody = extractClass(source);

    return [
        '// ===============================================',
        '// GENERATED FILE - DO NOT EDIT',
        '// Source: university-courses-scraper.js',
        '// Regenerate with: node tools/sync-scraper.js',
        '// ===============================================',
        '',
        '(function () {',
        classBody,
        '',
        `    globalThis.${CLASS_NAME} = ${CLASS_NAME};`,
        '})();',
        ''
    ].join('\n');
}

function main() {
    const generated = build();
    const check = process.argv.includes('--check');

    if (check) {
        const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;
        if (current !== generated) {
            console.error('extension/scraper-core.js is out of sync with university-courses-scraper.js');
            console.error('Run: node tools/sync-scraper.js');
            process.exit(1);
        }
        console.log('extension/scraper-core.js is in sync');
        return;
    }

    fs.mkdirSync(path.dirname(TARGET), { recursive: true });
    fs.writeFileSync(TARGET, generated);
    console.log(`Wrote ${path.relative(ROOT, TARGET)} (${generated.split('\n').length} lines)`);
}

main();
