// Costruisce un'anteprima leggera dell'episodio con i tagli applicati, per guardarla prima del render finale.
//   npm run anteprima -- 2026-11-23_prova
// Prerequisito: npm run trascrivi e npm run tagli
// Legge   <driveDir>\Girato\<episodio>\<video>  e  <driveDir>\Export\<episodio>\dati\tagli.json (solo i tagli con "attivo": true)
// Scrive  <workDir>\<episodio>\anteprima.mp4  (540 pixel di altezza, qualita' bassa: serve solo a guardare, non e' l'export)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caricaConfig } from "./config.mjs";

const fine = (m) => { console.error("\nERRORE: " + m); process.exit(1); };
const episodio = process.argv[2];
if (!episodio) fine("manca il nome dell'episodio. Esempio: npm run anteprima -- 2026-11-23_prova");

let c;
try { c = caricaConfig(); } catch (e) { fine(e.message); }

const dati = join(c.driveDir, "Export", episodio, "dati");
const fileTagli = join(dati, "tagli.json");
const fileTrascr = join(dati, "trascrizione.json");
if (!existsSync(fileTagli) || !existsSync(fileTrascr))
  fine(`mancano trascrizione o tagli: prima lancia npm run trascrivi -- ${episodio} e poi npm run tagli -- ${episodio}`);
const { durata, file } = JSON.parse(readFileSync(fileTrascr, "utf8"));
const { tagli } = JSON.parse(readFileSync(fileTagli, "utf8"));
const video = join(c.driveDir, "Girato", episodio, file);
if (!existsSync(video)) fine(`video non trovato: ${video}`);

// Parti da tenere = tutto cio' che sta fuori dai tagli attivi
const attivi = tagli.filter((t) => t.attivo !== false).sort((a, b) => a.inizio - b.inizio);
const tieni = [];
let cursore = 0;
for (const t of attivi) {
  if (t.inizio - cursore > 0.01) tieni.push([cursore, t.inizio]);
  cursore = Math.max(cursore, t.fine);
}
if (durata - cursore > 0.01) tieni.push([cursore, durata]);
if (tieni.length === 0) fine("tutti i tagli cancellano l'episodio intero: controlla tagli.json.");

// Filtro FFmpeg: ritaglia ogni parte (video e audio insieme) e le unisce
const f = [];
tieni.forEach(([a, b], i) => {
  f.push(`[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,scale=-2:540[v${i}]`);
  f.push(`[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}]`);
});
f.push(tieni.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${tieni.length}:v=1:a=1[v][a]`);
const copione = join(c.workDir, episodio, "anteprima-filtro.txt");
writeFileSync(copione, f.join(";\n"), "utf8");

const uscita = join(c.workDir, episodio, "anteprima.mp4");
const finale = tieni.reduce((n, [a, b]) => n + (b - a), 0);
console.log(`Costruisco l'anteprima: ${attivi.length} tagli attivi, da ${durata.toFixed(1)} s a circa ${finale.toFixed(1)} s...`);
const ff = spawnSync("ffmpeg", ["-y", "-hide_banner", "-v", "error", "-stats", "-i", video, "-filter_complex_script", copione,
  "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "128k", uscita], { stdio: "inherit" });
if (ff.status !== 0) fine("FFmpeg non ha finito l'anteprima.");
console.log(`\nFatto. Anteprima: ${uscita}\nApri il file con doppio clic: guarda se le pause tagliate suonano naturali.`);
