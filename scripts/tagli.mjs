// Cerca le pause da tagliare in un episodio gia' trascritto.
//   npm run tagli -- 2026-11-23_prova
// Prerequisito: npm run trascrivi -- <episodio>
// Legge   <workDir>\<episodio>\audio.wav  e  <driveDir>\Export\<episodio>\dati\trascrizione.json
// Scrive  <driveDir>\Export\<episodio>\dati\tagli.json (proposta, modificabile) e tagli.txt (da leggere)
// Le pause si cercano nell'AUDIO (FFmpeg silencedetect), non nei tempi di Whisper, che sono meno precisi.
// Parametri in config.json, sezione "tagli": rumoreDb (soglia del silenzio), pausaMinima (secondi) e pausaResidua (secondi lasciati).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caricaConfig } from "./config.mjs";

const fine = (m) => { console.error("\nERRORE: " + m); process.exit(1); };
const episodio = process.argv[2];
if (!episodio) fine("manca il nome dell'episodio. Esempio: npm run tagli -- 2026-11-23_prova");

let c;
try { c = caricaConfig(); } catch (e) { fine(e.message); }
const p = { rumoreDb: -35, pausaMinima: 0.6, pausaResidua: 0.3, ...(c.tagli ?? {}) };

const wav = join(c.workDir, episodio, "audio.wav");
const dati = join(c.driveDir, "Export", episodio, "dati");
const fileTrascr = join(dati, "trascrizione.json");
if (!existsSync(wav) || !existsSync(fileTrascr))
  fine(`mancano l'audio o la trascrizione dell'episodio: prima lancia npm run trascrivi -- ${episodio}`);
const r = JSON.parse(readFileSync(fileTrascr, "utf8"));
const durata = r.durata;
const parole = r.segmenti.flatMap((s) => s.parole);

// 1. Silenzi nell'audio
console.log(`Cerco i silenzi (soglia ${p.rumoreDb} dB, almeno ${p.pausaMinima} s)...`);
const ff = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", `silencedetect=noise=${p.rumoreDb}dB:d=${p.pausaMinima}`, "-f", "null", "-"], { encoding: "utf8" });
if (ff.status !== 0) fine("FFmpeg non e' riuscito ad analizzare l'audio.");
const silenzi = [];
let inizio = null;
for (const riga of ff.stderr.split(/\r?\n/)) {
  const s = riga.match(/silence_start:\s*(-?[\d.]+)/);
  const e = riga.match(/silence_end:\s*([\d.]+)/);
  if (s) inizio = Math.max(0, parseFloat(s[1]));
  if (e && inizio !== null) { silenzi.push([inizio, parseFloat(e[1])]); inizio = null; }
}
if (inizio !== null) silenzi.push([inizio, durata]); // silenzio che arriva fino alla fine

// 2. Da ogni silenzio si toglie la parte centrale e si lasciano ai lati un po' di respiro (pausaResidua in totale)
const lato = p.pausaResidua / 2;
const arrotonda = (x) => Math.round(x * 1000) / 1000;
const frase = (lista) => lista.map((w) => w.p).join(" ");
const tagli = [];
for (const [s, e] of silenzi) {
  const daInizio = s <= 0.05;          // silenzio all'inizio del video: si toglie fino al respiro prima della prima parola
  const aFine = e >= durata - 0.05;    // silenzio alla fine: si toglie dopo il respiro
  const a = daInizio ? 0 : s + lato;
  const b = aFine ? durata : e - lato;
  if (b - a < 0.2) continue;
  const prima = parole.filter((w) => w.fine <= s + 0.1).slice(-4);
  const dopo = parole.filter((w) => w.inizio >= e - 0.1).slice(0, 4);
  tagli.push({
    id: tagli.length + 1,
    tipo: daInizio ? "pausa iniziale" : aFine ? "pausa finale" : "pausa",
    inizio: arrotonda(a),
    fine: arrotonda(b),
    durata: arrotonda(b - a),
    prima: frase(prima),
    dopo: frase(dopo),
    attivo: true,
  });
}

// 3. Scrive i risultati
const totale = tagli.reduce((n, t) => n + t.durata, 0);
writeFileSync(join(dati, "tagli.json"), JSON.stringify({
  episodio,
  durataOriginale: durata,
  parametri: p,
  nota: "Proposta automatica: per escludere un taglio metti \"attivo\": false.",
  tagli,
}, null, 1), "utf8");

const mmss = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${(x % 60).toFixed(1).padStart(4, "0")}`;
const testo = [
  `Tagli proposti per ${episodio}`,
  `Pause piu' lunghe di ${p.pausaMinima} s, accorciate a circa ${p.pausaResidua} s.`,
  "",
  ...tagli.map((t) => `${String(t.id).padStart(2, "0")}  ${mmss(t.inizio)} - ${mmss(t.fine)}  (${t.durata.toFixed(1)} s)  ${t.tipo}\n      prima del taglio: "${t.prima}"\n      dopo il taglio:   "${t.dopo}"`),
  "",
  `${tagli.length} tagli, ${totale.toFixed(1)} s in meno: da ${mmss(durata)} a ${mmss(durata - totale)}.`,
].join("\n") + "\n";
writeFileSync(join(dati, "tagli.txt"), testo, "utf8");

console.log(`\n${tagli.length} tagli proposti, ${totale.toFixed(1)} s in meno (da ${mmss(durata)} a ${mmss(durata - totale)}).`);
console.log(`Risultati in: ${dati}\n  tagli.txt    da leggere\n  tagli.json   per i passi successivi (per escludere un taglio: "attivo": false)`);
