# ODIN — La bataille des neuf mondes

> Les dieux ont ouvert les portes du fjord.
> Choisis ton nom, trouve ton monde et vide ta main avant tes rivaux.

ODIN est une arène de cartes multijoueur en temps réel, jouable depuis un navigateur.
Le serveur synchronise les mondes, les joueurs, les tours, les cartes, le chat et les scores
via WebSocket.

## Lancer l’arène

### Docker Desktop

```powershell
docker compose up --build -d
```

Puis ouvre [http://localhost:8090](http://localhost:8090).

Pour vérifier que le fjord répond :

```powershell
curl.exe http://localhost:8090/health
```

Réponse attendue : `ok`.

Pour fermer l’arène :

```powershell
docker compose down
```

### Depuis VS Code

Ouvre [odin.code-workspace](./odin.code-workspace), puis utilise la palette de commandes
(`Ctrl+Shift+P`) :

- `Tasks: Run Task` → `ODIN: démarrer Docker`
- `Tasks: Run Task` → `ODIN: vérifier le service`
- `Tasks: Run Task` → `ODIN: logs Docker`
- `Tasks: Run Task` → `ODIN: arrêter Docker`

### GitHub Codespaces

1. Ouvre le dépôt [alorthios/odin](https://github.com/alorthios/odin).
2. Choisis `Code` → `Codespaces` → `Create codespace on main`.
3. Lance `npm start`.
4. Dans `PORTS`, rends le port `8080` public.
5. Partage l’URL générée aux autres guerriers.

Les joueurs n’ont besoin ni de compte GitHub ni de Codespace : un navigateur suffit.

## Le parcours d’un guerrier

### 1. Inscrire son nom

La première fenêtre demande uniquement un pseudo de 2 à 18 caractères.
Deux joueurs ne peuvent pas porter le même nom au même instant. Le nom redevient disponible
quand la connexion précédente est terminée.

### 2. Choisir un monde

La carte affiche toujours les neuf mondes de la mythologie nordique :

| Monde | Royaume |
| --- | --- |
| Asgard | Les dieux |
| Midgard | Les humains |
| Vanaheim | Les Vanes |
| Jotunheim | Les géants |
| Niflheim | Le brouillard et la glace |
| Muspelheim | Le feu |
| Alfheim | Les elfes lumineux |
| Svartalfheim | Les nains |
| Helheim | Les morts |

Chaque carte indique l’état du monde et son nombre de guerriers :

- `REJOINDRE` : la partie n’a pas commencé ;
- `MONDE ACTUEL` : le guerrier est déjà présent ;
- `OBSERVER` : la partie est en cours et ne peut plus être rejointe.

Il n’existe aucune notion de chef. Tous les joueurs présents peuvent lancer la partie.
`DÉCONNEXION` quitte le monde et revient à l’écran d’identité. Un monde vide reste visible
quelques secondes avant de disparaître.

### 3. Entrer dans l’arène

Chaque monde accepte de 2 à 6 joueurs. Dès que deux guerriers sont présents, n’importe lequel
peut lancer un compte à rebours synchronisé de 5 secondes. Les arrivées, départs et actions
sont diffusés à tous les écrans.

Le pseudo du guerrier reste visible dans la barre supérieure. Pendant la partie, le bouton
`SE DÉCONNECTER` quitte la partie après confirmation et revient à l’écran d’identité.

## Les règles du combat

- Une manche commence avec 9 cartes par joueur.
- Une combinaison est composée de cartes de même couleur ou de même valeur.
- Pour battre la table, il faut jouer le même nombre de cartes — ou une carte de plus — avec
  une valeur supérieure.
- Pour ouvrir une table vide, on joue une carte ou toute sa main si elle forme une combinaison.
- Le joueur actif dispose de 60 secondes.
- On peut passer ; lorsque tous les adversaires ont passé, la table est réinitialisée.
- Lorsqu’une combinaison est battue, son auteur choisit précisément la carte qu’il ramasse.
- Vider sa main remporte la manche.
- Les cartes restantes des perdants deviennent des points de pénalité.
- À 15 points, la partie s’arrête.

Les poses déclenchent des effets gradués : Mjolnir apparaît à partir de 4 cartes et Ragnarök
à partir de 5. Les sons sont générés localement par le navigateur et peuvent être coupés.

## Le grimoire

Le grimoire affiche les événements de la partie et permet aux guerriers d’échanger des messages
en temps réel. La liste des clans montre le nombre de cartes restantes et les scores, sans jamais
révéler les mains adverses.

## Structure du projet

| Fichier | Rôle |
| --- | --- |
| `index.html` | Écrans d’identité, carte des mondes et arène |
| `styles.css` | Direction artistique, responsive et animations |
| `app.js` | Interface et interactions côté navigateur |
| `server.js` | HTTP, WebSocket et moteur des règles |
| `Dockerfile` | Image Node de production |
| `docker-compose.yml` | Lancement local du service |

## Développement local sans Docker

Node.js et les dépendances installées sont nécessaires :

```powershell
npm install
npm start
```

Le serveur écoute alors sur le port `8080`. La variable `PORT` permet de le modifier :

```powershell
$env:PORT=8090
npm start
```
