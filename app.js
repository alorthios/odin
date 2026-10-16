const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
const state = { playerId: null, room: null, hand: [], selected: new Set(), name: "" };
const $ = (selector) => document.querySelector(selector);
const send = (message) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderPlayers() {
  const room = state.room;
  $("#playerList").innerHTML = room.players.map((player, index) => {
    const active = player.id === room.currentPlayerId;
    const colors = ["pink", "yellow", "cyan", "orange", "violet", "pink"];
    return `<div class="player ${active ? "active" : ""}">
      <div class="player-avatar avatar-${colors[index]}">${player.name.slice(0, 1).toUpperCase()}</div>
      <div class="player-info"><strong>${escapeHtml(player.name)} ${player.id === state.playerId ? "<small>TOI</small>" : ""}</strong><span><i class="mini-dot ${colors[index]}-dot"></i>${active ? "À son tour" : "Prête"}</span></div>
      <div class="score">${String(player.score).padStart(2, "0")} <small>pts</small></div>
    </div>`;
  }).join("");
  const me = room.players.find((player) => player.id === state.playerId);
  const canStart = Boolean(me?.host && room.players.length >= 2 && !room.started);
  $("#startGameButton").disabled = !canStart;
  $("#lobbyMessage").textContent = room.started ? "La partie est lancée !" : room.players.length < 2 ? "Encore 1 joueur pour commencer…" : me?.host ? "Vous pouvez lancer la partie !" : "En attente du lancement par l’hôte…";
  if (room.started) $("#lobbyScreen").classList.add("hidden");
  if (room.started) {
    $("#turnTimer").textContent = room.currentPlayerId === state.playerId ? "À TOI" : "ATTENDS";
    $(".turn-status strong").textContent = room.currentPlayerId === state.playerId ? "À TOI DE JOUER" : "TOUR ADVERSE";
  }
}

function renderHand() {
  $("#cardCount").textContent = `(${state.hand.length} carte${state.hand.length > 1 ? "s" : ""})`;
  $("#hand").innerHTML = state.hand.map((card) => `<button class="card ${card.color}-card ${state.selected.has(card.id) ? "selected" : ""}" data-id="${card.id}" type="button" aria-label="Carte ${card.value} ${card.color}" aria-pressed="${state.selected.has(card.id)}"><span class="card-value">${card.value}</span><span class="card-suit">${symbol(card.color)}</span><span class="card-label">ODIN</span></button>`).join("");
  $("#hand").querySelectorAll(".card").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.id;
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    renderHand();
    updatePlayButton();
  }));
  updatePlayButton();
}

function updatePlayButton() {
  const count = state.selected.size;
  $("#playButton").disabled = !count || state.room?.currentPlayerId !== state.playerId;
  $("#playButton").innerHTML = count ? `JOUER ${count} CARTE${count > 1 ? "S" : ""} <span>⚡</span>` : "JOUER LA COMBO <span>⚡</span>";
}

function renderTable() {
  const table = state.room.table;
  $("#comboValue").textContent = table ? `x${table.cards.length} • ${table.value}` : "—";
  $("#playedArea").innerHTML = table ? `<div class="played-cards">${table.cards.map((card) => `<div class="card ${card.color}-card selected"><span class="card-value">${card.value}</span><span class="card-suit">${symbol(card.color)}</span><span class="card-label">${escapeHtml(table.playerName)}</span></div>`).join("")}</div>` : `<div class="empty-board"><span class="empty-icon">🪓</span><strong>La piste est à toi</strong><small>Joue une combinaison de 1 à 4 cartes</small></div>`;
}

function applyState(room, hand) {
  state.room = room;
  state.hand = hand;
  state.selected.clear();
  $("#roomCode").textContent = `#${room.roomCode}`;
  renderPlayers();
  renderHand();
  renderTable();
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

socket.addEventListener("open", () => { $("#connectionStatus").textContent = "Connexion sécurisée au fjord ✓"; });
socket.addEventListener("close", () => { $("#connectionStatus").textContent = "Connexion perdue — recharge la page."; showToast("Connexion au salon interrompue."); });
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "joined") {
    state.playerId = message.playerId;
    $("#connectionStatus").textContent = "Dans le salon ✓";
    $("#lobbyScreen").classList.add("hidden");
    return;
  }
  if (message.type === "state") { applyState(message.room, message.hand); if (message.room.lastAction) addActivity(message.room.lastAction); return; }
  if (message.type === "error") showToast(message.message);
});

$("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.name = $("#nickname").value.trim();
  if (state.name.length >= 2) send({ type: "join", name: state.name });
});
$("#startGameButton").addEventListener("click", () => send({ type: "start" }));
$("#playButton").addEventListener("click", () => {
  send({ type: "play", cardIds: [...state.selected] });
  state.selected.clear();
});
$("#passButton").addEventListener("click", () => send({ type: "pass" }));
$("#chatButton").addEventListener("click", () => showToast("Le chat arrive bientôt dans le fjord 💬"));

const rulesModal = $("#rulesModal");
$("#rulesButton").addEventListener("click", () => rulesModal.showModal());
$("#rulesFooter").addEventListener("click", () => rulesModal.showModal());
$("#closeRules").addEventListener("click", () => rulesModal.close());
$("#closeRulesAction").addEventListener("click", () => rulesModal.close());
$("#soundToggle").addEventListener("click", (event) => {
  event.currentTarget.textContent = event.currentTarget.textContent === "🔇" ? "🔊" : "🔇";
  showToast(event.currentTarget.textContent === "🔇" ? "Son coupé" : "Son activé");
});
