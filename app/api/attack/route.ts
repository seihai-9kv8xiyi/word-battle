import { NextResponse } from 'next/server';

// 1. コサイン類似度（言葉の意味の近さ）を計算する関数
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

// 2. 言語ベクトルを取得する関数（成功した最強のやつ）
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

// 3. メインの攻撃処理
export async function POST(request: Request) {
  try {
    const { word } = await request.json();

    if (!word) {
      return NextResponse.json({ error: "言葉が入力されてへんで！" }, { status: 400 });
    }

    // ① プレイヤーが入力した言葉をベクトル（数字の配列）に変換！
    const inputVector = await getGeminiEmbedding(word);

    // ② 比較したい属性リストを用意（増やしてもオッケーやで！）
    const attributes = ["炎", "水", "草", "光", "闇"];
    let bestAttribute = "無";
    let maxSimilarity = -1;

    // ③ 各属性と言葉の意味の近さ（コサイン類似度）を計算
    for (const attr of attributes) {
      const attrVector = await getGeminiEmbedding(attr);
      const similarity = cosineSimilarity(inputVector, attrVector);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestAttribute = attr;
      }
    }

    // ④ ダメージ計算！
    // 類似度（0〜1）を100倍して、最低保証ダメージ（10）を足す感じで調整
    const damage = Math.floor(Math.max(0, maxSimilarity) * 100) + 10;

    // ⑤ 画面側に結果を返す
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