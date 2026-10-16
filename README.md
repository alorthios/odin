# ODIN — Battle Arena

Interface web responsive inspirée du jeu de cartes ODIN, avec partie multijoueur temps réel via WebSocket.

## Prérequis

- Docker Desktop avec Docker Compose

## Démarrer

```powershell
docker compose up --build -d
```

Ouvrir [http://localhost:8090](http://localhost:8090).

### Depuis VS Code

Ouvrir [odin.code-workspace](./odin.code-workspace), puis utiliser la palette de commandes
(`Ctrl+Shift+P`) :

- `Tasks: Run Task` → `ODIN: démarrer Docker`
- `Tasks: Run Task` → `ODIN: vérifier le service`
- `Tasks: Run Task` → `ODIN: logs Docker`
- `Tasks: Run Task` → `ODIN: arrêter Docker`

Le projet peut aussi être ouvert directement comme dossier. Les tâches VS Code sont disponibles
dans [.vscode/tasks.json](./.vscode/tasks.json).

## Lancer dans GitHub Codespaces et partager la partie

1. Ouvrir le dépôt [alorthios/odin](https://github.com/alorthios/odin).
2. Cliquer sur `Code` → `Codespaces` → `Create codespace on main`.
3. Attendre la création du Codespace. La configuration dans
   [.devcontainer/devcontainer.json](./.devcontainer/devcontainer.json) installe automatiquement Node.js et les dépendances.
4. Dans le terminal du Codespace, lancer :

   ```bash
   npm start
   ```

5. Dans l’onglet `PORTS`, repérer le port `8080`, faire clic droit dessus et choisir
   `Port Visibility` → `Public`.
6. Copier l’URL transférée du port `8080` et la partager aux joueurs.

Les joueurs n’ont pas besoin d’un compte GitHub ni d’un Codespace : ils ouvrent simplement
le lien public dans leur navigateur. Le serveur WebSocket utilise automatiquement le même
domaine que la page.

Pour arrêter le serveur, utiliser `Ctrl+C` dans le terminal. Pour arrêter le Codespace,
ouvrir le menu `...` du Codespace depuis GitHub et choisir `Stop codespace`.

Le mapping utilise le port `8090` côté machine, car `8080` peut déjà être utilisé.

### Rejoindre un salon

Sur l’écran d’accueil, chaque joueur saisit le même code de salon (4 à 12 caractères
alphanumériques ou `-`, par exemple `FJORD-72`) avant son pseudo. Un code inconnu crée
automatiquement un nouveau salon ; un code existant rejoint le salon correspondant. Le code
du salon reste affiché dans le bandeau et peut être partagé avec les autres joueurs.

## Arrêter

```powershell
docker compose down
```

## Vérifier le service

```powershell
curl.exe http://localhost:8090/health
```

Le résultat attendu est `ok`.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure de l’interface |
| `styles.css` | Design responsive et animations |
| `app.js` | Interactions de la partie côté client |
| `server.js` | Serveur HTTP, WebSocket et moteur de règles |
| `Dockerfile` | Image Node de production |
| `docker-compose.yml` | Lancement local du service |

## État du projet

Chaque salon accepte de 2 à 6 joueurs. Dès que 2 joueurs sont présents, n’importe lequel peut lancer la partie ; un compte à rebours synchronisé de 5 secondes laisse le temps à tous les écrans d’entrer dans l’arène. Les arrivées, départs et changements du salon sont diffusés en temps réel à tous les joueurs. Chaque tour dure 60 secondes et le serveur distribue les cartes, valide les coups, les passes, les manches et le seuil de 15 points.

Le grimoire conserve une hauteur limitée avec défilement, affiche les activités et permet
d’échanger des messages en temps réel. La liste des clans indique également le nombre de cartes
restant dans la main de chaque joueur ; le serveur ne révèle jamais les cartes elles-mêmes.

Lorsqu’une combinaison est déjà posée, le joueur actif choisit précisément la carte qu’il récupère. Pour ouvrir une table vide, il pose une carte, sauf s’il peut poser toute sa main en une combinaison valide. La piste et les commandes sont actives uniquement pendant le tour du joueur concerné.

Les poses légales déclenchent des effets gradués selon le nombre de cartes (1 à 5+), avec Mjolnir à partir de 4 cartes et Ragnarök à partir de 5. Les effets sonores sont générés localement par le navigateur et peuvent être coupés. À la victoire d’une manche, chaque joueur perdant reçoit en pénalité le nombre de cartes restantes dans sa main ; les scores cumulés sont affichés dans le clan et la partie s’arrête à 15 points.
