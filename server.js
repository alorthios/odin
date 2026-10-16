import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8080);
const maxPlayers = 6;
const cardsPerPlayer = 9;
const turnDurationMs = 60_000;
const startCountdownMs = 5_000;
const colors = ["pink", "yellow", "cyan", "orange", "violet", "lime"];
const rooms = new Map();
const waitingSockets = new Set();

function createRoom(code) {
  return { code, players: new Map(), started: false, startingAt: null, startTimer: null, round: 1, scores: new Map(), table: null, pendingPickup: null, currentPlayerId: null, turnEndsAt: null, turnTimer: null, passCount: 0, eventId: 0, event: null, chat: [], lastAction: "Le salon attend ses champions." };
}

function createDeck() {
  return colors.flatMap((color) => Array.from({ length: 9 }, (_, index) => ({ id: `${color}-${index + 1}`, color, value: index + 1 })));
}

function shuffle(cards) {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room, message) {
  room.players.forEach((player) => send(player.socket, message));
}

function publicRoom(room) {
  return {
    roomCode: room.code,
    started: room.started,
    startingAt: room.startingAt,
    round: room.round,
    currentPlayerId: room.currentPlayerId,
    turnEndsAt: room.turnEndsAt,
    table: room.table ? { cards: room.table.cards, value: room.table.value, playerName: room.table.playerName } : null,
    pendingPickup: room.pendingPickup ? { playerId: room.pendingPickup.playerId, cards: room.pendingPickup.cards } : null,
    event: room.event,
    chat: room.chat,
    lastAction: room.lastAction,
    players: [...room.players.values()].map((player) => ({
      id: player.id, name: player.name, ready: player.ready, host: player.host,
      cardCount: player.hand.length, score: room.scores.get(player.id) || 0
    }))
  };
}

function syncRoom(room) {
  room.players.forEach((player) => send(player.socket, { type: "state", playerId: player.id, room: publicRoom(room), hand: player.hand }));
}

function waitingRooms() {
  return [...rooms.values()]
    .filter((room) => !room.started)
    .map((room) => ({
      roomCode: room.code,
      playerCount: room.players.size,
      maxPlayers,
      startingAt: room.startingAt
    }))
    .sort((first, second) => second.playerCount - first.playerCount || first.roomCode.localeCompare(second.roomCode));
}

function syncWaitingRooms() {
  const message = { type: "waiting-rooms", rooms: waitingRooms() };
  waitingSockets.forEach((socket) => send(socket, message));
}

function error(socket, message) {
  send(socket, { type: "error", message });
}

function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
}

function addChat(room, player, text) {
  room.chat.push({ id: crypto.randomUUID(), playerId: player.id, playerName: player.name, text, createdAt: Date.now() });
  if (room.chat.length > 60) room.chat.shift();
}

function combinationValue(cards) {
  return Number([...cards].sort((a, b) => b.value - a.value).map((card) => card.value).join(""));
}

function isValidCombination(cards) {
  if (!cards.length) return false;
  const sameColor = cards.every((card) => card.color === cards[0].color);
  const sameValue = cards.every((card) => card.value === cards[0].value);
  return sameColor || sameValue;
}

function canBeat(cards, previous) {
  if (!previous) return true;
  const correctSize = cards.length === previous.cards.length || cards.length === previous.cards.length + 1;
  return correctSize && combinationValue(cards) > previous.value;
}

function clearTurnTimer(room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
}

function scheduleTurn(room) {
  clearTurnTimer(room);
  if (!room.started || !room.currentPlayerId) {
    room.turnEndsAt = null;
    return;
  }
  room.turnEndsAt = Date.now() + turnDurationMs;
  room.turnTimer = setTimeout(() => {
    if (!room.started || Date.now() < room.turnEndsAt) return scheduleTurn(room);
    const player = room.players.get(room.currentPlayerId);
    if (!player) return;
    room.lastAction = `${player.name} n'a pas joué à temps.`;
    advanceTurn(room);
    syncRoom(room);
  }, turnDurationMs + 50);
}

function dealRound(room) {
  const deck = shuffle(createDeck());
  room.players.forEach((player) => { player.hand = deck.splice(0, cardsPerPlayer); player.ready = true; });
  room.table = null;
  room.pendingPickup = null;
  room.passCount = 0;
  room.currentPlayerId = [...room.players.keys()][0];
  scheduleTurn(room);
}

