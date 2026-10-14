const fs=require('fs');
const src=fs.readFileSync('C:/Users/Lenovo/GiftLoop-demo/dist/index.html','utf8');
const blocks=[...src.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
fs.writeFileSync('C:/Users/Lenovo/GiftLoop-demo/.inline-check.js',blocks.join('\n'));
console.log(JSON.stringify({scripts:blocks.length,bytes:blocks.join('\n').length,badTokens:(src.match(/oocument|frieno|renoer|oata/g)||[]).length,hardcodedXiaohe:src.includes("name:'小禾'")}));
