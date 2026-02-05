import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const emptyBoard = Array(9).fill(null);

function formatStatus(game, currentName, winnerName) {
  if (!game) return "No active game.";
  if (game.status === "won") {
    return `Winner: ${game.winnerSymbol} (${winnerName || "Unknown"})`;
  }
  if (game.status === "draw") return "Draw game.";
  return `Turn: ${game.currentSymbol} (${currentName || "Unknown"})`;
}

function GameBoard({ board, onMove, disabled, lastCpuMove }) {
  return (
    <div className="board">
      {board.map((value, index) => (
        <button
          key={index}
          className={`cell ${lastCpuMove === index ? "cpu-move" : ""}`}
          disabled={disabled || Boolean(value)}
          onClick={() => onMove(index)}
          type="button"
        >
          {value || ""}
        </button>
      ))}
    </div>
  );
}

function App() {
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [currentGame, setCurrentGame] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [mode, setMode] = useState("human-human");
  const [playerXId, setPlayerXId] = useState("");
  const [playerOId, setPlayerOId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [lastCpuMove, setLastCpuMove] = useState(null);
  const prevBoardRef = useRef(emptyBoard);
  const cpuStepTimerRef = useRef(null);
  const cpuStepInFlightRef = useRef(false);

  const humanPlayers = useMemo(
    () => players.filter((p) => p.type === "human"),
    [players]
  );

  async function fetchPlayers() {
    const res = await fetch("/api/players");
    const data = await res.json();
    setPlayers(data);
  }

  async function fetchGames() {
    const res = await fetch("/api/games");
    const data = await res.json();
    setGames(data);
  }

  useEffect(() => {
    fetchPlayers();
    fetchGames();
  }, []);

  useEffect(() => {
    if (!currentGame) return;
    const prevBoard = prevBoardRef.current || emptyBoard;
    const nextBoard = currentGame.board || emptyBoard;
    let changedIndex = null;
    for (let i = 0; i < nextBoard.length; i += 1) {
      if (prevBoard[i] !== nextBoard[i]) {
        changedIndex = i;
      }
    }
    const cpuSymbols = [];
    if (currentGame.playerX?.type === "cpu") cpuSymbols.push("X");
    if (currentGame.playerO?.type === "cpu") cpuSymbols.push("O");
    prevBoardRef.current = nextBoard.slice();
    if (changedIndex !== null && cpuSymbols.includes(nextBoard[changedIndex])) {
      setLastCpuMove(changedIndex);
      const timer = setTimeout(() => setLastCpuMove(null), 900);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [currentGame]);

  useEffect(() => {
    if (cpuStepTimerRef.current) {
      clearInterval(cpuStepTimerRef.current);
      cpuStepTimerRef.current = null;
    }
    if (!currentGame) return undefined;
    if (currentGame.mode !== "cpu-cpu") return undefined;
    if (currentGame.status !== "in_progress") return undefined;

    cpuStepTimerRef.current = setInterval(async () => {
      if (cpuStepInFlightRef.current) return;
      cpuStepInFlightRef.current = true;
      try {
        const res = await fetch(`/api/games/${currentGame.id}/cpu-step`, {
          method: "POST",
        });
        const data = await res.json();
        if (res.ok) {
          setCurrentGame(data);
          await fetchGames();
        }
      } catch (err) {
        // No-op: keep loop alive
      } finally {
        cpuStepInFlightRef.current = false;
      }
    }, 700);

    return () => {
      if (cpuStepTimerRef.current) {
        clearInterval(cpuStepTimerRef.current);
        cpuStepTimerRef.current = null;
      }
    };
  }, [currentGame]);

  async function createPlayer(e) {
    e.preventDefault();
    const name = newPlayerName.trim();
    if (!name) return;
    setIsBusy(true);
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create player.");
      setNewPlayerName("");
      await fetchPlayers();
      if (!playerXId) setPlayerXId(data.id);
      if (!playerOId) setPlayerOId(data.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function createGame() {
    setIsBusy(true);
    try {
      const payload = { mode };
      if (mode === "human-human") {
        payload.playerXId = playerXId;
        payload.playerOId = playerOId;
      }
      if (mode === "human-cpu") {
        payload.playerXId = playerXId;
      }

      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create game.");
      setCurrentGame(data);
      await fetchGames();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function playMove(index) {
    if (!currentGame) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/games/${currentGame.id}/moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Move rejected.");
      setCurrentGame(data);
      await fetchGames();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function resetGame() {
    if (!currentGame) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/games/${currentGame.id}/reset`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed.");
      setCurrentGame(data);
      await fetchGames();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsBusy(false);
    }
  }

  const board = currentGame?.board || emptyBoard;
  const currentPlayer =
    currentGame?.currentSymbol === "X"
      ? currentGame?.playerX
      : currentGame?.playerO;
  const currentName = currentPlayer?.name || "Unknown";
  const winnerName =
    currentGame?.winnerId === currentGame?.playerXId
      ? currentGame?.playerX?.name
      : currentGame?.winnerId === currentGame?.playerOId
      ? currentGame?.playerO?.name
      : null;
  const statusLine = formatStatus(currentGame, currentName, winnerName);

  const canStart =
    (mode === "human-human" && playerXId && playerOId && playerXId !== playerOId) ||
    (mode === "human-cpu" && playerXId) ||
    mode === "cpu-cpu";

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Tic Tac Toe Arena</p>
          <h1>Real Players + CPU Battles</h1>
          <p className="subhead">
            Create players, spin up matches, and watch humans and CPUs go
            head-to-head.
          </p>
        </div>
        <div className="stats">
          <div>
            <span className="stat-label">Players</span>
            <span className="stat-value">{players.length}</span>
          </div>
          <div>
            <span className="stat-label">Games</span>
            <span className="stat-value">{games.length}</span>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-title">Create Player</div>
        <form className="player-form" onSubmit={createPlayer}>
          <input
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Player name"
            disabled={isBusy}
          />
          <button type="submit" disabled={isBusy || !newPlayerName.trim()}>
            Add Player
          </button>
        </form>
        <div className="player-list">
          {players.map((p) => (
            <div key={p.id} className={`player-card ${p.type}`}>
              <div className="player-name">{p.name}</div>
              <div className="player-meta">{p.type.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel grid">
        <div>
          <div className="panel-title">Start Game</div>
          <div className="mode-options">
            {[
              { id: "human-human", label: "Human vs Human" },
              { id: "human-cpu", label: "Human vs CPU" },
              { id: "cpu-cpu", label: "CPU vs CPU" },
            ].map((item) => (
              <label key={item.id} className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value={item.id}
                  checked={mode === item.id}
                  onChange={() => setMode(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>

          {mode !== "cpu-cpu" && (
            <div className="selectors">
              <div>
                <label>Player X</label>
                <select
                  value={playerXId}
                  onChange={(e) => setPlayerXId(e.target.value)}
                  disabled={isBusy}
                >
                  <option value="">Select player</option>
                  {humanPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {mode === "human-human" && (
                <div>
                  <label>Player O</label>
                  <select
                    value={playerOId}
                    onChange={(e) => setPlayerOId(e.target.value)}
                    disabled={isBusy}
                  >
                    <option value="">Select player</option>
                    {humanPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <button
            className="primary"
            onClick={createGame}
            disabled={!canStart || isBusy}
            type="button"
          >
            Create Game
          </button>

          <div className="games-list">
            <div className="panel-title">Recent Games</div>
            {games.length === 0 && <p className="muted">No games yet.</p>}
            {games.slice(0, 5).map((game) => (
              <button
                key={game.id}
                className={`game-row ${game.status}`}
                onClick={() => setCurrentGame(game)}
                type="button"
              >
                <span>
                  {game.playerX?.name} (X) vs {game.playerO?.name} (O)
                </span>
                <span className="badge">{game.status}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="game-panel">
          <div className="panel-title">Live Board</div>
          <div className="status-line">{statusLine}</div>
          <GameBoard
            board={board}
            disabled={!currentGame || currentGame.status !== "in_progress" || isBusy}
            onMove={playMove}
            lastCpuMove={lastCpuMove}
          />
          <div className="game-actions">
            <button onClick={resetGame} disabled={!currentGame || isBusy} type="button">
              Reset Game
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
