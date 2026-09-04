/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.join(__dirname, "..");
const dataFiles = [
  path.join(root, "src", "data", "facility-set-1.json"),
  path.join(root, "src", "data", "facility-set-2.json"),
  path.join(root, "src", "data", "facility-set-3.json"),
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^"(.*)"$/, "$1");
    if (value) env[key] = value;
  }
  return env;
}

function envValue(name) {
  const envFiles = [
    readEnvFile(path.join(root, ".env.supabase-upload")),
    readEnvFile(path.join(root, ".env.local")),
  ];
  return process.env[name] || envFiles.map((env) => env[name]).find(Boolean) || "";
}

function toRow(question) {
  return {
    id: question.id,
    year: question.year,
    round: question.round,
    date: question.date,
    number: question.number,
    category: question.category,
    question: question.question,
    answer: question.answer,
    explanation: question.explanation || "",
    images: question.images || [],
    variant: Boolean(question.variant),
    source_html: question.sourceHtml || "",
    solution_html: question.solutionHtml || "",
    source_type: "facility-set",
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const rows = dataFiles
    .flatMap((file) => JSON.parse(fs.readFileSync(file, "utf8")))
    .map(toRow);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    const { error } = await supabase.from("quiz_questions").upsert(batch, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  const { count, error: countError } = await supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "facility-set");
  if (countError) throw countError;

  console.log(JSON.stringify({
    uploaded: rows.length,
    remoteFacilitySetCount: count,
    variants: rows.filter((row) => row.variant).length,
    images: rows.reduce((sum, row) => sum + row.images.length, 0),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
