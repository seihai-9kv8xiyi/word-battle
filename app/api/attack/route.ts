import { NextResponse } from 'next/server';

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getGeminiEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "models/gemini-embedding-001", 
      content: { parts: [{ text: text }] }
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || "Gemini APIでエラーが発生したで");
  }

  const data = await response.json();
  return data.embedding.values; 
}

export async function POST(request: Request) {
  try {
    const { word } = await request.json();

    if (!word) {
      return NextResponse.json({ error: "言葉が入力されてへんで！" }, { status: 400 });
    }

    const inputVector = await getGeminiEmbedding(word);
    
    const attributes = ["炎", "水", "草", "光", "闇"];
    let bestAttribute = "無";
    let maxSimilarity = -1;

    for (const attr of attributes) {
      const attrVector = await getGeminiEmbedding(attr);
      const similarity = cosineSimilarity(inputVector, attrVector);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestAttribute = attr;
      }
    }

    // 💥【新・ダメージ調整】数値指定マッピング方式💥
    
    // 1. 実際のAIの類似度が動く範囲をここに指定する（ここをいじると難易度変えられるで）
    const EXPECTED_MIN_SIM = 0.55; // これより低い、または普通の言葉
    const EXPECTED_MAX_SIM = 0.85; // ドンピシャで意味が近い言葉（0.85超えは神レベル）

    // 2. 類似度を 0.0 〜 1.0 の「倍率（rate）」に変換する
    let rate = (maxSimilarity - EXPECTED_MIN_SIM) / (EXPECTED_MAX_SIM - EXPECTED_MIN_SIM);
    rate = Math.max(0, Math.min(1, rate)); // 0未満や1以上にならないようにガード！

    // 3. 出したいダメージの最低・最高をここでカチッと決める！
    const MIN_DAMAGE = 45;  // 全然関係ない言葉でも、これくらいは食らわせたい最低火力
    const MAX_DAMAGE = 200; // 属性ドンピシャの時に叩き出したいロマン最大火力

    // 4. 倍率を掛け算してベースダメージを決定！
    const baseDamage = Math.floor(MIN_DAMAGE + rate * (MAX_DAMAGE - MIN_DAMAGE));

    // 5. 最後の味付けにちょっとだけ乱数（0〜15）を足す
    const randomBonus = Math.floor(Math.random() * 16);
    const damage = baseDamage + randomBonus;

    return NextResponse.json({
      word: word,
      attribute: bestAttribute,
      damage: damage,
      similarity: maxSimilarity
    });

  } catch (error: any) {
    console.error("エラーや！:", error);
    return NextResponse.json({ error: error.message || "処理に失敗したわ" }, { status: 500 });
  }
}