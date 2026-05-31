const fs = require('fs');
const files = [
    'C:\\Users\\joseu\\.gemini\\antigravity\\brain\\24a9f01a-a2da-4f46-885c-d2e8404476aa\\.system_generated\\logs\\transcript.jsonl',
    'C:\\Users\\joseu\\.gemini\\antigravity\\brain\\5f7a4b57-83db-4854-beca-a7694aa11a3f\\.system_generated\\logs\\transcript.jsonl',
    'C:\\Users\\joseu\\.gemini\\antigravity\\brain\\cd35eac5-09ae-4de7-a2a9-a16dd4075cf1\\.system_generated\\logs\\transcript.jsonl'
];
let output = '';
files.forEach(f => {
    try {
        const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes('PLANNER_RESPONSE')) {
                output += `\n\n=== SUBAGENT RESPONSE FROM ${f.split('\\')[6]} ===\n`;
                const json = JSON.parse(lines[i]);
                const sendCall = json.tool_calls?.find(t => t.name === 'send_message');
                if (sendCall) {
                    output += sendCall.args.Message.replace(/\\n/g, '\n').replace(/\\"/g, '"') + '\n';
                } else {
                    output += "NO SEND_MESSAGE CALL FOUND.\n";
                }
                break;
            }
        }
    } catch (e) {
        output += `ERROR: ${e.message}\n`;
    }
});
fs.writeFileSync('C:\\Users\\joseu\\Desktop\\rconceptsys-main\\full_reports.md', output);
