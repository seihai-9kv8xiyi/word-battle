import { NextResponse } from 'next/server';

// 💡【爆速化の裏技】属性のベクトルをサーバーに記憶（キャッシュ）させておく変数
let cachedAttributeVectors: number[][] | null = null;
let cachedAttributeNames: string[] = [];

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
    
    // 好きな属性をここに並べてな！（増やしてもAPI制限にかかりにくくしたで！）
    const attributes = ["炎", "魔力", "雷", "聖", "闇", "無"];
    
    // キャッシュがない時だけ、全属性のベクトルを取得する
    if (!cachedAttributeVectors || cachedAttributeNames.join() !== attributes.join()) {
      // Promise.allで「同時」に通信するから一瞬で終わるで！
      cachedAttributeVectors = await Promise.all(attributes.map(attr => getGeminiEmbedding(attr)));
      cachedAttributeNames = [...attributes];
    }

    // 各属性との類似度を計算してリスト化
    const results = attributes.map((attr, index) => {
      return {
        name: attr,
        similarity: cosineSimilarity(inputVector, cachedAttributeVectors![index])
      };
    });

    // 類似度が高い順に並び替え
    results.sort((a, b) => b.similarity - a.similarity);

    // 💥【新・複合属性の合算ロジック】💥
    const EXPECTED_MIN_SIM = 0.55; 
    const EXPECTED_MAX_SIM = 0.85; 

    // 基準（0.55）を超えている「有効な属性」だけを抽出
    const validResults = results.filter(r => r.similarity > EXPECTED_MIN_SIM);

    let totalScore = 0;
    let bestAttribute = "無";

    if (validResults.length > 0) {
      // 【合算処理】基準を超えた分の「差分」を全部足し合わせる！
      // 例：水が0.7(差0.15)、炎が0.7(差0.15) なら、合計0.3の特大ダメージになる！
      for (const res of validResults) {
        totalScore += (res.similarity - EXPECTED_MIN_SIM);
      }

      // 複合属性の名前付け（上位2つがどちらも「0.65」を超えていたら合体！）
      if (validResults.length >= 2 && validResults[1].similarity > 0.65) {
        bestAttribute = `${validResults[0].name}＋${validResults[1].name}`;
      } else {
        bestAttribute = validResults[0].name; // 通常の単一属性
      }
    }

    // 倍率計算
    let rate = totalScore / (EXPECTED_MAX_SIM - EXPECTED_MIN_SIM);
    
    // 複合属性の「ロマン」を出すために、倍率の上限を1.0ではなく「1.2（限界突破）」まで許す！
    rate = Math.max(0, Math.min(1.2, rate)); 

    const MIN_DAMAGE = 45; 
    const MAX_DAMAGE = 200; 
    
    // 限界突破（rateが1.0以上）した場合、最大200ダメージの壁を越えて240ダメージとかが出るようになる！
    const baseDamage = Math.floor(MIN_DAMAGE + rate * (MAX_DAMAGE - MIN_DAMAGE));
    const randomBonus = Math.floor(Math.random() * 16);
    const damage = baseDamage + randomBonus;

    return NextResponse.json({
      word: word,
      attribute: bestAttribute, // 「水＋炎」などが返るようになる！
      damage: damage,
      similarity: validResults.length > 0 ? validResults[0].similarity : 0 
    });

  } catch (error: any) {
    console.error("エラーや！:", error);
    return NextResponse.json({ error: error.message || "処理に失敗したわ" }, { status: 500 });
  }
}