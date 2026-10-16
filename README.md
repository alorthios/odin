# ODIN — Battle Arena

Interface web responsive inspirée du jeu de cartes ODIN, servie par Nginx dans Docker.

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
| `Dockerfile` | Image Nginx de production |
| `nginx.conf` | Configuration du serveur statique |
| `docker-compose.yml` | Lancement local du service |

## État du projet

La version actuelle est un prototype jouable côté client. Les joueurs affichés sont simulés ; le multijoueur temps réel nécessitera un backend WebSocket ou un service équivalent.