function setEvent(room, type, data = {}) {
  room.event = { id: ++room.eventId, type, ...data };
}

function startGame(room) {
  if (room.players.size < 2 || room.startingAt) return;
  room.startingAt = Date.now() + startCountdownMs;
  room.lastAction = "Le lancement est confirmé. La bataille commence dans 5 secondes.";
  syncRoom(room);
  syncWaitingRooms();
  room.startTimer = setTimeout(() => {
    room.startTimer = null;
    room.startingAt = null;
    if (room.players.size < 2 || room.started) {
      room.lastAction = "Lancement annulé : il faut au moins 2 joueurs.";
      return syncRoom(room);
    }
    beginGame(room);
  }, startCountdownMs);
}

function beginGame(room) {
  room.started = true;
  room.round = 1;
  room.players.forEach((player) => room.scores.set(player.id, 0));
  dealRound(room);
  room.lastAction = "La manche 1 commence. Le premier joueur ouvre.";
  setEvent(room, "round-start", { round: room.round });
  syncRoom(room);
  syncWaitingRooms();
}

function finishRound(room, winner) {
  const penalties = {};
  room.players.forEach((player) => {
    penalties[player.id] = player.id === winner.id ? 0 : player.hand.length;
    if (player.id !== winner.id) room.scores.set(player.id, (room.scores.get(player.id) || 0) + penalties[player.id]);
  });
  const penaltyText = [...room.players.values()]
    .filter((player) => penalties[player.id] > 0)
    .map((player) => `${player.name} +${penalties[player.id]}`)
    .join(", ");
  setEvent(room, "victory", { winnerId: winner.id, winnerName: winner.name, penalties, scores: Object.fromEntries(room.scores) });
  const gameOver = [...room.scores.values()].some((score) => score >= 15);
  if (gameOver) {
    room.started = false;
    clearTurnTimer(room);
    room.turnEndsAt = null;
    room.currentPlayerId = null;
    room.lastAction = `${winner.name} remporte la manche. ${penaltyText || "Aucune pénalité"}. La partie est terminée.`;
    return;
  }

  room.round += 1;
  dealRound(room);
  room.lastAction = `${winner.name} remporte la manche. ${penaltyText || "Aucune pénalité"}. Nouvelle distribution.`;
}

function advanceTurn(room) {
  const ids = [...room.players.keys()];
  const currentIndex = ids.indexOf(room.currentPlayerId);
  room.currentPlayerId = ids[(currentIndex + 1) % ids.length];
  scheduleTurn(room);
}

