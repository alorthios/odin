const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
const state = { playerId: null, room: null, hand: [], selected: new Set(), pickupCardId: null, name: "", roomCode: "", authenticated: false, pendingRoomCode: null, timer: null, lastEventId: 0, soundEnabled: true };
const $ = (selector) => document.querySelector(selector);
const send = (message) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function triggerEffect(className) {
  const element = document.querySelector(".app-shell");
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), 1200);
}

function playImpactSound(count) {
  if (!state.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const base = [180, 240, 320, 90, 55][Math.min(count, 5) - 1];
  oscillator.type = count >= 4 ? "sawtooth" : "triangle";
  oscillator.frequency.setValueAtTime(base, now);
  oscillator.frequency.exponentialRampToValueAtTime(base * (count >= 4 ? 2.8 : 1.8), now + .18);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(count >= 4 ? .22 : .12, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + (count >= 4 ? .6 : .28));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + (count >= 4 ? .65 : .32));
  oscillator.addEventListener("ended", () => context.close(), { once: true });
}

function triggerPlayEffect(count) {
  const tier = Math.min(count, 5);
  triggerEffect(`play-tier-${tier}`);
  playImpactSound(count);
  const labels = ["Carte posée", "Double impact", "Combo sauvage", "MJOLNIR !", "RAGNARÖK !"];
  showToast(`${labels[tier - 1]} — ${count} carte${count > 1 ? "s" : ""}`);
}

function renderPlayers() {
  const room = state.room;
  $("#playerList").innerHTML = room.players.map((player, index) => {
    const active = player.id === room.currentPlayerId;
    const colors = ["pink", "yellow", "cyan", "orange", "violet", "pink"];
    return `<div class="player ${active ? "active" : ""}">
      <div class="player-avatar avatar-${colors[index]}">${player.name.slice(0, 1).toUpperCase()}</div>
      <div class="player-info"><strong>${escapeHtml(player.name)} ${player.id === state.playerId ? "<small>TOI</small>" : ""}</strong><span><i class="mini-dot ${colors[index]}-dot"></i>${active ? "À son tour" : "Prête"} · ${player.cardCount} carte${player.cardCount > 1 ? "s" : ""}</span></div>
      <div class="score">${String(player.score).padStart(2, "0")} <small>pts</small></div>
    </div>`;
  }).join("");
  const me = room.players.find((player) => player.id === state.playerId);
  $(".player-count").textContent = `${room.players.length}/6`;
  const canStart = Boolean(room.players.length >= 2 && !room.started && !room.startingAt);
  $("#startGameButton").disabled = !canStart;
  const lobbyMessage = room.started ? "La partie est lancée !" : room.startingAt ? `Lancement dans ${formatStartCountdown(room.startingAt)}…` : room.players.length < 2 ? "Encore 1 joueur pour commencer…" : "N'importe quel joueur peut lancer la partie !";
  $("#lobbyMessage").textContent = lobbyMessage;
  $("#lobbyScreenMessage").textContent = lobbyMessage;
  $("#lobbyPlayers").innerHTML = room.players.map((player) => `<span class="lobby-player-chip">${escapeHtml(player.name)}</span>`).join("");
  $("#lobbyStartButton").disabled = !canStart;
  if (room.started) $("#lobbyScreen").classList.add("hidden");
  if (room.started) {
    $("#turnTimer").textContent = room.currentPlayerId === state.playerId ? formatRemaining(room.turnEndsAt) : "ATTENDS";
    $(".turn-status strong").textContent = room.currentPlayerId === state.playerId ? "À TOI DE JOUER" : "TOUR ADVERSE";
  }
  updatePlayButton();
}

function renderHand() {
  $("#cardCount").textContent = `(${state.hand.length} carte${state.hand.length > 1 ? "s" : ""})`;
  $("#hand").innerHTML = state.hand.map((card) => `<button class="card ${card.color}-card ${state.selected.has(card.id) ? "selected" : ""}" data-id="${card.id}" type="button" aria-label="Carte ${card.value} ${card.color}" aria-pressed="${state.selected.has(card.id)}"><span class="card-value">${card.value}</span><span class="card-suit">${symbol(card.color)}</span><span class="card-label">ODIN</span></button>`).join("");
  $("#hand").querySelectorAll(".card").forEach((button) => button.addEventListener("click", () => {
    if (state.room?.currentPlayerId !== state.playerId) return;
    const id = button.dataset.id;
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    renderHand();
    updatePlayButton();
  }));
  updatePlayButton();
}

