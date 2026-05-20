"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Supabaseクライアントの初期化（環境変数から読み込むで）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Log = {
  attacker: string;
  word: string;
  attribute: string;
  damage: number;
};

export default function Home() {
  // --- オンライン対戦用の新しいState ---
  const [roomId, setRoomId] = useState(""); // 合言葉
  const [myPlayerNumber, setMyPlayerNumber] = useState<1 | 2 | null>(null); // 自分がP1かP2か
  const [isJoined, setIsJoined] = useState(false); // 部屋に入ったかフラグ

  // --- ゲームの状態を管理するState ---
  const [p1Hp, setP1Hp] = useState(500);
  const [p2Hp, setP2Hp] = useState(700);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [winner, setWinner] = useState<string | null>(null);

  // 1. 【超重要】Supabaseのリアルタイム通信を繋ぐ処理
  useEffect(() => {
    if (!isJoined || !roomId) return;

    // 部屋に入った瞬間に、まずは最新のデータをSupabaseから1回取得する
    const fetchInitialData = async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).single();
      if (data) {
        setP1Hp(data.p1_hp);
        setP2Hp(data.p2_hp);
        setCurrentTurn(data.current_turn);
        setLogs(data.logs || []);
        setWinner(data.winner);
      }
    };
    fetchInitialData();

    // 💥これがSupabaseのリアルタイム通信の「購読（Subscribe）」や！
    // データベースのroomsテーブルの、この部屋（roomId）のデータが変わった瞬間を監視するで！
    const channel = supabase
      .channel(`room_${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const newData = payload.new;
          // 相手が更新した最新データがリアルタイムでここに降ってくる！
          setP1Hp(newData.p1_hp);
          setP2Hp(newData.p2_hp);
          setCurrentTurn(newData.current_turn);
          setLogs(newData.logs || []);
          setWinner(newData.winner);
        }
      )
      .subscribe();

    // 画面を閉じたり退室したら、通信を切断する後片付け
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isJoined, roomId]);

  // 2. 部屋を作る、または入る処理
  const handleJoinRoom = async (e: React.FormEvent, playerNum: 1 | 2) => {
    e.preventDefault();
    if (!roomId.trim()) return alert("合言葉を入れてください");

    setLoading(true);
    // まず部屋がすでに存在するかチェック
    const { data: existingRoom } = await supabase.from("rooms").select("*").eq("id", roomId).single();

    if (!existingRoom) {
      // 部屋がまだなければ、新しくSupabaseに部屋を作る（初期データを作成）
      const { error } = await supabase.from("rooms").insert({
        id: roomId,
        p1_hp: 500,
        p2_hp: 600,
        current_turn: 1,
        logs: [],
        winner: null,
      });
      if (error) {
        alert("部屋の作成に失敗しました...");
        setLoading(false);
        return;
      }
    }

    setMyPlayerNumber(playerNum);
    setIsJoined(true);
    setLoading(false);
  };

  // 3. 攻撃処理（APIでベクトル計算して、結果をSupabaseに反映！）
  const handleAttack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word || loading || winner || !myPlayerNumber) return;

    // 自分のターンじゃないなら、ボタンが押せても何もしない（不正防止）
    if (currentTurn !== myPlayerNumber) return alert("相手の行動中です");

    setLoading(true);
    try {
      // さっき作った最強の言語ベクトルAPI（route.ts）を叩く！
      const response = await fetch("/api/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });

      if (!response.ok) throw new Error("通信エラー");

      const data = await response.json();
      const damage = data.damage;
      const attribute = data.attribute;

      const attackerName = `プレイヤー${myPlayerNumber}`;

      // 次の状態を計算（ローカルのStateではなく、Supabaseへ送る用）
      let nextP1Hp = p1Hp;
      let nextP2Hp = p2Hp;
      let nextWinner = winner;

      if (myPlayerNumber === 1) {
        nextP2Hp = Math.max(0, p2Hp - damage);
        if (nextP2Hp <= 0) nextWinner = "プレイヤー1";
      } else {
        nextP1Hp = Math.max(0, p1Hp - damage);
        if (nextP1Hp <= 0) nextWinner = "プレイヤー2";
      }

      const newLog = { attacker: attackerName, word, attribute, damage };
      const nextLogs = [newLog, ...logs];

      const nextTurn = currentTurn === 1 ? 2 : 1;

      // 💥 計算結果をSupabaseにドン！と書き込む！
      // 自分が書き込んだら、リアルタイム通信で相手の画面も自動で更新されるで！
      await supabase
        .from("rooms")
        .update({
          p1_hp: nextP1Hp,
          p2_hp: nextP2Hp,
          current_turn: nextWinner ? currentTurn : nextTurn, // 決着がついてたらターンはそのまま
          logs: nextLogs,
          winner: nextWinner,
        })
        .eq("id", roomId);

      setWord(""); // 入力欄をクリア
    } catch (err) {
      alert("エラーが起きました。リトライしてください");
    } finally {
      setLoading(false);
    }
  };

  // 4. ゲームを最初からやり直す（Supabaseのデータを初期化）
  const handleReset = async () => {
    await supabase
      .from("rooms")
      .update({
        p1_hp: 500,
        p2_hp: 600,
        current_turn: 1,
        logs: [],
        winner: null,
      })
      .eq("id", roomId);
  };

  // ==================== 画面の描画 ====================

  // まだ部屋に入ってない時（合言葉入力画面）
  if (!isJoined) {
    return (
      <main className="max-w-md mx-auto p-6 mt-20 space-y-6 text-slate-200 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-extrabold text-center bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          言語闘争Field
        </h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">部屋の合言葉（相手と同じにしてください）</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="例：himitsu123"
              className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={(e) => handleJoinRoom(e, 1)}
              disabled={loading}
              className="py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black rounded-xl transition-all shadow-lg"
            >
              プレイヤー1として参戦
            </button>
            <button
              onClick={(e) => handleJoinRoom(e, 2)}
              disabled={loading}
              className="py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl transition-all shadow-lg"
            >
              プレイヤー2として参戦
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 部屋に入った後のバトル画面
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-8 text-slate-200">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          言語闘争Field (Online)
        </h1>
        <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700">
          部屋: <strong className="text-slate-200">{roomId}</strong> / あなた: <strong className={myPlayerNumber === 1 ? "text-cyan-400" : "text-purple-400"}>P{myPlayerNumber}</strong>
        </span>
      </div>

      {/* ステータス画面 */}
      <div className="grid grid-cols-2 gap-6">
        {/* P1のステータス */}
        <div className={`p-4 rounded-xl border-2 transition-all ${currentTurn === 1 && !winner ? 'border-cyan-400 bg-slate-800/50 shadow-lg shadow-cyan-500/10' : 'border-slate-700 bg-slate-900/30'}`}>
          <div className="font-bold text-cyan-400 flex justify-between items-center">
            <span>プレイヤー1 {myPlayerNumber === 1 && "(あなた)"}</span>
            {currentTurn === 1 && !winner && <span className="text-xs bg-cyan-500 text-slate-950 px-2 py-0.5 rounded-full font-black animate-pulse">TURN</span>}
          </div>
          <div className="w-full bg-slate-800 h-4 rounded-full mt-2 overflow-hidden border border-slate-700">
            <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${(p1Hp / 500) * 100}%` }}></div>
          </div>
          <div className="text-right text-sm font-mono mt-1 text-slate-400">HP: <span className="text-cyan-400 font-bold">{p1Hp}</span> / 500</div>
        </div>

        {/* P2のステータス */}
        <div className={`p-4 rounded-xl border-2 transition-all ${currentTurn === 2 && !winner ? 'border-purple-400 bg-slate-800/50 shadow-lg shadow-purple-500/10' : 'border-slate-700 bg-slate-900/30'}`}>
          <div className="font-bold text-purple-400 flex justify-between items-center">
            <span>プレイヤー2 {myPlayerNumber === 2 && "(あなた)"}</span>
            {currentTurn === 2 && !winner && <span className="text-xs bg-purple-500 text-slate-950 px-2 py-0.5 rounded-full font-black animate-pulse">TURN</span>}
          </div>
          <div className="w-full bg-slate-800 h-4 rounded-full mt-2 overflow-hidden border border-slate-700">
            <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${(p2Hp / 600) * 100}%` }}></div>
          </div>
          <div className="text-right text-sm font-mono mt-1 text-slate-400">HP: <span className="text-purple-400 font-bold">{p2Hp}</span> / 500</div>
        </div>
      </div>

      {/* 勝者発表 または 入力フォーム */}
      {winner ? (
        <div className="text-center p-6 bg-slate-800/80 rounded-2xl border border-yellow-500/30 shadow-2xl shadow-yellow-500/5 animate-bounce">
          <h2 className="text-2xl font-black text-yellow-400">👑 決着！！ 👑</h2>
          <p className="mt-2 text-xl font-bold text-slate-100">{winner} の完全勝利！</p>
          <button onClick={handleReset} className="mt-4 px-6 py-2 bg-yellow-500 text-slate-950 font-bold rounded-lg hover:bg-yellow-400 transition-colors">もう一回遊ぶ</button>
        </div>
      ) : (
        <form onSubmit={handleAttack} className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">
            {currentTurn === myPlayerNumber ? (
              <span className="text-green-400 font-bold">あなたの番です。攻撃を放て！</span>
            ) : (
              <span className="text-slate-400">相手が行動中です</span>
            )}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              disabled={loading || currentTurn !== myPlayerNumber}
              placeholder={currentTurn === myPlayerNumber ? "攻撃名を入力" : "相手のターン中です"}
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-100 placeholder-slate-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !word || currentTurn !== myPlayerNumber}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? "計算中..." : "攻撃！"}
            </button>
          </div>
        </form>
      )}

      {/* バトルログ */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-400">戦闘履歴</h3>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-48 overflow-y-auto space-y-2 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-slate-600 text-center pt-16">ここに戦闘の記録が刻まれます</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="p-2 rounded bg-slate-800/40 border-l-4 border-indigo-500 flex justify-between animate-fadeIn">
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