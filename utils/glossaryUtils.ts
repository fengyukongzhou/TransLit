export const parseGlossaryStr = (str: string): Record<string, string> => {
  const lines = str.split('\n');
  const result: Record<string, string> = {};
  lines.forEach(line => {
    // 1. Try structural format: SOURCE: xxx | TARGET: yyy
    const structuralMatch = line.match(/SOURCE:\s*(.*?)\s*\|\s*TARGET:\s*(.*)/i);
    if (structuralMatch) {
        const key = structuralMatch[1].trim();
        const value = parseGlossaryValue(structuralMatch[2]);
        if (key && value) {
            result[key] = value;
            return;
        }
    }

    // 2. Fallback to simple format: Key: Value
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join(':').trim();
      if (key && value && !key.toLowerCase().includes('source') && !key.toLowerCase().includes('target')) {
          result[key] = value;
      }
    }
  });
  return result;
}

export const glossaryToOutputStr = (glossary: Record<string, string>): string => {
  return Object.entries(glossary)
    .sort()
    .map(([k, v]) => `SOURCE: ${k} | TARGET: ${v}`)
    .join('\n');
}

export const parseGlossaryValue = (rawValue: string): string => {
  return rawValue ? rawValue.trim() : "";
};
