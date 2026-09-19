(function () {
  'use strict';

  const PIECES = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
  };

  const PIECE_VALUES = { 'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0 };

  const HUMAN_COLOR = 'w';
  const COMPUTER_COLOR = 'b';
  const COMPUTER_DELAY_MS = 500;
  const MAX_SEARCH_DEPTH = 3;
  const THINK_TIME_BUDGET_MS = 400;
  const MATE_SCORE = 1000000;

  let board = [];
  let currentPlayer = 'w';
  let selectedSquare = null;
  let legalMovesCache = [];
  let gameOver = false;
  let castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  let enPassantTarget = null;
  let isComputerThinking = false;
  let computerTimerId = null;

  let boardEl;
  let boardContainerEl;
  let turnDotEl;
  let turnTextEl;
  let statusTextEl;
  let newGameBtn;
  let gameOverModal;
  let modalIconEl;
  let modalTitleEl;
  let modalMessageEl;
  let modalPlayAgain;

  function initialBoard() {
    return [
      ['bR','bN','bB','bQ','bK','bB','bN','bR'],
      ['bP','bP','bP','bP','bP','bP','bP','bP'],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ['wP','wP','wP','wP','wP','wP','wP','wP'],
      ['wR','wN','wB','wQ','wK','wB','wN','wR']
    ];
  }

  function pieceColor(piece) {
    if (!piece) return null;
    return piece[0];
  }

  function pieceType(piece) {
    if (!piece) return null;
    return piece[1];
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function cloneBoard(b) {
    return b.map(row => row.slice());
  }

  function findKing(b, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p && pieceColor(p) === color && pieceType(p) === 'K') {
          return { r, c };
        }
      }
    }
    return null;
  }

  function generatePseudoMoves(b, r, c, cr, ep) {
    const piece = b[r][c];
    if (!piece) return [];
    const color = pieceColor(piece);
    const type = pieceType(piece);
    const enemy = color === 'w' ? 'b' : 'w';
    const moves = [];

    const pushMove = (tr, tc, extra = {}) => {
      if (!inBounds(tr, tc)) return false;
      const target = b[tr][tc];
      if (target && pieceColor(target) === color) return false;
      moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, ...extra });
      return !target;
    };

    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        for (let step = 1; step < 8; step++) {
          const tr = r + dr * step;
          const tc = c + dc * step;
          if (!inBounds(tr, tc)) break;
          const target = b[tr][tc];
          if (target && pieceColor(target) === color) break;
          moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
          if (target && pieceColor(target) === enemy) break;
        }
      }
    };

    switch (type) {
      case 'P': {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;

        if (inBounds(r + dir, c) && !b[r + dir][c]) {
          if (r + dir === promoRow) {
            moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c, promotion: true });
          } else {
            moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c });
          }
          if (r === startRow && !b[r + 2 * dir][c]) {
            moves.push({ fromR: r, fromC: c, toR: r + 2 * dir, toC: c, doublePawn: true });
          }
        }

        for (const dc of [-1, 1]) {
          const tr = r + dir;
          const tc = c + dc;
          if (!inBounds(tr, tc)) continue;
          const target = b[tr][tc];
          if (target && pieceColor(target) === enemy) {
            if (tr === promoRow) {
              moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, promotion: true });
            } else {
              moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
            }
          }
          if (ep && ep.r === tr && ep.c === tc) {
            moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, enPassant: true });
          }
        }
        break;
      }
      case 'N': {
        const deltas = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of deltas) pushMove(r + dr, c + dc);
        break;
      }
      case 'B':
        slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
        break;
      case 'R':
        slide([[-1, 0], [1, 0], [0, -1], [0, 1]]);
        break;
      case 'Q':
        slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
        break;
      case 'K': {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            pushMove(r + dr, c + dc);
          }
        }
        const rank = color === 'w' ? 7 : 0;
        if (r === rank && c === 4 && !isSquareAttacked(b, r, c, enemy)) {
          const kSide = color === 'w' ? cr.wK : cr.bK;
          const qSide = color === 'w' ? cr.wQ : cr.bQ;
          if (kSide && !b[rank][5] && !b[rank][6]
              && b[rank][7] && pieceType(b[rank][7]) === 'R' && pieceColor(b[rank][7]) === color
              && !isSquareAttacked(b, rank, 5, enemy) && !isSquareAttacked(b, rank, 6, enemy)) {
            moves.push({ fromR: r, fromC: c, toR: rank, toC: 6, castle: 'K' });
          }
          if (qSide && !b[rank][1] && !b[rank][2] && !b[rank][3]
              && b[rank][0] && pieceType(b[rank][0]) === 'R' && pieceColor(b[rank][0]) === color
              && !isSquareAttacked(b, rank, 2, enemy) && !isSquareAttacked(b, rank, 3, enemy)) {
            moves.push({ fromR: r, fromC: c, toR: rank, toC: 2, castle: 'Q' });
          }
        }
        break;
      }
    }
    return moves;
  }

  function isSquareAttacked(b, r, c, byColor) {
    for (let rr = 0; rr < 8; rr++) {
      for (let cc = 0; cc < 8; cc++) {
        const p = b[rr][cc];
        if (!p || pieceColor(p) !== byColor) continue;
        const moves = generateAttackMovesForPiece(b, rr, cc);
        for (const m of moves) {
          if (m.toR === r && m.toC === c) return true;
        }
      }
    }
    return false;
  }

  function generateAttackMovesForPiece(b, r, c) {
    const piece = b[r][c];
    if (!piece) return [];
    const color = pieceColor(piece);
    const type = pieceType(piece);
    const enemy = color === 'w' ? 'b' : 'w';
    const moves = [];

    const push = (tr, tc) => {
      if (!inBounds(tr, tc)) return false;
      const target = b[tr][tc];
      if (target && pieceColor(target) === color) return false;
      moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
      return !target;
    };

    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        for (let step = 1; step < 8; step++) {
          const tr = r + dr * step;
          const tc = c + dc * step;
          if (!inBounds(tr, tc)) break;
          const target = b[tr][tc];
          if (target && pieceColor(target) === color) break;
          moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
          if (target && pieceColor(target) === enemy) break;
        }
      }
    };

    switch (type) {
      case 'P': {
        const dir = color === 'w' ? -1 : 1;
        if (inBounds(r + dir, c - 1)) moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c - 1 });
        if (inBounds(r + dir, c + 1)) moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c + 1 });
        break;
      }
      case 'N': {
        const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of deltas) push(r + dr, c + dc);
        break;
      }
      case 'B': slide([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
      case 'R': slide([[-1,0],[1,0],[0,-1],[0,1]]); break;
      case 'Q': slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;
      case 'K':
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
          if (!(dr === 0 && dc === 0)) push(r + dr, c + dc);
        break;
    }
    return moves;
  }

  function applyMove(b, move, cr, ep) {
    const nb = cloneBoard(b);
    const piece = nb[move.fromR][move.fromC];
    const color = pieceColor(piece);
    const type = pieceType(piece);
    const newCR = { ...cr };
    let newEP = null;

    nb[move.toR][move.toC] = piece;
    nb[move.fromR][move.fromC] = null;

    if (move.enPassant) {
      const capR = move.fromR;
      nb[capR][move.toC] = null;
    }

    if (move.castle === 'K') {
      const rank = move.toR;
      nb[rank][5] = nb[rank][7];
      nb[rank][7] = null;
    } else if (move.castle === 'Q') {
      const rank = move.toR;
      nb[rank][3] = nb[rank][0];
      nb[rank][0] = null;
    }

    if (move.doublePawn) {
      newEP = { r: (move.fromR + move.toR) / 2, c: move.toC };
    }

    if (move.promotion) {
      nb[move.toR][move.toC] = color + 'Q';
    }

    if (type === 'K') {
      if (color === 'w') { newCR.wK = false; newCR.wQ = false; }
      else { newCR.bK = false; newCR.bQ = false; }
    }
    if (type === 'R') {
      if (color === 'w' && move.fromR === 7 && move.fromC === 0) newCR.wQ = false;
      if (color === 'w' && move.fromR === 7 && move.fromC === 7) newCR.wK = false;
      if (color === 'b' && move.fromR === 0 && move.fromC === 0) newCR.bQ = false;
      if (color === 'b' && move.fromR === 0 && move.fromC === 7) newCR.bK = false;
    }

    const rookHomeRights = { 7: { 0: 'wQ', 7: 'wK' }, 0: { 0: 'bQ', 7: 'bK' } };
    const homeRight = rookHomeRights[move.toR] ? rookHomeRights[move.toR][move.toC] : null;
    if (homeRight) newCR[homeRight] = false;

    return { board: nb, castlingRights: newCR, enPassant: newEP };
  }

  function isInCheck(b, color) {
    const king = findKing(b, color);
    if (!king) return false;
    const enemy = color === 'w' ? 'b' : 'w';
    return isSquareAttacked(b, king.r, king.c, enemy);
  }

  function getLegalMovesForState(b, color, cr, ep) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p || pieceColor(p) !== color) continue;
        const pseudo = generatePseudoMoves(b, r, c, cr, ep);
        for (const m of pseudo) {
          const { board: nb } = applyMove(b, m, cr, ep);
          if (!isInCheck(nb, color)) all.push(m);
        }
      }
    }
    return all;
  }

  function getLegalMoves(r, c) {
    const piece = board[r][c];
    if (!piece || pieceColor(piece) !== currentPlayer) return [];
    const pseudo = generatePseudoMoves(board, r, c, castlingRights, enPassantTarget);
    const legal = [];
    for (const m of pseudo) {
      const { board: nb } = applyMove(board, m, castlingRights, enPassantTarget);
      if (!isInCheck(nb, currentPlayer)) {
        legal.push(m);
      }
    }
    return legal;
  }

  function getAllLegalMoves(color) {
    return getLegalMovesForState(board, color, castlingRights, enPassantTarget);
  }

  function createBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.dataset.row = r;
        cell.dataset.col = c;
        const isLight = (r + c) % 2 === 0;
        const bgClass = isLight ? 'bg-white' : 'bg-slate-900';
        cell.className = [
          'relative aspect-square flex items-center justify-center select-none overflow-hidden',
          'focus:outline-none focus:z-10 transition-colors duration-150',
          bgClass,
          'border border-slate-500/60'
        ].join(' ');
        cell.addEventListener('click', onCellClick);
        boardEl.appendChild(cell);
      }
    }
  }

  function renderBoard() {
    const cells = boardEl.children;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const idx = r * 8 + c;
        const cell = cells[idx];
        const piece = board[r][c];
        const isLight = (r + c) % 2 === 0;

        let baseBg = isLight ? 'bg-white' : 'bg-slate-800';
        let extraClasses = 'border border-slate-500/70';
        let overlayHTML = '';

        if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
          baseBg = isLight ? 'bg-sky-200' : 'bg-sky-600';
          extraClasses += ' ring-4 ring-indigo-500 ring-inset z-10';
        }

        const isLegal = legalMovesCache.find(m => m.toR === r && m.toC === c);
        if (isLegal) {
          if (piece || isLegal.enPassant) {
            extraClasses += ' ring-4 ring-red-500 ring-inset';
          } else {
            overlayHTML = `<span class="absolute w-[30%] h-[30%] rounded-full bg-emerald-500/80 shadow-inner pointer-events-none"></span>`;
          }
        }

        cell.className = [
          'relative aspect-square flex items-center justify-center select-none overflow-hidden',
          'focus:outline-none focus:z-10 transition-colors duration-150',
          baseBg,
          extraClasses
        ].join(' ');

        let pieceHTML = '';
        if (piece) {
          const color = pieceColor(piece);
          const isWhiteP = color === 'w';
          const textColor = isWhiteP ? 'text-white' : 'text-slate-900';
          const stroke = isWhiteP
            ? 'piece-outline-dark'
            : 'piece-outline-light';
          pieceHTML = `<span class="text-3xl sm:text-4xl md:text-5xl pointer-events-none select-none ${textColor} ${stroke}" style="line-height:1">${PIECES[piece]}</span>`;
        }

        cell.innerHTML = overlayHTML + pieceHTML;
      }
    }

    if (isInCheck(board, currentPlayer) && !gameOver) {
      const king = findKing(board, currentPlayer);
      if (king) {
        const idx = king.r * 8 + king.c;
        const cell = cells[idx];
        if (!cell.classList.contains('ring-red-500')) {
          cell.classList.add('ring-4', 'ring-red-600', 'ring-inset', 'animate-pulse');
        }
      }
    }

    updateStatusUI();
  }

  function updateStatusUI() {
    const isHumanTurn = currentPlayer === HUMAN_COLOR;
    turnDotEl.style.background = isHumanTurn ? '#ffffff' : '#1e293b';
    turnDotEl.classList.toggle('ring-slate-300', true);
    turnDotEl.style.boxShadow = isHumanTurn
      ? 'inset 0 1px 2px rgba(0,0,0,0.2), 0 0 0 2px #cbd5e1'
      : 'inset 0 1px 2px rgba(255,255,255,0.15), 0 0 0 2px #cbd5e1';
    turnTextEl.textContent = isHumanTurn ? 'You' : 'Computer';

    if (gameOver) return;

    let html = '';
    if (isComputerThinking) {
      html = `<p class="text-sm font-semibold text-indigo-600 animate-pulse">Computer is thinking...</p>`;
      statusTextEl.innerHTML = html;
      return;
    }

    const inCheck = isInCheck(board, currentPlayer);
    const allMoves = getAllLegalMoves(currentPlayer);
    const hasMoves = allMoves.length > 0;

    if (!hasMoves && inCheck) {
      html = `<p class="text-sm font-semibold text-rose-600">Checkmate!</p>`;
    } else if (!hasMoves) {
      html = `<p class="text-sm font-semibold text-amber-600">Stalemate</p>`;
    } else if (inCheck) {
      html = `<p class="text-sm font-semibold text-rose-500">⚠ Check! · ${isHumanTurn ? 'Your turn' : "Computer's turn"}</p>`;
    } else if (isHumanTurn) {
      html = `<p class="text-sm text-slate-500">Your turn</p>`;
    } else {
      html = `<p class="text-sm text-slate-500">Computer's turn</p>`;
    }
    statusTextEl.innerHTML = html;
  }

  function onCellClick(e) {
    if (gameOver || isComputerThinking) return;
    if (currentPlayer !== HUMAN_COLOR) return;
    const cell = e.currentTarget;
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);

    if (selectedSquare) {
      const move = legalMovesCache.find(m => m.toR === r && m.toC === c);
      if (move) {
        makeMove(move);
        return;
      }
      if (selectedSquare.r === r && selectedSquare.c === c) {
        selectedSquare = null;
        legalMovesCache = [];
        renderBoard();
        return;
      }
      const newPiece = board[r][c];
      if (newPiece && pieceColor(newPiece) === currentPlayer) {
        selectedSquare = { r, c };
        legalMovesCache = getLegalMoves(r, c);
        renderBoard();
        return;
      }
      selectedSquare = null;
      legalMovesCache = [];
      renderBoard();
      return;
    }

    const piece = board[r][c];
    if (piece && pieceColor(piece) === currentPlayer) {
      selectedSquare = { r, c };
      legalMovesCache = getLegalMoves(r, c);
      renderBoard();
    }
  }

  function makeMove(move) {
    const result = applyMove(board, move, castlingRights, enPassantTarget);
    board = result.board;
    castlingRights = result.castlingRights;
    enPassantTarget = result.enPassant;

    currentPlayer = currentPlayer === 'w' ? 'b' : 'w';
    selectedSquare = null;
    legalMovesCache = [];
    renderBoard();

    const inCheck = isInCheck(board, currentPlayer);
    const hasMoves = getAllLegalMoves(currentPlayer).length > 0;

    if (!hasMoves) {
      gameOver = true;
      isComputerThinking = false;
      if (computerTimerId) {
        clearTimeout(computerTimerId);
        computerTimerId = null;
      }
      setBoardInteractive(true);
      showGameOver(inCheck ? 'checkmate' : 'stalemate');
      return;
    }

    if (currentPlayer === COMPUTER_COLOR) {
      scheduleComputerTurn();
    }
  }

  function setBoardInteractive(interactive) {
    boardContainerEl.style.pointerEvents = interactive ? '' : 'none';
  }

  function showGameOver(type) {
    gameOverModal.classList.remove('hidden');
    gameOverModal.classList.add('flex');
    if (type === 'checkmate') {
      const winnerColor = currentPlayer === 'w' ? 'b' : 'w';
      const winnerLabel = winnerColor === HUMAN_COLOR ? 'You' : 'Computer';
      modalIconEl.textContent = winnerColor === 'w' ? '♔' : '♚';
      modalTitleEl.textContent = 'Checkmate!';
      modalMessageEl.textContent = winnerLabel === 'You'
        ? 'You win the game!'
        : 'Computer wins the game.';
      statusTextEl.innerHTML = `<p class="text-sm font-bold text-rose-600">🏆 ${winnerLabel} ${winnerLabel === 'You' ? 'win' : 'wins'}!</p>`;
    } else {
      modalIconEl.textContent = '🤝';
      modalTitleEl.textContent = 'Stalemate';
      modalMessageEl.textContent = 'The game ends in a draw.';
      statusTextEl.innerHTML = `<p class="text-sm font-bold text-amber-600">Draw by stalemate</p>`;
    }
  }

  function hideGameOver() {
    gameOverModal.classList.add('hidden');
    gameOverModal.classList.remove('flex');
  }

  function resetGame() {
    if (computerTimerId) {
      clearTimeout(computerTimerId);
      computerTimerId = null;
    }
    isComputerThinking = false;
    board = initialBoard();
    currentPlayer = HUMAN_COLOR;
    selectedSquare = null;
    legalMovesCache = [];
    gameOver = false;
    castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    enPassantTarget = null;
    setBoardInteractive(true);
    hideGameOver();
    createBoard();
    renderBoard();
  }

  const PAWN_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ];

  const KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
  ];

  const BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
  ];

  const ROOK_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0]
  ];

  const QUEEN_TABLE = [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20]
  ];

  const KING_TABLE = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20]
  ];

  const PIECE_TABLES = {
    'P': PAWN_TABLE,
    'N': KNIGHT_TABLE,
    'B': BISHOP_TABLE,
    'R': ROOK_TABLE,
    'Q': QUEEN_TABLE,
    'K': KING_TABLE
  };

  function evaluatePosition(b) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p) continue;
        const color = pieceColor(p);
        const row = color === 'w' ? r : 7 - r;
        const value = PIECE_VALUES[pieceType(p)] * 100 + PIECE_TABLES[pieceType(p)][row][c];
        score += color === 'w' ? value : -value;
      }
    }
    return score;
  }

  function moveScore(b, m) {
    let s = 0;
    if (m.enPassant) s += 100;
    const target = b[m.toR][m.toC];
    if (target) s += 10 + PIECE_VALUES[pieceType(target)] * 10;
    if (m.promotion) s += 900;
    return s;
  }

  function orderMoves(b, moves) {
    moves.sort((a, x) => moveScore(b, x) - moveScore(b, a));
  }

  function negamax(b, color, cr, ep, depth, alpha, beta, deadline, ctx) {
    if (Date.now() > deadline) {
      ctx.timedOut = true;
      return 0;
    }
    const moves = getLegalMovesForState(b, color, cr, ep);
    if (moves.length === 0) {
      return isInCheck(b, color) ? -MATE_SCORE : 0;
    }
    if (depth === 0) {
      const score = evaluatePosition(b);
      return color === 'w' ? score : -score;
    }
    orderMoves(b, moves);
    const opponent = color === 'w' ? 'b' : 'w';
    let best = -MATE_SCORE;
    for (const m of moves) {
      const st = applyMove(b, m, cr, ep);
      const score = -negamax(st.board, opponent, st.castlingRights, st.enPassant, depth - 1, -beta, -alpha, deadline, ctx);
      if (ctx.timedOut) break;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function pickFallbackMove(b, color, cr, ep, moves) {
    const opponent = color === 'w' ? 'b' : 'w';
    const sign = color === 'w' ? 1 : -1;
    const base = evaluatePosition(b) * sign;
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const st = applyMove(b, m, cr, ep);
      let score = evaluatePosition(st.board) * sign - base;
      const piece = st.board[m.toR][m.toC];
      if (piece && pieceType(piece) !== 'K' && isSquareAttacked(st.board, m.toR, m.toC, opponent)) {
        score -= PIECE_VALUES[pieceType(piece)] * 100;
      }
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  function findComputerMove(b, color, cr, ep, legalMoves) {
    const deadline = Date.now() + THINK_TIME_BUDGET_MS;
    const opponent = color === 'w' ? 'b' : 'w';
    let bestMove = pickFallbackMove(b, color, cr, ep, legalMoves);

    for (let depth = 1; depth <= MAX_SEARCH_DEPTH; depth++) {
      if (Date.now() > deadline) break;
      const ctx = { timedOut: false };
      const candidates = legalMoves.slice();
      orderMoves(b, candidates);
      let alpha = -MATE_SCORE;
      let bestAtDepth = null;
      for (const m of candidates) {
        if (Date.now() > deadline) {
          ctx.timedOut = true;
          break;
        }
        const st = applyMove(b, m, cr, ep);
        const score = -negamax(
          st.board, opponent, st.castlingRights, st.enPassant,
          depth - 1, -MATE_SCORE, -alpha, deadline, ctx
        );
        if (ctx.timedOut) break;
        if (score > alpha) {
          alpha = score;
          bestAtDepth = m;
        }
      }
      if (ctx.timedOut) continue;
      if (bestAtDepth) bestMove = bestAtDepth;
    }
    return bestMove;
  }

  function scheduleComputerTurn() {
    if (gameOver) return;
    clearTimeout(computerTimerId);
    computerTimerId = null;
    isComputerThinking = true;
    setBoardInteractive(false);
    renderBoard();
    computerTimerId = setTimeout(runComputerTurn, COMPUTER_DELAY_MS);
  }

  function runComputerTurn() {
    computerTimerId = null;
    if (gameOver) {
      isComputerThinking = false;
      setBoardInteractive(true);
      return;
    }
    if (currentPlayer !== COMPUTER_COLOR) {
      isComputerThinking = false;
      setBoardInteractive(true);
      return;
    }
    const moves = getLegalMovesForState(board, COMPUTER_COLOR, castlingRights, enPassantTarget);
    if (moves.length === 0) {
      isComputerThinking = false;
      setBoardInteractive(true);
      gameOver = true;
      showGameOver(isInCheck(board, COMPUTER_COLOR) ? 'checkmate' : 'stalemate');
      return;
    }
    const move = findComputerMove(board, COMPUTER_COLOR, castlingRights, enPassantTarget, moves);
    isComputerThinking = false;
    setBoardInteractive(true);
    makeMove(move);
  }

  function initializeGame() {
    boardEl = document.getElementById('board');
    boardContainerEl = document.getElementById('boardContainer');
    turnDotEl = document.getElementById('turnDot');
    turnTextEl = document.getElementById('turnText');
    statusTextEl = document.getElementById('statusText');
    newGameBtn = document.getElementById('newGameBtn');
    gameOverModal = document.getElementById('gameOverModal');
    modalIconEl = document.getElementById('modalIcon');
    modalTitleEl = document.getElementById('modalTitle');
    modalMessageEl = document.getElementById('modalMessage');
    modalPlayAgain = document.getElementById('modalPlayAgain');
    createBoard();
    resetGame();
    newGameBtn.addEventListener('click', resetGame);
    modalPlayAgain.addEventListener('click', resetGame);
    gameOverModal.addEventListener('click', (e) => {
      if (e.target === gameOverModal) hideGameOver();
    });
    window.addEventListener('pagehide', () => {
      if (computerTimerId) {
        clearTimeout(computerTimerId);
        computerTimerId = null;
      }
      isComputerThinking = false;
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeGame);
    } else {
      initializeGame();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initialBoard,
      pieceColor,
      pieceType,
      inBounds,
      cloneBoard,
      findKing,
      generatePseudoMoves,
      isSquareAttacked,
      generateAttackMovesForPiece,
      applyMove,
      isInCheck,
      getLegalMovesForState,
      evaluatePosition,
      negamax,
      findComputerMove,
      pickFallbackMove
    };
  }
})();