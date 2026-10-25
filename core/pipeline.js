// ───────────── YOUR STANDARD FORMAT ─────────────
// field -> labels other documents might use. Add new aliases here.
export const FIELDS = {
  patient: ["patient name", "name"],
  date: ["date"],
  address: ["address"],
  quantity: ["tabs no.", "tabs no", "quantity", "qty", "disp"],
  directions: ["sig"],
  refill: ["refill"],
};

// Labels that exist in documents but are not in your format.
// They are only used to split rows into pairs correctly.
const EXTRA_LABELS = [
  "phone",
  "dea no.",
  "dea no",
  "state license no.",
  "state license no",
  "license no",
  "label",
  "generic if available",
];

// Fields with NO label, found by pattern in the unlabeled text
const PATTERNS = {
  drug: /[A-Za-z][A-Za-z\-]+\s+\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu)\b/i,
  doctor: /[A-Z][A-Za-z.\s]*?,\s*M\.?D\.?/,
};

// After mapping, tidy each field into your standard format
const NORMALIZERS = {
  quantity: (v) => (v.match(/\d+/) || [""])[0],
  refill: (v) => (v.match(/\d+/) || [""])[0],
  date: (v) => v.replace(/[^A-Za-z0-9,\/\-\s.]/g, "").trim(),
};

// ───────────── CLEANING ─────────────
// Remove OCR noise from one line
function cleanLine(line) {
  return line
    .replace(/^\s*[\(\[]?\s*[\dA-Za-z©®]{1,2}\s*[\)\]]\s*\|?\s*/, "") // leading "(1)" "2)"
    .replace(/\s*\|?\s*[\(\[]\s*\d{1,2}\s*[\)\]]\s*$/, "")            // trailing "| (3)"
    .replace(/_+/g, " ")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find every known label inside one line, with its position
function findLabels(line, labels) {
  const sorted = [...labels].sort((a, b) => b.length - a.length); // longest first
  const hits = [];
  for (const label of sorted) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegex(label)}(?![A-Za-z])`, "gi");
    let m;
    while ((m = re.exec(line))) {
      const start = m.index;
      const end = start + m[0].length;
      // skip if inside a longer label already found ("name" in "patient name")
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ label: label.toLowerCase(), start, end });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

// ───────────── STAGE 1: break everything into pairs ─────────────
// Returns a flat list like:
// [{ key: "name", value: "Mary Smith" }, { key: null, value: "Lipitor 10 mg" }, ...]
export function extractPairs(rawLines) {
  const lines = rawLines.map(cleanLine).filter(Boolean);
  const allLabels = [...new Set([...Object.values(FIELDS).flat(), ...EXTRA_LABELS])];
  const pairs = [];

  for (const line of lines) {
    const hits = findLabels(line, allLabels);

    if (hits.length === 0) {
      pairs.push({ key: null, value: line }); // text with no label
      continue;
    }

    // text before the first label on the line (no label)
    const before = line.slice(0, hits[0].start).trim();
    if (before) pairs.push({ key: null, value: before });

    hits.forEach((h, i) => {
      // a value ends where the next label on the same line starts
      const next = hits[i + 1] ? hits[i + 1].start : line.length;
      const value = line
        .slice(h.end, next)
        .replace(/^[\s:\-–.]+/, "")
        .trim();
      if (value) pairs.push({ key: h.label, value });
    });
  }
  return pairs;
}

// ───────────── STAGE 2: map pairs into YOUR format ─────────────
export function mapToFormat(pairs, fields = FIELDS) {
  const result = {};

  // labelled fields: first pair whose label matches an alias
  for (const [field, labels] of Object.entries(fields)) {
    const p = pairs.find((p) => p.key && labels.includes(p.key));
    result[field] = p ? p.value : "";
  }

  // unlabeled fields: search the text that has no label
  const unlabeled = pairs.filter((p) => !p.key).map((p) => p.value);
  for (const [field, re] of Object.entries(PATTERNS)) {
    result[field] = "";
    for (const text of unlabeled) {
      const m = text.match(re);
      if (m) { result[field] = m[0].trim(); break; }
    }
  }

  // tidy values
  for (const [field, fn] of Object.entries(NORMALIZERS)) {
    if (result[field]) result[field] = fn(result[field]);
  }
  return result;
}

export function processLines(lines) {
  const pairs = extractPairs(lines);
  const fields = mapToFormat(pairs);
  const missing = Object.keys(fields).filter((k) => !fields[k]);
  return { fields, missing, pairs, lines };
}

// ───────────── PDF TEXT EXTRACTION ─────────────
// For PDFs that have a real text layer
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