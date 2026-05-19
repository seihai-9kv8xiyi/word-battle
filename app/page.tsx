"use client";

import { useState } from "react";

type Log = {
  attacker: string;
  word: string;
  attribute: string;
  damage: number;
};

export default function Home() {
  // 1. プレイヤーごとのHPとターン管理のState
  const [p1Hp, setP1Hp] = useState(500);
  const [p2Hp, setP2Hp] = useState(500);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1); // 今どっちのターンか
  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [winner, setWinner] = useState<string | null>(null);

  // 2. 攻撃処理
  const handleAttack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word || loading || winner) return;

    setLoading(true);
    try {
      // さっき作った最強の言語ベクトルAPIを叩く！
      const response = await fetch("/api/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });

      if (!response.ok) throw new Error("通信エラーや");

      const data = await response.json();
      const damage = data.damage;
      const attribute = data.attribute;

      const attackerName = `プレイヤー${currentTurn}`;

      // ダメージ適用（現在のターンじゃない方のHPを削る）
      if (currentTurn === 1) {
        const nextHp = Math.max(0, p2Hp - damage);
        setP2Hp(nextHp);
        if (nextHp <= 0) setWinner("プレイヤー1");
      } else {
        const nextHp = Math.max(0, p1Hp - damage);
        setP1Hp(nextHp);
        if (nextHp <= 0) setWinner("プレイヤー2");
      }

      // ログを追加
      setLogs((prev) => [
        { attacker: attackerName, word, attribute, damage },
        ...prev,
      ]);

      // ターン交代（決着がついてなければ）
      if (p1Hp - damage > 0 && p2Hp - damage > 0) {
        setCurrentTurn(currentTurn === 1 ? 2 : 1);
      }
      
      setWord(""); // 入力欄をクリア
    } catch (err) {
      alert("エラーが起きたわ！リトライしてみてな");
    } finally {
      setLoading(false);
    }
  };

  // 3. リセット処理
  const handleReset = () => {
    setP1Hp(500);
    setP2Hp(500);
    setCurrentTurn(1);
    setLogs([]);
    setWinner(null);
    setWord("");
  };

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-8 text-slate-200">
      <h1 className="text-3xl font-extrabold text-center bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
        言霊ベクトルバトル (PvP)
      </h1>

      {/* ステータス画面 */}
      <div className="grid grid-cols-2 gap-6">
        {/* P1のステータス */}
        <div className={`p-4 rounded-xl border-2 transition-all ${currentTurn === 1 && !winner ? 'border-cyan-400 bg-slate-800/50 shadow-lg shadow-cyan-500/10' : 'border-slate-700 bg-slate-900/30'}`}>
          <div className="font-bold text-cyan-400 flex justify-between items-center">
            <span>プレイヤー1</span>
            {currentTurn === 1 && !winner && <span className="text-xs bg-cyan-500 text-slate-950 px-2 py-0.5 rounded-full font-black animate-pulse">YOUR TURN</span>}
          </div>
          <div className="w-full bg-slate-800 h-4 rounded-full mt-2 overflow-hidden border border-slate-700">
            <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${(p1Hp / 500) * 100}%` }}></div>
          </div>
          <div className="text-right text-sm font-mono mt-1 text-slate-400">HP: <span className="text-cyan-400 font-bold">{p1Hp}</span> / 500</div>
        </div>

        {/* P2のステータス */}
        <div className={`p-4 rounded-xl border-2 transition-all ${currentTurn === 2 && !winner ? 'border-purple-400 bg-slate-800/50 shadow-lg shadow-purple-500/10' : 'border-slate-700 bg-slate-900/30'}`}>
          <div className="font-bold text-purple-400 flex justify-between items-center">
            <span>プレイヤー2</span>
            {currentTurn === 2 && !winner && <span className="text-xs bg-purple-500 text-slate-950 px-2 py-0.5 rounded-full font-black animate-pulse">YOUR TURN</span>}
          </div>
          <div className="w-full bg-slate-800 h-4 rounded-full mt-2 overflow-hidden border border-slate-700">
            <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${(p2Hp / 500) * 100}%` }}></div>
          </div>
          <div className="text-right text-sm font-mono mt-1 text-slate-400">HP: <span className="text-purple-400 font-bold">{p2Hp}</span> / 500</div>
        </div>
      </div>

      {/* 勝者発表 または 入力フォーム */}
      {winner ? (
        <div className="text-center p-6 bg-slate-800/80 rounded-2xl border border-yellow-500/30 shadow-2xl shadow-yellow-500/5 animate-bounce">
          <h2 className="text-2xl font-black text-yellow-400">👑 決着！！ 👑</h2>
          <p className="mt-2 text-xl font-bold text-slate-100">{winner} の完全勝利や！</p>
          <button onClick={handleReset} className="mt-4 px-6 py-2 bg-yellow-500 text-slate-950 font-bold rounded-lg hover:bg-yellow-400 transition-colors">もう一回遊ぶ</button>
        </div>
      ) : (
        <form onSubmit={handleAttack} className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">
            プレイヤー{currentTurn}の番：繰り出す「言霊」を入力せよ！
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              disabled={loading}
              placeholder={currentTurn === 1 ? "例：劫火、ダイヤモンド、絶対零度..." : "例：津波、世界樹、漆黒の闇..."}
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-100 placeholder-slate-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !word}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? "計算中..." : "言霊を放つ！"}
            </button>
          </div>
        </form>
      )}

      {/* バトルログ */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-400">戦闘履歴</h3>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-48 overflow-y-auto space-y-2 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-slate-600 text-center pt-16">ここに激闘の記録が刻まれるで...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="p-2 rounded bg-slate-800/40 border-l-4 border-indigo-500 flex justify-between">
                <div>
                  <span className={log.attacker === "プレイヤー1" ? "text-cyan-400" : "text-purple-400"}>{log.attacker}</span> の「<span className="text-slate-100 font-bold">{log.word}</span>」！
                  <span className="ml-2 text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{log.attribute}属性</span>
                </div>
                <div className="text-red-400 font-bold">-{log.damage}ダメージ</div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}