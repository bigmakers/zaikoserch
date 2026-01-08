const SYSTEM_PROMPT = `あなたは医薬品在庫検索のアシスタントです。
ユーザーの入力と在庫検索ツールのJSON結果を確認し、次のルールで回答してください。

- match_type が "exact" のとき: 医薬品名をそのまま使い、在庫数を整数で伝える。
- match_type が "fuzzy" のとき: 「「{matched_name}」のことでしょうか？在庫は{stock}個です。」の形式で確認を促す。
- match_type が "not_found" のとき: 該当する医薬品が見つからなかった旨を丁寧に伝える。

在庫数は tool_json.stock を使用し、小数点以下は切り捨てて整数で回答する。`;

const form = document.getElementById("inventory-form");
const responseElement = document.getElementById("response");
const jsonOutput = document.getElementById("json-output");
const systemPrompt = document.getElementById("system-prompt");
const csvUpload = document.getElementById("csv-upload");

systemPrompt.textContent = SYSTEM_PROMPT;

let inventory = [];
let csvSourceLabel = "既定のCSV";

fetch("data/inventory.csv")
  .then((res) => res.text())
  .then((text) => {
    inventory = parseCsv(text);
  })
  .catch(() => {
    responseElement.textContent = "CSVの読み込みに失敗しました。";
  });

csvUpload.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    inventory = parseCsv(text);
    csvSourceLabel = file.name;
    responseElement.textContent = `${file.name} を読み込みました。医薬品名を入力してください。`;
  } catch (error) {
    console.error(error);
    responseElement.textContent = "CSVの読み込みに失敗しました。";
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = new FormData(form).get("medicine").toString().trim();
  if (!input) {
    responseElement.textContent = "医薬品名を入力してください。";
    return;
  }

  const result = searchInventory(input, inventory);
  result.csv_source = csvSourceLabel;
  jsonOutput.textContent = JSON.stringify(result, null, 2);
  responseElement.textContent = generateResponse(result);
});

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [medicine, stock] = lines[i].split(",");
    if (!medicine) continue;
    rows.push({
      medicine: medicine.trim(),
      stock: Number.parseFloat(stock),
    });
  }
  return rows;
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function searchInventory(input, items) {
  if (!items.length) {
    return {
      match_type: "not_found",
      input,
      matched_name: null,
      distance: null,
      stock: null,
    };
  }

  const normalizedInput = normalizeName(input);

  let best = null;

  for (const item of items) {
    const normalizedName = normalizeName(item.medicine);
    const distance = levenshteinDistance(normalizedInput, normalizedName);
    const candidate = {
      name: item.medicine,
      distance,
      stock: Number.isFinite(item.stock) ? Math.floor(item.stock) : null,
      exact: normalizedInput === normalizedName,
    };

    if (!best || candidate.distance < best.distance) {
      best = candidate;
    }
  }

  if (!best) {
    return {
      match_type: "not_found",
      input,
      matched_name: null,
      distance: null,
      stock: null,
    };
  }

  return {
    match_type: best.exact ? "exact" : "fuzzy",
    input,
    matched_name: best.name,
    distance: best.distance,
    stock: best.stock,
  };
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function generateResponse(result) {
  if (result.match_type === "exact") {
    return `${result.matched_name}の在庫は${result.stock}個です。`;
  }
  if (result.match_type === "fuzzy") {
    return `「${result.matched_name}」のことでしょうか？在庫は${result.stock}個です。`;
  }
  return "該当する医薬品が見つかりませんでした。";
}
