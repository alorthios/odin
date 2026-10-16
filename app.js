const cards = [
  { value: 1, suit: "ᛟ", color: "pink-card" }, { value: 2, suit: "✦", color: "yellow-card" },
  { value: 3, suit: "⚔", color: "cyan-card" }, { value: 4, suit: "ᚦ", color: "orange-card" },
  { value: 5, suit: "✹", color: "violet-card" }, { value: 7, suit: "ᛟ", color: "pink-card" },
  { value: 8, suit: "⚡", color: "yellow-card" }, { value: 9, suit: "✦", color: "cyan-card" },
  { value: 12, suit: "⚔", color: "orange-card" }
];
const hand = document.querySelector("#hand");
const selected = new Set();
const playButton = document.querySelector("#playButton");
const toast = document.querySelector("#toast");
const activityList = document.querySelector("#activityList");

function renderHand() {
  hand.innerHTML = cards.map((card, index) => `
    <button class="card ${card.color}" data-index="${index}" type="button" aria-label="Carte ${card.value}" aria-pressed="false">
      <span class="card-value">${card.value}</span><span class="card-suit">${card.suit}</span><span class="card-label">ODIN</span>
    </button>`).join("");
  hand.querySelectorAll(".card").forEach((button) => button.addEventListener("click", () => toggleCard(button)));
}

function toggleCard(button) {
  const index = Number(button.dataset.index);
  if (selected.has(index)) {
    selected.delete(index);
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  } else {
    selected.add(index);
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
  }
  playButton.disabled = selected.size === 0;
  playButton.innerHTML = selected.size ? `JOUER ${selected.size} CARTE${selected.size > 1 ? "S" : ""} <span>⚡</span>` : "JOUER LA COMBO <span>⚡</span>";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

playButton.addEventListener("click", () => {
  const chosen = [...selected].map((index) => cards[index]).sort((a, b) => a.value - b.value);
  if (!chosen.length) return;
  document.querySelector("#playedArea").innerHTML = `<div class="played-cards">${chosen.map((card) => `<div class="card ${card.color} selected"><span class="card-value">${card.value}</span><span class="card-suit">${card.suit}</span><span class="card-label">ODIN</span></div>`).join("")}</div>`;
  document.querySelector("#comboValue").textContent = `x${chosen.length}`;
  chosen.sort((a, b) => cards.indexOf(a) - cards.indexOf(b)).forEach((card) => cards.splice(cards.indexOf(card), 1));
  selected.clear();
  renderHand();
  document.querySelector("#cardCount").textContent = `(${cards.length} carte${cards.length > 1 ? "s" : ""})`;
  addActivity("Sacha", `a joué ${chosen.length} carte${chosen.length > 1 ? "s" : ""}`, "⚡", "icon-pink");
  showToast("Combo posé ! Le fjord tremble ⚡");
});

document.querySelector("#passButton").addEventListener("click", () => {
  addActivity("Sacha", "a passé son tour", "↷", "icon-cyan");
  showToast("Tu passes ton tour. À Inès de jouer.");
});

function addActivity(name, message, icon, iconClass) {
  const item = document.createElement("div");
  item.className = "activity";
  item.innerHTML = `<span class="activity-icon ${iconClass}">${icon}</span><p><strong>${name}</strong> ${message}<small>À l'instant</small></p>`;
  activityList.prepend(item);
}

const rulesModal = document.querySelector("#rulesModal");
document.querySelector("#rulesButton").addEventListener("click", () => rulesModal.showModal());
document.querySelector("#rulesFooter").addEventListener("click", () => rulesModal.showModal());
document.querySelector("#closeRules").addEventListener("click", () => rulesModal.close());
document.querySelector("#closeRulesAction").addEventListener("click", () => rulesModal.close());
document.querySelector("#soundToggle").addEventListener("click", (event) => {
  const muted = event.currentTarget.textContent === "🔇";
  event.currentTarget.textContent = muted ? "🔊" : "🔇";
  showToast(muted ? "Son activé" : "Son coupé");
});
document.querySelector("#chatButton").addEventListener("click", () => showToast("Le chat arrive bientôt dans le fjord 💬"));

let seconds = 42;
window.setInterval(() => {
  seconds = seconds > 0 ? seconds - 1 : 59;
  document.querySelector("#turnTimer").textContent = `00:${String(seconds).padStart(2, "0")}`;
}, 1000);
renderHand();
