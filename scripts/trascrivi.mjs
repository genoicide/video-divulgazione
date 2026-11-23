// Trascrive il parlato di un episodio con Whisper (faster-whisper).
//   npm run trascrivi -- 2026-11-23_prova              (usa l'unico video nella cartella dell'episodio)
//   npm run trascrivi -- 2026-11-23_prova Test.mp4     (se nella cartella ci sono piu' file)
// Legge da   <driveDir>\Girato\<episodio>\
// Scrive in  <driveDir>\Export\<episodio>\dati\  trascrizione.json (segmenti e parole con i tempi), trascrizione.srt, trascrizione.txt
// I file temporanei (audio estratto) restano in <workDir>\<episodio>\
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { caricaConfig } from "./config.mjs";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");
const fine = (messaggio) => { console.error("\nERRORE: " + messaggio); process.exit(1); };

const [episodio, nomeFile] = process.argv.slice(2);
if (!episodio) fine("manca il nome dell'episodio. Esempio: npm run trascrivi -- 2026-11-23_prova");

let c;
try { c = caricaConfig(); } catch (e) { fine(e.message); }

// 1. Trova il file da trascrivere
const cartella = join(c.driveDir, "Girato", episodio);
if (!existsSync(cartella)) fine(`cartella non trovata: ${cartella}`);
const estensioni = [".mp4", ".mov", ".mkv", ".m4v", ".avi", ".webm", ".wav", ".mp3", ".m4a"];
const trovati = readdirSync(cartella).filter((f) => estensioni.includes(extname(f).toLowerCase()));
let file;
if (nomeFile) {
  if (!existsSync(join(cartella, nomeFile))) fine(`file non trovato: ${join(cartella, nomeFile)}`);
  file = nomeFile;
} else if (trovati.length === 1) {
  file = trovati[0];
} else if (trovati.length === 0) {
  fine(`nessun video o audio in ${cartella}`);
} else {
  fine(`ci sono ${trovati.length} file in ${cartella} (${trovati.join(", ")}): scrivi quale usare, per esempio npm run trascrivi -- ${episodio} ${trovati[0]}`);
}
const ingresso = join(cartella, file);
console.log(`Episodio: ${episodio}\nFile:     ${file}\nProfilo:  ${c.profilo} (${c.whisper.model}, ${c.whisper.device})\n`);

// 2. Estrae l'audio (mono, 16 kHz) nella cartella di lavoro
const lavoro = join(c.workDir, episodio);
mkdirSync(lavoro, { recursive: true });
const wav = join(lavoro, "audio.wav");
console.log("Estraggo l'audio...");
const ff = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", ingresso, "-vn", "-ar", "16000", "-ac", "1", wav], { stdio: "inherit" });
if (ff.status !== 0) fine("FFmpeg non riesce a leggere il file. Se il video e' su Drive, controlla che sia scaricato sul disco (tutorial, passo 6).");

// 3. Trascrive con Whisper
const grezzo = join(lavoro, "trascrizione.json");
const t0 = Date.now();
const py = spawnSync(
  "python",
  [join(radice, "scripts", "trascrivi.py"), wav, grezzo,
    "--modello", c.whisper.model, "--dispositivo", c.whisper.device, "--calcolo", c.whisper.compute_type, "--lingua", c.whisper.language],
  // HF_HUB_DISABLE_XET: evita il download del modello che resta vuoto senza errore (tutorial, passo 11)
  { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8", HF_HUB_DISABLE_XET: "1" } }
);
if (py.status !== 0) fine("Whisper non ha finito. Controlla il modello e CUDA con npm run verifica:completo (tutorial, passi 11, 11a e 12).");

// 4. Scrive i risultati in Export\<episodio>\dati
const r = JSON.parse(readFileSync(grezzo, "utf8"));
const dati = join(c.driveDir, "Export", episodio, "dati");
mkdirSync(dati, { recursive: true });

const tempo = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
// Spezza il testo in righe di al massimo 42 caratteri
const righe = (testo) => {
  const out = [];
  let riga = "";
  for (const parola of testo.split(/\s+/)) {
    if (riga && (riga + " " + parola).length > 42) { out.push(riga); riga = parola; }
    else riga = riga ? riga + " " + parola : parola;
  }
  if (riga) out.push(riga);
  return out.join("\n");
};

writeFileSync(join(dati, "trascrizione.json"), JSON.stringify({ episodio, file, ...r }, null, 1), "utf8");
writeFileSync(join(dati, "trascrizione.srt"),
  r.segmenti.map((s, i) => `${i + 1}\n${tempo(s.inizio)} --> ${tempo(s.fine)}\n${righe(s.testo)}\n`).join("\n"), "utf8");
writeFileSync(join(dati, "trascrizione.txt"), r.segmenti.map((s) => s.testo).join("\n") + "\n", "utf8");

const parole = r.segmenti.reduce((n, s) => n + s.parole.length, 0);
console.log(`\nFatto in ${Math.round((Date.now() - t0) / 1000)} s: ${r.segmenti.length} segmenti, ${parole} parole, audio di ${Math.round(r.durata)} s.`);
console.log(`Risultati in: ${dati}\n  trascrizione.json   segmenti e parole con i tempi\n  trascrizione.srt    sottotitoli provvisori\n  trascrizione.txt    testo semplice`);
