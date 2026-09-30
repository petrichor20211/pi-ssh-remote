export function shellWords(input: string): string[] {
  const words: string[] = [];
  let word = "";
  let quoteChar: "'" | '"' | null = null;
  let escaped = false;
  for (const ch of input.trim()) {
    if (escaped) { word += ch; escaped = false; continue; }
    if (ch === "\\" && quoteChar !== "'") { escaped = true; continue; }
    if (quoteChar) { if (ch === quoteChar) quoteChar = null; else word += ch; continue; }
    if (ch === "'" || ch === '"') { quoteChar = ch; continue; }
    if (/\s/.test(ch)) { if (word) { words.push(word); word = ""; } }
    else word += ch;
  }
  if (escaped || quoteChar) throw new Error("Incomplete quoting or escaping in SSH command");
  if (word) words.push(word);
  return words;
}

export function quote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
