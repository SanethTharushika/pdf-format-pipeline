// Fields found by LABEL. Add new aliases here when a format fails.
export const FIELDS = {
  patient: ["patient name", "name"],
  date: ["date"],
  address: ["address"],
  quantity: ["tabs no.", "tabs no", "quantity", "qty", "disp"],
  directions: ["sig"],
  refill: ["refill"],
};

// Fields with NO label, found by pattern
const PATTERNS = {
  drug: /[A-Za-z][A-Za-z\-]+\s+\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu)\b/i,
  doctor: /^[A-Za-z.\s]+,\s*M\.?D\.?$/i,
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find every label inside one line, with its position
function findLabels(line, fields) {
  const all = Object.entries(fields)
    .flatMap(([field, labels]) => labels.map((label) => ({ field, label })))
    .sort((a, b) => b.label.length - a.label.length); // longest first

  const hits = [];
  for (const { field, label } of all) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegex(label)}(?![A-Za-z])`, "gi");
    let m;
    while ((m = re.exec(line))) {
      const start = m.index;
      const end = start + m[0].length;
      // skip if it overlaps a longer label already found ("name" inside "patient name")
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ field, start, end });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function parseFields(lines, fields = FIELDS) {
  const result = Object.fromEntries(Object.keys(fields).map((k) => [k, ""]));

  for (const line of lines) {
    const hits = findLabels(line, fields);
    hits.forEach((h, i) => {
      if (result[h.field]) return; // keep the first match
      // the value ends where the next label on the same line starts
      const next = hits[i + 1] ? hits[i + 1].start : line.length;
      const value = line
        .slice(h.end, next)
        .replace(/^[\s:\-–_.]+/, "")
        .replace(/[\s_]+$/, "");
      if (value) result[h.field] = value;
    });
  }

  for (const [field, re] of Object.entries(PATTERNS)) {
    result[field] = "";
    for (const line of lines) {
      const m = line.match(re);
      if (m) { result[field] = m[0].trim(); break; }
    }
  }
  return result;
}

export function processLines(lines) {
  const fields = parseFields(lines);
  const missing = Object.keys(fields).filter((k) => !fields[k]);
  return { fields, missing, lines };
}

// PDF text extraction
export async function extractLines(pdfjsLib, data) {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const lines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const rows = {};
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      (rows[y] ||= []).push(item);
    }

    Object.keys(rows)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((y) => {
        const text = rows[y]
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((i) => i.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) lines.push(text);
      });
  }
  return lines;
}

export async function processPdf(pdfjsLib, data) {
  const lines = await extractLines(pdfjsLib, data);
  return processLines(lines);
}