function handleMessage(socket, message) {
  if (message.type === "join") {
    const name = String(message.name || "").trim().slice(0, 18);
    const requestedCode = normalizeRoomCode(message.roomCode);
    if (!requestedCode) return error(socket, "Saisis le code du salon à rejoindre ou à créer.");
    if (!/^[A-Z0-9-]{4,12}$/.test(requestedCode)) return error(socket, "Le PIN du salon doit contenir 4 à 12 caractères.");
    const room = rooms.get(requestedCode) || createRoom(requestedCode);
    if (name.length < 2) return error(socket, "Choisis un pseudo de 2 caractères minimum.");
    if (room.started || room.startingAt) return error(socket, "Le lancement de la partie est déjà confirmé.");
    if (room.players.size >= maxPlayers) return error(socket, "Le salon est complet.");
    if ([...room.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) return error(socket, "Ce pseudo est déjà utilisé.");
    const id = crypto.randomUUID();
    const player = { id, name, socket, host: room.players.size === 0, ready: true, hand: [] };
    room.players.set(id, player);
    socket.playerId = id;
    socket.roomCode = requestedCode;
    rooms.set(requestedCode, room);
    send(socket, { type: "joined", playerId: id, roomCode: requestedCode });
    room.lastAction = `${name} a rejoint le fjord.`;
    syncRoom(room);
    return syncWaitingRooms();
  }
  const room = rooms.get(socket.roomCode);
  const player = room?.players.get(socket.playerId);
  if (!player) return error(socket, "Rejoins le salon avant de jouer.");
  if (message.type === "start") {
    if (room.players.size < 2) return error(socket, "Il faut au moins 2 joueurs pour commencer.");
    if (room.startingAt) return error(socket, "Le lancement est déjà en cours.");
    return startGame(room);
  }
  if (message.type === "chat") {
    const text = String(message.text || "").trim().slice(0, 240);
    if (!text) return error(socket, "Écris un message avant de l'envoyer.");
    addChat(room, player, text);
    return syncRoom(room);
  }
  if (!room.started) return error(socket, "La partie n'a pas encore commencé.");
  if (message.type === "pass") {
    if (room.currentPlayerId !== player.id) return error(socket, "Ce n'est pas ton tour.");
    if (room.pendingPickup) return error(socket, "Ramasse d'abord une carte avant de terminer ton tour.");
    room.passCount += 1;
    room.lastAction = `${player.name} passe son tour.`;
    if (room.passCount >= room.players.size - 1 && room.table) {
      room.table = null;
      room.passCount = 0;
      room.lastAction += " La table est réinitialisée.";
    }
    advanceTurn(room);
    return syncRoom(room);
  }
  if (message.type === "play") {
    if (room.currentPlayerId !== player.id) return error(socket, "Ce n'est pas ton tour.");
    if (room.pendingPickup) return error(socket, "Choisis d'abord la carte que tu ramasses.");
    const ids = Array.isArray(message.cardIds) ? message.cardIds : [];
    const cards = ids.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean);
    if (cards.length !== ids.length || new Set(ids).size !== ids.length) return error(socket, "Cette combinaison n'est pas dans ta main.");
    if (!isValidCombination(cards)) return error(socket, "Les cartes doivent être de même couleur ou de même valeur.");
    if (!room.table && cards.length !== 1 && cards.length !== player.hand.length) return error(socket, "Pour ouvrir, pose une carte ou toute ta main.");
    if (!canBeat(cards, room.table)) return error(socket, "Cette combinaison ne bat pas celle de la table.");
    player.hand = player.hand.filter((card) => !ids.includes(card.id));
    const previousTable = room.table;
    room.table = { cards, value: combinationValue(cards), playerName: player.name };
    room.passCount = 0;
    room.lastAction = `${player.name} joue ${cards.length} carte${cards.length > 1 ? "s" : ""}.`;
    setEvent(room, "play", { playerId: player.id, playerName: player.name, count: cards.length });
    if (player.hand.length === 0) finishRound(room, player);
    else if (previousTable) {
      room.pendingPickup = { playerId: player.id, cards: previousTable.cards };
    } else advanceTurn(room);
    return syncRoom(room);
  }
  if (message.type === "pickup") {
    if (!room.pendingPickup || room.pendingPickup.playerId !== player.id) return error(socket, "Aucune carte ne peut être ramassée maintenant.");
    const picked = room.pendingPickup.cards.find((card) => card.id === message.cardId);
    if (!picked) return error(socket, "Choisis une carte de la combinaison précédente.");
    player.hand.push(picked);
    room.pendingPickup = null;
    room.lastAction = `${player.name} ramasse le ${picked.value}.`;
    setEvent(room, "pickup", { playerId: player.id, playerName: player.name, card: picked });
    advanceTurn(room);
    return syncRoom(room);
  }
  error(socket, "Action inconnue.");
}

const server = createServer(async (request, response) => {
  if (request.url === "/health") return response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("ok\n");
  const requested = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const filePath = normalize(join(root, requested));
  if (!filePath.startsWith(root)) return response.writeHead(403).end();
  try {
    const body = await readFile(filePath);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

const webSockets = new WebSocketServer({ server });
webSockets.on("connection", (socket) => {
  waitingSockets.add(socket);
  send(socket, { type: "waiting-rooms", rooms: waitingRooms() });
  socket.on("message", (raw) => {
    try { handleMessage(socket, JSON.parse(raw.toString())); } catch { error(socket, "Message invalide."); }
  });
  socket.on("close", () => {
    const room = rooms.get(socket.roomCode);
    waitingSockets.delete(socket);
    if (!room) {
      return syncWaitingRooms();
    }
    const player = room.players.get(socket.playerId);
    if (!player) return syncWaitingRooms();
    room.players.delete(player.id);
    if (room.players.size === 0) {
      room.lastAction = "Le salon attend ses champions.";
      syncWaitingRooms();
      return;
    }
    if (player.host) room.players.values().next().value.host = true;
    room.lastAction = `${player.name} a quitté le fjord.`;
    if (room.startingAt && room.players.size < 2) {
      clearTimeout(room.startTimer);
      room.startTimer = null;
      room.startingAt = null;
    }
    syncRoom(room);
    syncWaitingRooms();
  });
});

server.listen(port, () => console.log(`ODIN server listening on port ${port}`));
