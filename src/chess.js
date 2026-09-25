(function () {
  'use strict';

  const PIECES = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
  };

  const PIECE_VALUES = { 'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0 };

  const BLACK_PAWN_SVG = '<svg viewBox="0 0 100 100" width="0.9em" height="0.9em" aria-hidden="true" focusable="false" style="display:block">'
    + '<g fill="#0f172a">'
    + '<circle cx="50" cy="21" r="12.5"/>'
    + '<rect x="44.5" y="29" width="11" height="13" rx="2.5"/>'
    + '<rect x="32" y="39" width="36" height="11" rx="5.5"/>'
    + '<path d="M35 47H65c0 13 3.5 23 9 31.5H26C31.5 70 35 60 35 47Z"/>'
    + '<rect x="14" y="77" width="72" height="13" rx="4"/>'
    + '</g>'
    + '<g fill="rgba(255,255,255,0.18)">'
    + '<ellipse cx="45" cy="15.5" rx="5" ry="3.4" transform="rotate(-20 45 15.5)"/>'
    + '<rect x="35" y="41" width="30" height="2.6" rx="1.3"/>'
    + '<path d="M35 47c0 13-3.5 23-9 31.5h5c5.5-8.5 9-18.5 9-31.5Z"/>'
    + '<rect x="17" y="79" width="66" height="2.4" rx="1.2"/>'
    + '</g>'
    + '<rect x="14" y="86.5" width="72" height="3.5" rx="1.75" fill="rgba(0,0,0,0.35)"/>'
    + '</svg>';

  function pieceContent(piece) {
    return piece === 'bP' ? BLACK_PAWN_SVG : PIECES[piece];
  }

  let board = [];
  let currentPlayer = 'w';
  let selectedSquare = null;
  let legalMovesCache = [];
  let gameOver = false;
  let castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  let enPassantTarget = null;
  let halfmoveClock = 0;
  let isAnimating = false;
  let moveAnimToken = 0;
  let activeGhosts = [];

  const boardEl = document.getElementById('board');
  const turnDotEl = document.getElementById('turnDot');
  const turnTextEl = document.getElementById('turnText');
  const statusTextEl = document.getElementById('statusText');
  const newGameBtn = document.getElementById('newGameBtn');
  const gameOverModal = document.getElementById('gameOverModal');
  const modalIconEl = document.getElementById('modalIcon');
  const modalTitleEl = document.getElementById('modalTitle');
  const modalMessageEl = document.getElementById('modalMessage');
  const modalPlayAgain = document.getElementById('modalPlayAgain');

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
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || pieceColor(p) !== color) continue;
        const pseudo = generatePseudoMoves(board, r, c, castlingRights, enPassantTarget);
        for (const m of pseudo) {
          const { board: nb } = applyMove(board, m, castlingRights, enPassantTarget);
          if (!isInCheck(nb, color)) all.push(m);
        }
      }
    }
    return all;
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
        const bgClass = isLight ? 'bg-white' : 'bg-oak-light';
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

        let baseBg = isLight ? 'bg-white' : 'bg-oak-light';
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
          pieceHTML = `<span class="piece-glyph text-3xl sm:text-4xl md:text-5xl pointer-events-none select-none ${textColor} ${stroke}" style="line-height:1">${pieceContent(piece)}</span>`;
        }

        cell.innerHTML = overlayHTML + pieceHTML;
      }
    }

    if (isInCheck(board, currentPlayer)) {
      const king = findKing(board, currentPlayer);
      if (king) {
        const idx = king.r * 8 + king.c;
        const cell = cells[idx];
        if (!cell.classList.contains('ring-red-500')) {
          cell.classList.add('ring-4', 'ring-red-600', 'ring-inset', 'king-check');
        }
      }
    }

    updateStatusUI();
  }

  function updateStatusUI() {
    const isWhite = currentPlayer === 'w';
    turnDotEl.style.background = isWhite ? '#ffffff' : '#1e293b';
    turnDotEl.classList.toggle('ring-slate-300', true);
    turnDotEl.style.boxShadow = isWhite
      ? 'inset 0 1px 2px rgba(0,0,0,0.2), 0 0 0 2px #cbd5e1'
      : 'inset 0 1px 2px rgba(255,255,255,0.15), 0 0 0 2px #cbd5e1';
    turnTextEl.textContent = isWhite ? 'White' : 'Black';

    const inCheck = isInCheck(board, currentPlayer);
    const allMoves = getAllLegalMoves(currentPlayer);
    const hasMoves = allMoves.length > 0;

    let html = '';
    if (gameOver) return;

    if (!hasMoves && inCheck) {
      html = `<p class="text-sm font-semibold text-rose-600">Checkmate!</p>`;
    } else if (!hasMoves) {
      html = `<p class="text-sm font-semibold text-amber-600">Stalemate</p>`;
    } else if (inCheck) {
      html = `<p class="text-sm font-semibold text-rose-500">⚠ Check!</p>`;
    } else {
      html = `<p class="text-sm text-slate-500">Game in progress</p>`;
    }
    statusTextEl.innerHTML = html;
  }

  function onCellClick(e) {
    if (gameOver || isAnimating) return;
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

  function pieceSpanClasses(piece) {
    const color = pieceColor(piece);
    const isWhiteP = color === 'w';
    const textColor = isWhiteP ? 'text-white' : 'text-slate-900';
    const stroke = isWhiteP ? 'piece-outline-dark' : 'piece-outline-light';
    return `text-3xl sm:text-4xl md:text-5xl pointer-events-none select-none ${textColor} ${stroke}`;
  }

  function spawnGhost(piece, fromCell, toCell) {
    const rectFrom = fromCell.getBoundingClientRect();
    const rectTo = toCell.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'move-ghost';
    ghost.style.left = `${rectFrom.left}px`;
    ghost.style.top = `${rectFrom.top}px`;
    ghost.style.width = `${rectFrom.width}px`;
    ghost.style.height = `${rectFrom.height}px`;
    ghost.innerHTML = `<span class="${pieceSpanClasses(piece)}" style="line-height:1">${pieceContent(piece)}</span>`;
    document.body.appendChild(ghost);
    const dx = rectTo.left - rectFrom.left;
    const dy = rectTo.top - rectFrom.top;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ghost.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    });
    activeGhosts.push(ghost);
    return ghost;
  }

  function hidePiece(cell) {
    const span = cell.querySelector('.piece-glyph');
    if (span) span.style.opacity = '0';
  }

  function clearGhosts() {
    activeGhosts.forEach(g => g.remove());
    activeGhosts = [];
  }

  function makeMove(move) {
    if (isAnimating || gameOver) return;

    const fromR = move.fromR, fromC = move.fromC;
    const toR = move.toR, toC = move.toC;
    const movingPiece = board[fromR][fromC];

    const fromCell = boardEl.children[fromR * 8 + fromC];
    const toCell = boardEl.children[toR * 8 + toC];

    let rookGhost = null;
    if (move.castle) {
      const rank = move.toR;
      const rookFromC = move.castle === 'K' ? 7 : 0;
      const rookToC = move.castle === 'K' ? 5 : 3;
      rookGhost = {
        piece: board[rank][rookFromC],
        from: boardEl.children[rank * 8 + rookFromC],
        to: boardEl.children[rank * 8 + rookToC],
        toCell: boardEl.children[rank * 8 + rookToC]
      };
    }

    const result = applyMove(board, move, castlingRights, enPassantTarget);
    board = result.board;
    castlingRights = result.castlingRights;
    enPassantTarget = result.enPassant;

    const movingPieceAtDest = board[toR][toC];
    const captured = move.enPassant ? 'P' : pieceType(board[toR][toC]);
    if (pieceType(movingPieceAtDest) === 'P' || captured) {
      halfmoveClock = 0;
    } else {
      halfmoveClock++;
    }

    currentPlayer = currentPlayer === 'w' ? 'b' : 'w';
    selectedSquare = null;
    legalMovesCache = [];

    const inCheck = isInCheck(board, currentPlayer);
    const allMoves = getAllLegalMoves(currentPlayer);
    const gameOverType = allMoves.length === 0 ? (inCheck ? 'checkmate' : 'stalemate') : null;

    isAnimating = true;
    moveAnimToken++;
    const token = moveAnimToken;

    renderBoard();

    hidePiece(toCell);
    if (rookGhost) hidePiece(rookGhost.toCell);

    const ghosts = [spawnGhost(movingPiece, fromCell, toCell)];
    if (rookGhost) ghosts.push(spawnGhost(rookGhost.piece, rookGhost.from, rookGhost.to));

    let finished = false;
    const finish = () => {
      if (finished || token !== moveAnimToken) return;
      finished = true;
      clearGhosts();
      isAnimating = false;
      renderBoard();
      if (gameOverType) {
        gameOver = true;
        showGameOver(gameOverType);
      }
    };

    const fallbackTimer = setTimeout(finish, 320);
    ghosts.forEach(g => g.addEventListener('transitionend', () => {
      if (!finished) {
        clearTimeout(fallbackTimer);
        finish();
      }
    }));
  }

  function showGameOver(type) {
    gameOverModal.classList.remove('hidden');
    gameOverModal.classList.add('flex');
    if (type === 'checkmate') {
      const winner = currentPlayer === 'w' ? 'Black' : 'White';
      modalIconEl.textContent = currentPlayer === 'w' ? '♚' : '♔';
      modalTitleEl.textContent = 'Checkmate!';
      modalMessageEl.textContent = `${winner} wins the game.`;
      statusTextEl.innerHTML = `<p class="text-sm font-bold text-rose-600">🏆 ${winner} wins!</p>`;
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
    moveAnimToken++;
    clearGhosts();
    isAnimating = false;
    board = initialBoard();
    currentPlayer = 'w';
    selectedSquare = null;
    legalMovesCache = [];
    gameOver = false;
    castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    enPassantTarget = null;
    halfmoveClock = 0;
    hideGameOver();
    createBoard();
    renderBoard();
  }

  function initializeGame() {
    createBoard();
    resetGame();
    newGameBtn.addEventListener('click', resetGame);
    modalPlayAgain.addEventListener('click', resetGame);
    gameOverModal.addEventListener('click', (e) => {
      if (e.target === gameOverModal) hideGameOver();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
  } else {
    initializeGame();
  }
})();
