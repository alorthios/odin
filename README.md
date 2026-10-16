# ODIN — Battle Arena

Interface web responsive inspirée du jeu de cartes ODIN, avec partie multijoueur temps réel via WebSocket.

## Prérequis

- Docker Desktop avec Docker Compose

## Démarrer

```powershell
docker compose up --build -d
```

Ouvrir [http://localhost:8090](http://localhost:8090).

Le mapping utilise le port `8090` côté machine, car `8080` peut déjà être utilisé.

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

La room `FJORD-72` accepte de 2 à 6 joueurs. L’hôte doit attendre au moins 2 joueurs avant de lancer la partie. Chaque tour dure 60 secondes et le serveur distribue les cartes, valide les coups, les passes, les manches et le seuil de 15 points.

Lorsqu’une combinaison est déjà posée, le joueur actif choisit précisément la carte qu’il récupère. Pour ouvrir une table vide, il pose une carte, sauf s’il peut poser toute sa main en une combinaison valide. La piste et les commandes sont actives uniquement pendant le tour du joueur concerné.
