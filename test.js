import fs from "fs";
import path from "path";

const folder = "./samples";
const files = fs.readdirSync(folder).filter((f) => f.endsWith(".pdf"));

for (const file of files) {
  const form = new FormData();
  const buffer = fs.readFileSync(path.join(folder, file));
  form.append("file", new Blob([buffer], { type: "application/pdf" }), file);

  const res = await fetch("http://localhost:3000/api/extract", {
    method: "POST",
    body: form,
  });
  const json = await res.json();

  const status = json.missing?.length ? "❌ missing: " + json.missing.join(", ") : "✅ all fields found";
  console.log(`${file}: ${status}`);
}