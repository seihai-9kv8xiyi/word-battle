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
    
    // 属性リスト（増やしても面白いかもな！）
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

    // 💥【超重要】ダメージの補正計算💥
    
    // 1. 類似度は0.5〜0.9あたりに集中するので、0.5を基準（底）にして差を広げる
    // 0.5以下は0、0.9なら0.8になるように引き伸ばす
    const adjustedSimilarity = Math.max(0, maxSimilarity - 0.5) * 2; 

    // 2. 指数（2乗）を使って、値が高いほどダメージが爆発的に上がる「ロマン砲」仕様にする！
    // 完全に意味が一致(1.0)なら250近いベースダメージが出る
    const baseDamage = Math.floor(Math.pow(adjustedSimilarity, 2) * 250);

    // 3. ゲームの醍醐味、乱数（運）要素を少し足す（0〜20のブレ）
    const randomBonus = Math.floor(Math.random() * 21);

    // 4. 最低ダメージ保証（10）を足して最終決定！
    const damage = Math.max(10, baseDamage + randomBonus);

    return NextResponse.json({
      word: word,
      attribute: bestAttribute,
      damage: damage,
      similarity: maxSimilarity // 確認用で生データも送っとくで
    });

  } catch (error: any) {
    console.error("エラーや！:", error);
    return NextResponse.json({ error: error.message || "処理に失敗したわ" }, { status: 500 });
  }
}