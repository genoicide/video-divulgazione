# Pipeline video divulgativi

Progetto di Mattia Mazzocchio. Obiettivo: montare in automatico video divulgativi (parlato in camera e voce fuori campo) concentrandosi sul contenuto. Rispondi sempre in italiano.

## Regole di base
- Leggi la configurazione con `scripts/config.mjs` (`caricaConfig()`): unisce `config.json` (condiviso, nel repository: percorsi e profili `studio` e `portatile`) con il profilo scelto in `config.local.json` (solo `{ "profilo": "studio" }`, non su Git). Non scrivere mai percorsi o impostazioni fisse nel codice.
- Girato originale: `<driveDir>\Girato\<episodio>\` (sola lettura, non modificare mai). Nome episodio: `AAAA-MM-GG_titolo-breve`.
- Risultati: `<driveDir>\Export\<episodio>\` con montato, semimontato e `dati\` (trascrizione, tagli).
- File temporanei e render intermedi solo in `workDir`, mai su Drive.
- Esegui `npm run verifica` a inizio sessione su un computer nuovo e dopo ogni installazione.

## Fasi (separabili, riavviabili)
1. Trascrizione (Whisper, lingua it): `npm run trascrivi -- <episodio>` (script `scripts/trascrivi.mjs` e `scripts/trascrivi.py`) -> `dati\trascrizione.json` (segmenti e parole con i tempi), `.srt` e `.txt`
2. Tagli (silenzi, ripetizioni, errori) -> `dati\tagli.json`, da mostrare a Mattia prima del render
3. Render: montato 9:16 e 1:1 (sottotitoli e grafiche incollati)
4. Semimontato per Filmora: timeline XML FCP7 con i tagli + SRT + clip grafiche WebM VP9 alpha + media collegati

## Uscite predefinite
Per ogni episodio: montato (9:16 e 1:1) e semimontato. Modalita' viaggio: solo fasi 1, 2 e semimontato; render finale rimandato.

## Da verificare con il test reale
- Importazione in Filmora di XML, SRT e WebM alpha; ricollegamento dei media (Drive sta su Z: su entrambi i computer).
- Qualita' della trascrizione sui termini di sound design, scelta modello e computer piu' veloce (test di riferimento su due video brevi).

## Cautele
- Versioni degli strumenti fissate (vedi `package.json` e file di versione): non aggiornare senza dirlo.
- Video dei competitor in `Riferimenti\`: usa link, metadati e trascrizioni, non riutilizzare il materiale.

## Analisi dei video di riferimento (skill Watch)
- Per "guardare" i video dei competitor usa la skill Watch (`watch@claude-video`), solo in modalita' locale.
- Non impostare mai `GEMINI_API_KEY`, `GROQ_API_KEY` o `OPENAI_API_KEY`: niente video o audio verso servizi esterni. Non usare WhisperX; per l'audio usa faster-whisper.
- Un video o link alla volta. Salva gli appunti (ritmo, tagli, sottotitoli, struttura del discorso) in `Riferimenti\<nome>.md`, senza copiare il materiale originale.
- Prima di installare o aggiornare la skill, leggi SKILL.md, script e hook e riferisci cosa fanno.

## Remotion e regole
- Il progetto contiene Remotion (`package.json`) e le sue regole in `.claude/skills` (remotion-best-practices, remotion-captions, ecc.): usale per scrivere composizioni, sottotitoli e render.
- Font dei sottotitoli: Inter, file in `public/fonts` (caricati con `staticFile`, nessun download in render).
- Render di prova di 2 secondi: `npm run prova-render` (file in `out/`, non su Git). Controlli complessivi: `npm run verifica` (veloci) e `npm run verifica:completo` (carica Whisper e fa il render di prova).