function updatePlayButton() {
  const count = state.selected.size;
  const isMyTurn = state.room?.currentPlayerId === state.playerId;
  $("#playButton").disabled = !count || !isMyTurn;
  $("#passButton").disabled = !isMyTurn;
  $("#playButton").innerHTML = count ? `JOUER ${count} CARTE${count > 1 ? "S" : ""} <span>⚡</span>` : "JOUER LA COMBO <span>⚡</span>";
}

function renderTable() {
  const table = state.room.table;
  const pendingPickup = state.room.pendingPickup;
  const canPickup = pendingPickup?.playerId === state.playerId;
  $("#comboValue").textContent = table ? `x${table.cards.length} • ${table.value}` : "—";
  const isMyTurn = state.room.currentPlayerId === state.playerId;
  $(".board").classList.toggle("inactive-board", !isMyTurn);
  $("#turnAxe").classList.toggle("visible", isMyTurn);
  $("#turnAxe").setAttribute("aria-hidden", String(!isMyTurn));
  $("#tableStatus").textContent = isMyTurn ? "À TOI DE JOUER" : table ? `TOUR DE ${table.playerName.toUpperCase()}` : "EN ATTENTE DU TOUR";
  const tableCards = table ? `<div class="played-cards">${table.cards.map((card) => `<div class="card ${card.color}-card selected"><span class="card-value">${card.value}</span><span class="card-suit">${symbol(card.color)}</span><span class="card-label">${escapeHtml(table.playerName)}</span></div>`).join("")}</div>` : "";
  const pickupCards = canPickup ? `<div class="pickup-cards">${pendingPickup.cards.map((card) => `<button class="card ${card.color}-card pickup-card" data-pickup-id="${card.id}" type="button" aria-label="Ramasser la carte ${card.value}"><span class="card-value">${card.value}</span><span class="card-suit">${symbol(card.color)}</span><span class="card-label">RAMASSER</span></button>`).join("")}</div><p class="pickup-note">Pose effectuée ! Choisis maintenant la carte que tu ramasses.</p>` : "";
  $("#playedArea").innerHTML = table ? `${tableCards}${pickupCards}<p class="table-caption">${canPickup ? "Ta combinaison est posée sur la table." : "Combinaison posée par " + escapeHtml(table.playerName)}</p>` : `<div class="empty-board"><strong>Aucune combinaison posée</strong><small>${isMyTurn ? "C'est ton tour : ouvre avec une carte." : "En attente du premier joueur."}</small></div>`;
  $("#playedArea").querySelectorAll("[data-pickup-id]").forEach((button) => button.addEventListener("click", () => {
    send({ type: "pickup", cardId: button.dataset.pickupId });
  }));
}

function applyState(room, hand) {
  const previousAction = state.room?.lastAction;
  state.room = room;
  state.hand = hand;
  state.selected.clear();
  state.pickupCardId = null;
  state.roomCode = room.roomCode;
  $("#roomCode").textContent = `#${room.roomCode}`;
  $("#playerBadge").textContent = state.name;
  $("#playerBadge").setAttribute("aria-label", `Profil de ${state.name}`);
  renderPlayers();
  renderHand();
  renderTable();
  renderGrimoire();
  if (room.lastAction && room.lastAction !== previousAction) {
    addActivity(room.lastAction);
  }

  function renderGrimoire() {
    const list = $("#activityList");
    const entries = state.room.chat.map((message) => `<div class="activity chat-entry"><span class="activity-icon icon-cyan">💬</span><p><strong>${escapeHtml(message.playerName)}</strong> ${escapeHtml(message.text)}<small>Message du salon</small></p></div>`);
    if (state.room.lastAction) entries.unshift(`<div class="activity"><span class="activity-icon icon-yellow">⚡</span><p>${escapeHtml(state.room.lastAction)}<small>Activité du jeu</small></p></div>`);
    list.innerHTML = entries.join("") || `<div class="activity"><span class="activity-icon icon-yellow">⚡</span><p>Le fjord attend les joueurs<small>À l'instant</small></p></div>`;
    list.scrollTop = list.scrollHeight;
  }
  if (room.event && room.event.id > state.lastEventId) {
    state.lastEventId = room.event.id;
    if (room.event.type === "play") triggerPlayEffect(room.event.count);
    if (room.event.type === "victory") {
      triggerEffect("victory-effect");
      showToast(`${room.event.winnerName} remporte la manche ! Scores mis à jour.`);
    }
  }
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(updateTimer, 250);
  updateTimer();
}

