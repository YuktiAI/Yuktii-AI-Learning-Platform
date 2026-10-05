const fs = require('fs');
const line = JSON.parse(fs.readFileSync('C:/Users/India/.gemini/antigravity-ide/brain/14e8a35d-76f7-4903-adea-d4e641d6eede/.system_generated/logs/transcript_full.jsonl', 'utf8').split('\n')[0]);
const content = line.content;
const idx = content.indexOf('Flag as "free but not open source"');
console.log(content.substring(idx, idx + 10000));
