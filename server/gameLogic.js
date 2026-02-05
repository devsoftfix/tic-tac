const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function getWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isDraw(board) {
  return board.every(Boolean) && !getWinner(board);
}

function availableMoves(board) {
  const moves = [];
  for (let i = 0; i < board.length; i += 1) {
    if (!board[i]) moves.push(i);
  }
  return moves;
}

function findWinningMove(board, symbol) {
  for (const idx of availableMoves(board)) {
    const copy = board.slice();
    copy[idx] = symbol;
    if (getWinner(copy) === symbol) return idx;
  }
  return null;
}

function pickCpuMove(board, cpuSymbol) {
  const opponent = cpuSymbol === "X" ? "O" : "X";
  const winMove = findWinningMove(board, cpuSymbol);
  if (winMove !== null) return winMove;

  const blockMove = findWinningMove(board, opponent);
  if (blockMove !== null) return blockMove;

  if (!board[4]) return 4;

  const corners = [0, 2, 6, 8].filter((i) => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

  const moves = availableMoves(board);
  return moves[Math.floor(Math.random() * moves.length)];
}

module.exports = {
  WIN_LINES,
  getWinner,
  isDraw,
  availableMoves,
  pickCpuMove,
};