function formatRemaining(turnEndsAt) {
  if (!turnEndsAt) return "00:00";
  const seconds = Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));
  return `00:${String(seconds).padStart(2, "0")}`;
}

function updateTimer() {
  if (!state.room) return;
  if (state.room.startingAt && !state.room.started) {
    const countdown = `Lancement dans ${formatStartCountdown(state.room.startingAt)}…`;
    $("#lobbyMessage").textContent = countdown;
    $("#lobbyScreenMessage").textContent = countdown;
  }
  if (!state.room.started) return;
  const isMyTurn = state.room.currentPlayerId === state.playerId;
  const remaining = formatRemaining(state.room.turnEndsAt);
  $("#turnTimer").textContent = isMyTurn ? remaining : "ATTENDS";
  const percentage = state.room.turnEndsAt ? Math.max(0, Math.min(100, ((state.room.turnEndsAt - Date.now()) / 60000) * 100)) : 0;
  $(".round-progress span").style.width = `${percentage}%`;
  if (isMyTurn && formatRemaining(state.room.turnEndsAt) === "00:00") {
    $("#playButton").disabled = true;
    $("#passButton").disabled = true;
  }

  function formatStartCountdown(startingAt) {
    return Math.max(1, Math.ceil((startingAt - Date.now()) / 1000));
  }
  const currentRoom = state.room;
  $("#roundLabel").textContent = `MANCHE ${currentRoom.round}`;
  $("#roundNumber").textContent = currentRoom.round;
  const nextPlayer = currentRoom.players.find((player) => player.id === currentRoom.currentPlayerId);
  $("#nextPlayer").textContent = nextPlayer ? escapeHtml(nextPlayer.name) : "—";
}

function addActivity(text, icon = "⚡", iconClass = "icon-yellow") {
  const item = document.createElement("div");
  item.className = "activity";
  item.innerHTML = `<span class="activity-icon ${iconClass}">${icon}</span><p>${escapeHtml(text)}<small>À l'instant</small></p>`;
  $("#activityList").prepend(item);
}

function symbol(color) {
  return { pink: "ᛟ", yellow: "✦", cyan: "⚔", orange: "ᚦ", violet: "✹", lime: "◈" }[color] || "✦";
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }

function renderWaitingRooms(rooms) {
  const list = $("#waitingRoomsList");
  $("#waitingRoomsStatus").textContent = `${rooms.length} monde${rooms.length > 1 ? "s" : ""} visible${rooms.length > 1 ? "s" : ""}`;
  if (!rooms.length) {
    list.innerHTML = `<p class="waiting-rooms-empty">Aucun monde disponible pour le moment.</p>`;
    return;
  }
  list.innerHTML = rooms.map((room) => {
    const status = room.started ? `Partie en cours · ${room.playerCount}/${room.maxPlayers}` : room.startingAt ? "Lancement imminent" : `${room.playerCount}/${room.maxPlayers} joueurs`;
    const current = room.roomCode === state.roomCode && state.playerId;
    const unavailable = room.started || room.startingAt;
    return `<button class="waiting-room-item ${current ? "current" : ""} ${room.started ? "started" : ""}" type="button" data-room-code="${escapeHtml(room.roomCode)}" ${unavailable ? "disabled" : ""}><strong>${escapeHtml(room.worldName)}</strong><span>${current ? "VOUS ÊTES ICI" : status}</span><b>${current ? "MONDE ACTUEL" : room.started ? "OBSERVER" : "REJOINDRE"}</b><small>${escapeHtml(room.worldDescription)}</small></button>`;
  }).join("");
  list.querySelectorAll("[data-room-code]").forEach((button) => button.addEventListener("click", () => {
    const roomCode = button.dataset.roomCode;
    if (roomCode === state.roomCode && state.playerId) {
      showToast("Tu es déjà dans ce monde.");
      return;
    }
    if (state.roomCode && state.playerId) {
      state.pendingRoomCode = roomCode;
      send({ type: "leave" });
      return;
    }
    state.roomCode = roomCode;
    send({ type: "join", roomCode });
    showToast(`Connexion au monde ${roomCode}`);
  }));
}

