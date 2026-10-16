import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8080);
const roomCode = "FJORD-72";
const maxPlayers = 6;
const cardsPerPlayer = 9;
const turnDurationMs = 60_000;
const colors = ["pink", "yellow", "cyan", "orange", "violet", "lime"];
const rooms = new Map([[roomCode, createRoom()]]);

function createRoom() {
  return { players: new Map(), started: false, round: 1, scores: new Map(), table: null, currentPlayerId: null, turnEndsAt: null, turnTimer: null, passCount: 0, lastAction: "Le salon attend ses champions." };
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
    roomCode,
    started: room.started,
    round: room.round,
    currentPlayerId: room.currentPlayerId,
    turnEndsAt: room.turnEndsAt,
    table: room.table ? { cards: room.table.cards, value: room.table.value, playerName: room.table.playerName } : null,
    lastAction: room.lastAction,
    players: [...room.players.values()].map((player) => ({
      id: player.id, name: player.name, ready: player.ready, host: player.host,
      cardCount: player.hand.length, score: room.scores.get(player.id) || 0
    }))
  };
}

function syncRoom(room) {
  room.players.forEach((player) => send(player.socket, { type: "state", room: publicRoom(room), hand: player.hand }));
}

function error(socket, message) {
  send(socket, { type: "error", message });
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
  room.passCount = 0;
  room.currentPlayerId = [...room.players.keys()][0];
  scheduleTurn(room);
}

function startGame(room) {
  if (room.players.size < 2) return;
  room.started = true;
  room.round = 1;
  room.players.forEach((player) => room.scores.set(player.id, 0));
  dealRound(room);
  room.lastAction = "La manche 1 commence. Le premier joueur ouvre.";
  syncRoom(room);
}

function nextPlayer(room) {
  const ids = [...room.players.keys()];
  const currentIndex = ids.indexOf(room.currentPlayerId);
  room.currentPlayerId = ids[(currentIndex + 1) % ids.length];
}

function finishRound(room, winner) {
  room.players.forEach((player) => {
    if (player.id !== winner.id) room.scores.set(player.id, (room.scores.get(player.id) || 0) + player.hand.length);
  });
  const gameOver = [...room.scores.values()].some((score) => score >= 15);
  if (gameOver) {
    room.started = false;
    clearTurnTimer(room);
    room.turnEndsAt = null;
    room.currentPlayerId = null;
    room.lastAction = `${winner.name} remporte la manche. La partie est terminée.`;
    return;
  }

  function advanceTurn(room) {
    const ids = [...room.players.keys()];
    const currentIndex = ids.indexOf(room.currentPlayerId);
    room.currentPlayerId = ids[(currentIndex + 1) % ids.length];
    scheduleTurn(room);
  }
  room.round += 1;
  dealRound(room);
  room.lastAction = `${winner.name} remporte la manche. Nouvelle distribution.`;
}

function handleMessage(socket, message) {
  const room = rooms.get(roomCode);
  if (message.type === "join") {
    const name = String(message.name || "").trim().slice(0, 18);
    if (name.length < 2) return error(socket, "Choisis un pseudo de 2 caractères minimum.");
    if (room.started) return error(socket, "La partie est déjà en cours.");
    if (room.players.size >= maxPlayers) return error(socket, "Le salon est complet.");
    if ([...room.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) return error(socket, "Ce pseudo est déjà utilisé.");
    const id = crypto.randomUUID();
    const player = { id, name, socket, host: room.players.size === 0, ready: true, hand: [] };
    room.players.set(id, player);
    socket.playerId = id;
    send(socket, { type: "joined", playerId: id, roomCode });
    room.lastAction = `${name} a rejoint le fjord.`;
    return syncRoom(room);
  }
  const player = room.players.get(socket.playerId);
  if (!player) return error(socket, "Rejoins le salon avant de jouer.");
  if (message.type === "start") {
    if (!player.host) return error(socket, "Seul l'hôte peut lancer la partie.");
    if (room.players.size < 2) return error(socket, "Il faut au moins 2 joueurs pour commencer.");
    return startGame(room);
  }
  if (!room.started) return error(socket, "La partie n'a pas encore commencé.");
  if (message.type === "pass") {
    if (room.currentPlayerId !== player.id) return error(socket, "Ce n'est pas ton tour.");
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
    const ids = Array.isArray(message.cardIds) ? message.cardIds : [];
    const cards = ids.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean);
    if (cards.length !== ids.length || new Set(ids).size !== ids.length) return error(socket, "Cette combinaison n'est pas dans ta main.");
    if (!isValidCombination(cards)) return error(socket, "Les cartes doivent être de même couleur ou de même valeur.");
    if (!room.table && cards.length !== 1 && cards.length !== player.hand.length) return error(socket, "Pour ouvrir, pose une carte ou toute ta main.");
    if (!canBeat(cards, room.table)) return error(socket, "Cette combinaison ne bat pas celle de la table.");
    const pickupCardId = message.pickupCardId;
    if (room.table && player.hand.length > cards.length && !room.table.cards.some((card) => card.id === pickupCardId)) return error(socket, "Choisis la carte à ramasser dans la combinaison précédente.");
    player.hand = player.hand.filter((card) => !ids.includes(card.id));
    const previousTable = room.table;
    room.table = { cards, value: combinationValue(cards), playerName: player.name };
    room.passCount = 0;
    if (previousTable && player.hand.length > 0) player.hand.push(previousTable.cards.find((card) => card.id === pickupCardId));
    room.lastAction = `${player.name} joue ${cards.length} carte${cards.length > 1 ? "s" : ""}.`;
    if (player.hand.length === 0) finishRound(room, player);
    else advanceTurn(room);
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
  socket.on("message", (raw) => {
    try { handleMessage(socket, JSON.parse(raw.toString())); } catch { error(socket, "Message invalide."); }
  });
  socket.on("close", () => {
    const room = rooms.get(roomCode);
    const player = room.players.get(socket.playerId);
    if (!player) return;
    room.players.delete(player.id);
    if (room.players.size === 0) { rooms.set(roomCode, createRoom()); return; }
    if (player.host) room.players.values().next().value.host = true;
    room.lastAction = `${player.name} a quitté le fjord.`;
    if (!room.started) syncRoom(room);
  });
});

server.listen(port, () => console.log(`ODIN server listening on port ${port}`));
