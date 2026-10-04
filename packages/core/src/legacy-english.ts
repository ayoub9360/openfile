import type { Document, Workspace } from "./workspace"

// Exact aliases for app-generated values stored by the former French version.
// Never translate user-authored content, names, folders, tags, or collections.
const messages: Record<string, string> = {
  "Ce PDF ne peut pas être lu. Vérifiez qu’il n’est pas protégé ou activez un modèle IA compatible.":
    "This PDF could not be read. Check that it is not protected or enable a compatible AI model.",
  "Vos documents personnels et professionnels, au même endroit.":
    "Your personal and work documents, all in one place.",
  "Retrouvez vos fichiers et dossiers Microsoft en toute simplicité.":
    "Easily find your Microsoft files and folders.",
  "Un espace pour les documents déposés depuis votre ordinateur.":
    "A space for documents uploaded from your computer.",
  "Cet appareil": "This device",
  "Rassemblez les fichiers de votre espace Dropbox.":
    "Bring together files from your Dropbox storage.",
  "Compte de démonstration": "Demo account",
  "Votre cloud personnel, dans votre bibliothèque.":
    "Your personal cloud, in your library.",
  "Boîte e-mail": "Email inbox",
  "Recevez les pièces jointes dans votre boîte de réception.":
    "Receive attachments in your inbox.",
  "OpenAI refuse la clé API enregistrée. Remplacez-la dans Paramètres → Intelligence documentaire, puis relancez l’analyse.":
    "OpenAI rejected the saved API key. Replace it in Settings → Document intelligence, then retry analysis.",
  "Le quota OpenAI est épuisé. Vérifiez les crédits et la facturation de votre compte OpenAI.":
    "Your OpenAI quota is exhausted. Check your OpenAI account credits and billing.",
  "Le modèle OpenAI est inaccessible avec cette clé. Vérifiez le modèle et les permissions dans les paramètres.":
    "This OpenAI model is unavailable with this key. Check the model and permissions in settings.",
  "OpenAI ne peut pas analyser ce document avec le modèle choisi. Vérifiez le format et choisissez un modèle compatible dans les paramètres.":
    "OpenAI cannot analyze this document with the selected model. Check the format and choose a compatible model in settings.",
  "OpenAI est temporairement indisponible. Une nouvelle tentative sera effectuée.":
    "OpenAI is temporarily unavailable. A retry will be attempted.",
  "L’analyse IA n’a pas abouti. Vérifiez votre connexion et le modèle choisi, puis réessayez.":
    "AI analysis failed. Check your connection and selected model, then try again.",
  "Le traitement du fichier a échoué. Vérifiez le fichier et sa destination, puis réessayez.":
    "File processing failed. Check the file and its destination, then try again.",
  "Document introuvable.": "Document not found.",
  "Document classé": "Document filed",
  "Document modifié": "Document modified",
  "Sélectionnez un document à valider.": "Select a document to approve.",
  "Documents classés": "Documents filed",
  "Document archivé": "Document archived",
  "Choisissez au moins un fichier.": "Choose at least one file.",
  "Import terminé": "Import complete",
  "Connexion mise à jour": "Connection updated",
  "Modification de la connexion de démonstration": "Demo connection updated",
  "Connectez d’abord cet espace.": "Connect this storage first.",
  "Synchronisation terminée": "Sync complete",
  "Le nom et le tag sont obligatoires.": "Name and tag are required.",
  "Collection créée": "Collection created",
  "Vérifiez votre nom et votre adresse e-mail.":
    "Check your name and email address.",
  "Préférences enregistrées": "Preferences saved",
  "Paramètres de votre espace": "Your workspace settings",
  "Cette action ne peut plus être annulée.":
    "This action can no longer be undone.",
  "Action annulée": "Action undone",
  "Destination non prise en charge.": "Unsupported destination.",
  "Nom de fichier ou de dossier invalide.": "Invalid file or folder name.",
  "Dossier trop profond.": "Folder nesting is too deep.",
  "Dossiers locaux": "Local folders",
  "Fichiers conservés dans votre dossier sur le serveur.":
    "Files stored in your folder on the server.",
  "Votre espace privé": "Your private workspace",
  // Historical persisted descriptions remain readable after the rename.
  "Vos originaux sur Drive, le texte et les métadonnées dans Auto Sort.":
    "Your originals on Drive, text and metadata in Open File.",
  "Your originals on Drive, text and metadata in Auto Sort.":
    "Your originals on Drive, text and metadata in Open File.",
  "Vos originaux sur Drive, le texte et les métadonnées dans Open File.":
    "Your originals on Drive, text and metadata in Open File.",
  Facture: "Invoice",
  Contrat: "Contract",
  Attestation: "Certificate",
  Relevé: "Statement",
  "À renseigner": "Not specified",
  "Analyse en attente": "Awaiting analysis",
  "Analyse terminée": "Analysis complete",
  "Document importé": "Document imported",
  "Règle créée": "Rule created",
  "4 documents reçus": "4 documents received",
  "Import depuis Google Drive et OneDrive":
    "Import from Google Drive and OneDrive",
  "Google Drive · bibliothèque à jour": "Google Drive · library up to date",
  "Les factures, à leur place": "Invoices, in their place",
  "Le traitement a échoué. Vérifiez le fichier, la connexion de stockage et les réglages IA, puis réessayez.":
    "Processing failed. Check the file, storage connection, and AI settings, then try again.",
  "L’indexation sémantique a échoué. La recherche textuelle reste disponible.":
    "Semantic indexing failed. Text search remains available.",
  "Activez l’IA pour extraire le contenu de cette image ou de ce document numérisé.":
    "Enable AI to extract the content of this image or scanned document.",
}

