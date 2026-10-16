# Sécurisation et migration

Ce guide décrit les protections de l'application et la migration des installations
existantes. Reconstruire et déployer les services pour appliquer ces protections.

## Installation existante

Sauvegarder la base, les fichiers et `.env` avant toute mise à jour. Ne pas changer
`COMPOSE_PROJECT_NAME`, `POSTGRES_USER` ou `POSTGRES_DB` d'un volume existant.

```sh
node scripts/setup.mjs --upgrade
# Vérifier APP_URL et TRUSTED_ORIGINS dans .env : HTTPS pour toute origine distante.
docker compose up --build -d
docker compose ps
```

`--upgrade` conserve les clés de chiffrement et de session, crée un mot de passe
pour `openfile_app` et un code d'invitation, et sauvegarde l'ancien environnement
sous `.env.pre-security` en mode 0600. Ce fichier contient des secrets : le conserver
hors Git et hors archives publiques. L'ancien `DATABASE_URL` devient
`MIGRATION_DATABASE_URL` ; `DATABASE_URL` utilise désormais le rôle restreint.
Si une sauvegarde `.env.pre-security` existe déjà, la commande refuse de l'écraser.

Le service ponctuel `migrate` utilise le rôle administrateur, applique les migrations
et accorde les droits de lecture/écriture nécessaires à `openfile_app`. Les processus
API et worker ne reçoivent plus les identifiants administrateur et refusent un rôle
SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. Aucune donnée documentaire
n'est effacée par cette migration. Les migrations futures doivent passer par ce
service afin que leurs nouvelles tables/séquences reçoivent les droits nécessaires.

Pour développer hors Docker : Linux et `prlimit` (util-linux) sont requis pour les
parseurs. Après `docker compose up -d database`, lancer
`pnpm --filter @open-file/server provision`, puis les processus habituels.
Le runner de tests utilise `MIGRATION_DATABASE_URL` pour créer sa base temporaire.
Les scripts serveur compilent le décodeur avant le développement et les tests ;
recompiler/redémarrer après modification du moteur de décodage.

## Accès, sessions et navigateur

- Les comptes existants continuent à fonctionner. Un nouveau compte exige le
  code `SIGNUP_TOKEN` dans le formulaire. Partager ce code par un canal privé,
  le renouveler après usage, ou le vider pour fermer les inscriptions. Il ne
  remplace pas le mot de passe et n'est jamais inclus dans le bundle frontend.
- L'adresse utilisée par Better Auth provient exclusivement du socket backend.
  Les en-têtes d'adresse IP fournis par le client ne sont pas fiables et sont
  ignorés. Derrière Next.js, les utilisateurs partagent donc une limitation
  conservatrice des connexions, notamment trois essais par dix secondes sur
  les routes sensibles. Cette configuration vise une instance personnelle ;
  une ouverture à grande échelle nécessiterait une identité client fiable
  établie au proxy, sans rendre le backend directement accessible.
- Le frontend et PostgreSQL n'écoutent que sur localhost côté hôte. Pour un accès
  distant, utiliser HTTPS avec un proxy ; [Caddyfile](../examples/Caddyfile) fournit
  un exemple sur l'hôte. Ouvrir seulement les ports du proxy. Les origines HTTP
  non locales sont refusées au démarrage. Ne pas conserver une ancienne origine
  HTTP Tailscale dans `.env` : utiliser localhost ou un nom HTTPS.
- Les pages utilisent une CSP avec nonce par requête, sans `unsafe-eval` en
  production, et interdisent l'encadrement par un autre site. Les styles inline
  restent autorisés pour les composants et leur positionnement. Les aperçus PDF
  restent accessibles dans une iframe de la même origine.

## Ressources

Valeurs par défaut, réglables via `.env` et transmises par Compose :

| Variable | Limite |
| --- | --- |
| `MAX_USER_BYTES` | 1 Gio de copies de fichiers par compte |
| `MAX_TOTAL_BYTES` | 10 Gio de copies de fichiers pour l'instance |
| `MAX_USER_DOCUMENTS` | 500 documents par compte |
| `MAX_USER_JOBS` | 50 tâches actives par compte avant ajout d'une analyse |
| `MAX_CONVERSATIONS` | 100 conversations par compte |
| `MAX_CONVERSATION_MESSAGES` | 200 messages par conversation |