function resetLobby() {
  state.playerId = null;
  state.room = null;
  state.hand = [];
  state.selected.clear();
  state.roomCode = "";
  const nextRoomCode = state.pendingRoomCode;
  state.pendingRoomCode = null;
  state.authenticated = true;
  $("#roomCode").textContent = "—";
  $("#lobbyPlayers").innerHTML = "";
  $("#lobbyMessage").textContent = "Choisis un monde en attente.";
  $("#lobbyScreenMessage").textContent = "Choisis un monde en attente.";
  $("#lobbyStartButton").disabled = true;
  $("#connectionStatus").textContent = "Monde quitté — choisis un autre monde.";
  $("#playerBadge").textContent = state.name;
  $("#worldsCard").classList.remove("hidden");
  if (nextRoomCode) {
    state.roomCode = nextRoomCode;
    send({ type: "join", roomCode: nextRoomCode });
    showToast(`Connexion au monde ${nextRoomCode}`);
  }
}

socket.addEventListener("open", () => { $("#connectionStatus").textContent = "Connexion sécurisée aux mondes ✓"; });
socket.addEventListener("close", () => { $("#connectionStatus").textContent = "Connexion perdue — recharge la page."; showToast("Connexion au monde interrompue."); });
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "authenticated") {
    state.playerId = message.playerId;
    state.name = message.name;
    state.authenticated = true;
    $("#playerBadge").textContent = state.name;
    $("#playerBadge").setAttribute("aria-label", `Profil de ${state.name}`);
    $("#loginCard").classList.add("hidden");
    $("#worldsCard").classList.remove("hidden");
    $("#connectionStatus").textContent = "Guerrier identifié ✓";
    return;
  }
  if (message.type === "joined") {
    state.playerId = message.playerId;
    $("#connectionStatus").textContent = "Dans le monde ✓";
    return;
  }
  if (message.type === "left") {
    resetLobby();
    return;
  }
  if (message.type === "disconnected") {
    state.authenticated = false;
    state.playerId = null;
    state.room = null;
    state.roomCode = "";
    state.name = "";
    state.hand = [];
    state.selected.clear();
    $("#worldsCard").classList.add("hidden");
    $("#loginCard").classList.remove("hidden");
    $("#lobbyScreen").classList.remove("hidden");
    $("#roomCode").textContent = "—";
    $("#playerBadge").textContent = "";
    $("#nickname").value = "";
    $("#connectionStatus").textContent = "Déconnecté — entre ton pseudo pour revenir.";
    $("#nickname").focus();
    return;
  }
  if (message.type === "waiting-rooms") {
    renderWaitingRooms(message.rooms);
    return;
  }
  if (message.type === "state") {
    state.playerId = message.playerId;
    applyState(message.room, message.hand);
    return;
  }
  if (message.type === "error") showToast(message.message);
});

$("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.name = $("#nickname").value.trim();
  if (state.name.length >= 2) send({ type: "authenticate", name: state.name });
});
$("#startGameButton").addEventListener("click", () => send({ type: "start" }));
$("#lobbyStartButton").addEventListener("click", () => send({ type: "start" }));
function disconnect() {
  if (window.confirm("Te déconnecter et quitter le monde ?")) send({ type: "disconnect" });
}
$("#disconnectButton").addEventListener("click", disconnect);
$("#disconnectGameButton").addEventListener("click", disconnect);
$("#playButton").addEventListener("click", () => {
  send({ type: "play", cardIds: [...state.selected] });
  state.selected.clear();
  state.pickupCardId = null;
});
$("#passButton").addEventListener("click", () => send({ type: "pass" }));
$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  send({ type: "chat", text });
  input.value = "";
  input.focus();
});

const rulesModal = $("#rulesModal");
$("#rulesButton").addEventListener("click", () => rulesModal.showModal());
$("#rulesFooter").addEventListener("click", () => rulesModal.showModal());
$("#closeRules").addEventListener("click", () => rulesModal.close());
$("#closeRulesAction").addEventListener("click", () => rulesModal.close());
$("#soundToggle").addEventListener("click", (event) => {
  state.soundEnabled = !state.soundEnabled;
  event.currentTarget.textContent = state.soundEnabled ? "🔊" : "🔇";
  showToast(state.soundEnabled ? "Effets sonores activés" : "Effets sonores coupés");
});