function message(value: string) {
  return Object.hasOwn(messages, value) ? messages[value]! : value
}

export function englishNamingTemplate(value: string) {
  return value === "{date}_{type}_{émetteur}"
    ? ""
    : value.replaceAll("{émetteur}", "{issuer}")
}

function documentLabels(document: Document): Document {
  return {
    ...document,
    kind: message(document.kind) as Document["kind"],
    issuer:
      document.issuer === "À renseigner" ? "Not specified" : document.issuer,
    size: document.size
      .replace(/(\d),(\d)/g, "$1.$2")
      .replace(/\bKo\b/g, "KB")
      .replace(/\bMo\b/g, "MB"),
    summary: message(document.summary),
    ...(document.processingError
      ? { processingError: message(document.processingError) }
      : {}),
    ...(document.processingWarning
      ? {
          processingWarning: document.processingWarning
            .replace(
              /^Recherche sémantique indisponible : /,
              "Semantic search unavailable: "
            )
            .split("Semantic search unavailable: ")
            .map(message)
            .join("Semantic search unavailable: "),
        }
      : {}),
  }
}

export function englishWorkspace(state: Workspace): Workspace {
  return {
    ...state,
    documents: state.documents.map(documentLabels),
    connectors: state.connectors.map((connector) => ({
      ...connector,
      name: message(connector.name),
      description: message(connector.description),
      account: message(connector.account),
    })),
    activities: state.activities.map((activity) => ({
      ...activity,
      title: message(activity.title),
      // Document activity details are user filenames and must remain unchanged.
      detail: activity.documentId
        ? activity.detail
        : activity.title === "Documents classés"
          ? activity.detail.replace(
              /^(\d+) document\(s\) validé\(s\)$/,
              "$1 document(s) approved"
            )
          : activity.title === "Import terminé"
            ? activity.detail.replace(
                /^(\d+) document\(s\) à vérifier$/,
                "$1 document(s) to review"
              )
            : activity.title === "Synchronisation terminée"
              ? message(activity.detail).replace(
                  / · aucun nouveau document dans la démo$/,
                  " · no new documents in the demo"
                )
              : [
                    "Préférences enregistrées",
                    "Connexion mise à jour",
                    "4 documents reçus",
                    "Règle créée",
                  ].includes(activity.title)
                ? message(activity.detail)
                : activity.detail,
      ...(activity.undo ? { undo: activity.undo.map(documentLabels) } : {}),
    })),
    settings: {
      ...state.settings,
      naming: englishNamingTemplate(state.settings.naming),
    },
  }
}
