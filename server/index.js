const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const {
  getWinner,
  isDraw,
  availableMoves,
  pickCpuMove,
} = require("./gameLogic");

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

const players = [];
const games = [];
let cpuCounter = 1;

function nowIso() {
  return new Date().toISOString();
}

function createPlayer(name, type = "human") {
  const player = {
    id: uuidv4(),
    name,
    type,
    createdAt: nowIso(),
  };
  players.push(player);
  return player;
}

function getPlayer(id) {
  return players.find((p) => p.id === id);
}

function ensureCpuPlayer(label) {
  const existing = players.find((p) => p.type === "cpu" && p.name === label);
  if (existing) return existing;
  return createPlayer(label, "cpu");
}

function serializeGame(game) {
  const playerX = getPlayer(game.playerXId);
  const playerO = getPlayer(game.playerOId);
  return {
    ...game,
    playerX,
    playerO,
  };
}

function updateGameStatus(game) {
  const winnerSymbol = getWinner(game.board);
  if (winnerSymbol) {
    game.status = "won";
    game.winnerSymbol = winnerSymbol;
    game.winnerId = winnerSymbol === "X" ? game.playerXId : game.playerOId;
    return;
  }
  if (isDraw(game.board)) {
    game.status = "draw";
  }
}

function takeMove(game, index, symbol) {
  if (game.board[index]) {
    throw new Error("Square already taken.");
  }
  game.board[index] = symbol;
  game.lastMoveAt = nowIso();
  updateGameStatus(game);
  if (game.status === "in_progress") {
    game.currentSymbol = symbol === "X" ? "O" : "X";
  }
}

function isCpuTurn(game) {
  const playerId = game.currentSymbol === "X" ? game.playerXId : game.playerOId;
  const player = getPlayer(playerId);
  return player && player.type === "cpu";
}

function runCpuTurns(game) {
  while (game.status === "in_progress" && isCpuTurn(game)) {
    const cpuSymbol = game.currentSymbol;
    const idx = pickCpuMove(game.board, cpuSymbol);
    if (idx === undefined || idx === null) break;
    takeMove(game, idx, cpuSymbol);
  }
}

function runCpuTurnOnce(game) {
  if (game.status !== "in_progress") return false;
  if (!isCpuTurn(game)) return false;
  const cpuSymbol = game.currentSymbol;
  const idx = pickCpuMove(game.board, cpuSymbol);
  if (idx === undefined || idx === null) return false;
  takeMove(game, idx, cpuSymbol);
  return true;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

app.get("/api/players", (req, res) => {
  const type = (req.query.type || "all").toLowerCase();
  if (type === "human") return res.json(players.filter((p) => p.type === "human"));
  if (type === "cpu") return res.json(players.filter((p) => p.type === "cpu"));
  return res.json(players);
});

app.post("/api/players", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required." });
  const existing = players.find(
    (p) => p.type === "human" && p.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return res.json(existing);
  const player = createPlayer(name, "human");
  res.status(201).json(player);
});

app.get("/api/games", (req, res) => {
  res.json(games.map(serializeGame));
});

app.post("/api/games", (req, res) => {
  const mode = String(req.body?.mode || "").toLowerCase();
  if (!["human-human", "human-cpu", "cpu-cpu"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode." });
  }

  let playerXId = req.body?.playerXId || null;
  let playerOId = req.body?.playerOId || null;

  if (mode === "human-human") {
    const playerX = getPlayer(playerXId);
    const playerO = getPlayer(playerOId);
    if (!playerX || !playerO) {
      return res.status(400).json({ error: "Both players are required." });
    }
    if (playerXId === playerOId) {
      return res
        .status(400)
        .json({ error: "Player X and O must be different." });
    }
    if (playerX.type !== "human" || playerO.type !== "human") {
      return res.status(400).json({ error: "Players must be human." });
    }
  }

  if (mode === "human-cpu") {
    const playerX = getPlayer(playerXId);
    if (!playerX || playerX.type !== "human") {
      return res.status(400).json({ error: "Human player is required for X." });
    }
    const cpu = ensureCpuPlayer("CPU");
    playerOId = cpu.id;
  }

  if (mode === "cpu-cpu") {
    const cpuX = ensureCpuPlayer(`CPU ${cpuCounter}`);
    cpuCounter += 1;
    const cpuO = ensureCpuPlayer(`CPU ${cpuCounter}`);
    cpuCounter += 1;
    playerXId = cpuX.id;
    playerOId = cpuO.id;
  }

  const game = {
    id: uuidv4(),
    board: Array(9).fill(null),
    playerXId,
    playerOId,
    currentSymbol: "X",
    status: "in_progress",
    winnerSymbol: null,
    winnerId: null,
    mode,
    createdAt: nowIso(),
    lastMoveAt: null,
  };

  if (mode !== "cpu-cpu") {
    runCpuTurns(game);
  }
  games.unshift(game);
  res.status(201).json(serializeGame(game));
});

app.get("/api/games/:id", (req, res) => {
  const game = games.find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found." });
  res.json(serializeGame(game));
});

app.post("/api/games/:id/moves", (req, res) => {
  const game = games.find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found." });
  if (game.status !== "in_progress") {
    return res.status(400).json({ error: "Game is over." });
  }

  const index = Number(req.body?.index);
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    return res.status(400).json({ error: "Invalid index." });
  }

  const currentPlayerId =
    game.currentSymbol === "X" ? game.playerXId : game.playerOId;
  const currentPlayer = getPlayer(currentPlayerId);
  if (!currentPlayer || currentPlayer.type !== "human") {
    return res.status(400).json({ error: "It is not a human turn." });
  }

  if (game.board[index]) {
    return res.status(400).json({ error: "Square already taken." });
  }

  takeMove(game, index, game.currentSymbol);
  runCpuTurns(game);
  res.json(serializeGame(game));
});

app.post("/api/games/:id/reset", (req, res) => {
  const game = games.find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found." });
  game.board = Array(9).fill(null);
  game.currentSymbol = "X";
  game.status = "in_progress";
  game.winnerSymbol = null;
  game.winnerId = null;
  game.lastMoveAt = null;
  if (game.mode !== "cpu-cpu") {
    runCpuTurns(game);
  }
  res.json(serializeGame(game));
});

app.post("/api/games/:id/cpu-step", (req, res) => {
  const game = games.find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found." });
  if (game.status !== "in_progress") {
    return res.status(400).json({ error: "Game is over." });
  }
  if (!isCpuTurn(game)) {
    return res.status(400).json({ error: "It is not a CPU turn." });
  }

  const moved = runCpuTurnOnce(game);
  if (!moved) {
    return res.status(400).json({ error: "CPU move failed." });
  }
  res.json(serializeGame(game));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