Les quotas comptent les originaux locaux et Drive ainsi que les anciennes copies
encore en attente de nettoyage, y compris après un échec. Les vérifications
précèdent l'écriture et restent verrouillées jusqu'au commit : les copies qui
consomment du quota sont sérialisées globalement. Cette simplicité privilégie la
cohérence d'une petite instance ; une copie Drive lente peut retarder un autre
import. Prévoir de la place libre pour le classement, qui crée la nouvelle copie
avant de retirer l'ancienne. Les quotas applicatifs ne remplacent pas la surveillance
de l'espace disque, les limites du volume ou le suivi des échecs de nettoyage.

Les collections sont limitées à 100 par compte. Les téléchargements gardent leur
créneau jusqu’à la fin de l’envoi (six simultanés, deux par compte), avec un délai
d’inactivité de 30 secondes. L’ancienne route de réponse IA est limitée à quatre
appels simultanés, un par compte.

Deux imports maximum s'exécutent simultanément, un seul par compte. L'assistant
est limité à huit tours HTTP simultanés et deux par compte. Les réponses sont
limitées en durée, appels et contexte. Les conversations ont un chargement borné ;
les anciennes conversations dépassant la limite affichent leurs derniers messages.
Les tâches terminées de plus de sept jours sont purgées par le worker.

Les parseurs PDF/images fonctionnent dans un processus distinct, sans transmission
des variables contenant les clés de l'application : deux processus maximum,
30 secondes de temps réel, 20 secondes CPU, heap V8 de 128 Mio, espace d'adressage
plafonné à 2 Gio, segment de données plafonné à 512 Mio, arrêt supplémentaire si
la mémoire résidente dépasse 384 Mio, core dumps désactivés. Le délai tue réellement
le processus ; il ne se contente pas d'abandonner une promesse. Les dimensions
sont contrôlées avant le décodage des images : 16 millions de pixels maximum,
16 384 pixels par côté. Les PDF sont limités à 200 pages et leur extraction
s'arrête à 160 000 caractères. Certains documents complexes valides peuvent être
refusés : c'est un compromis explicite de disponibilité.

Compose plafonne aussi mémoire, CPU et processus ; les services applicatifs
s'exécutent sans root ni capabilities. Ce cloisonnement limite les ressources ;
il ne constitue pas une sandbox complète contre toute exécution de code native.

## Suppression et confidentialité

Supprimer un document supprime ses références et son index et programme le retrait
de l'original. Cela supprime aussi **les conversations qui le citent**, ainsi que
les conversations du même compte dont une réponse est en cours, pour éviter
qu'une réponse tardive ne réintroduise son contenu. Le dialogue de confirmation
annonce ce comportement. Une conversation peut également être supprimée depuis
l'assistant. Les extraits, réponses et titres de ces conversations sont supprimés
ensemble, sans conservation d'un historique partiel pouvant paraphraser le document.

Des copies indépendantes, du texte collé manuellement, des téléchargements ou des
sauvegardes peuvent encore contenir les données. Les suppressions ne réécrivent pas
les sauvegardes. Définir leur durée de conservation, leur chiffrement et leur accès.
Le texte en base et les originaux ne sont pas chiffrés par la clé AES des intégrations.
Les conversations historiques issues de documents supprimés avant ce correctif
ne sont pas automatiquement effacées : les supprimer explicitement dans l'assistant.

## Dépendances et vérifications

`esbuild` est remplacé par la version corrigée 0.28.2. Le correctif local de
`braces@3.0.3` borne la profondeur du parseur et des parcours AST. Les tests couvrent
les motifs normaux, les parenthèses/accolades et les AST fournis directement. La
version du registre n'ayant pas changé, `pnpm audit` affiche encore l'avis
`GHSA-vfj7-8cjw-p6xm` sur cette dépendance de développement. Il n'est pas masqué dans
la configuration globale. `pnpm audit:security` n'accepte que cet avis précis, sur
cette version et des chemins de développement, après succès des tests du correctif.
Tout autre avis ou échec du registre fait échouer cette commande.

Les images finales contiennent les dépendances nécessaires à l'exécution : le
frontend utilise le mode standalone et le serveur un déploiement des dépendances
production. Le correctif braces n'est pas requis dans le sous-ensemble serveur ;
le build autorise uniquement cette absence de patch inutilisé pendant cette étape.
La CI exécute typecheck, lint, tests frontend/serveur, tests du correctif, audit,
build et Gitleaks sur l'historique disponible. Aucun secret n'est requis dans la CI.

Restent propres à l'exploitation : installation du certificat public, règles du
pare-feu externe, protection/chiffrement des sauvegardes et des volumes, et contrôle
des intégrations Google/OpenAI avec les identifiants réels.
