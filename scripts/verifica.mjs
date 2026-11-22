// Controlla che questo computer sia pronto: strumenti, progetto, profilo, cartelle.
// npm run verifica            -> controlli veloci
// npm run verifica:completo   -> in piu': carica il modello Whisper (lo scarica se manca),
//                                trascrive 2 secondi di audio di prova e fa un render Remotion di 2 secondi
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { caricaConfig } from "./config.mjs";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");
const completo = process.argv.includes("--completo");

let errori = 0;
const ok = (m) => console.log("OK     " + m);
const ko = (m) => { errori++; console.log("MANCA  " + m); };
const esegui = (cmd, opzioni = {}) =>
  execSync(cmd, { cwd: radice, stdio: ["ignore", "pipe", "pipe"], ...opzioni }).toString();
const prova = (nome, cmd) => {
  try { ok(`${nome}: ${esegui(cmd).split("\n")[0].trim()}`); }
  catch { ko(nome); }
};

// 1. Programmi
prova("Node", "node --version");
prova("Git", "git --version");
prova("FFmpeg", "ffmpeg -version");
prova("Python", "python --version");
prova("Whisper (faster-whisper)", 'python -c "import faster_whisper;print(faster_whisper.__version__)"');

// 2. Progetto: Remotion e sue regole
existsSync(join(radice, "node_modules", "remotion"))
  ? ok("Remotion installato")
  : ko("Remotion non installato: dalla cartella del progetto lancia npm install");
existsSync(join(radice, ".claude", "skills", "remotion-best-practices", "SKILL.md"))
  ? ok("Regole Remotion presenti in .claude/skills")
  : ko("Regole Remotion mancanti in .claude/skills (fai git pull; se mancano ancora: npx remotion skills add)");
existsSync(join(radice, "public", "fonts", "inter-latin-800-normal.woff2"))
  ? ok("Font dei sottotitoli presente")
  : ko("Font dei sottotitoli mancante in public/fonts (fai git pull)");

// 3. Profilo e cartelle
let c;
try {
  c = caricaConfig();
  ok(`Profilo: ${c.profilo}`);
  ok(`Whisper: modello ${c.whisper.model}, dispositivo ${c.whisper.device}, calcolo ${c.whisper.compute_type}, lingua ${c.whisper.language}`);
  ok(`Render: ${c.render.concurrency} in parallelo, encoder ${c.render.encoder}`);
} catch (e) {
  ko(e.message);
}

if (c) {
  for (const [k, p] of [["driveDir", c.driveDir], ["Girato", join(c.driveDir, "Girato")], ["Export", join(c.driveDir, "Export")]])
    existsSync(p) ? ok(`${k}: ${p}`) : ko(`${k} non trovato: ${p}`);
  existsSync(c.workDir) ? ok(`workDir: ${c.workDir}`) : ko(`workDir non trovato: ${c.workDir} (crealo)`);

  // 4. Scheda NVIDIA (solo se il profilo usa cuda)
  if (c.whisper.device === "cuda") {
    try {
      const n = esegui('python -c "import ctranslate2;print(ctranslate2.get_cuda_device_count())"').trim();
      Number(n) > 0
        ? ok(`CUDA: ${n} scheda NVIDIA vista da faster-whisper`)
        : ko("CUDA: nessuna scheda NVIDIA vista da faster-whisper (driver o librerie CUDA mancanti: vedi il tutorial, passo 5)");
    } catch {
      ko("CUDA: controllo non riuscito (ctranslate2 non risponde: vedi il tutorial, passo 5)");
    }
  }

  // 5. Prove complete (lente: scaricano il modello e fanno un render)
  if (completo) {
    const lento = (cmd) => esegui(cmd, { timeout: 30 * 60 * 1000 });
    const coda = (e) => String(e.stderr ?? e.message).trim().split("\n").slice(-3).join(" | ");
    try {
      mkdirSync(c.workDir, { recursive: true });
      const wav = join(c.workDir, "prova-audio.wav");
      lento(`ffmpeg -y -f lavfi -i sine=frequency=440:duration=2 -ar 16000 -ac 1 "${wav}"`);
      const py = [
        "import sys,time",
        "from faster_whisper import WhisperModel",
        "t=time.time()",
        `m=WhisperModel(${JSON.stringify(c.whisper.model)},device=${JSON.stringify(c.whisper.device)},compute_type=${JSON.stringify(c.whisper.compute_type)})`,
        `list(m.transcribe(sys.argv[1],language=${JSON.stringify(c.whisper.language)})[0])`,
        "print(round(time.time()-t,1))",
      ].join("\n");
      const script = join(c.workDir, "prova-whisper.py");
      writeFileSync(script, py);
      const sec = lento(`python "${script}" "${wav}"`).trim().split("\n").pop();
      ok(`Prova Whisper: modello caricato e audio trascritto in ${sec} s (${c.whisper.model}, ${c.whisper.device})`);
    } catch (e) {
      ko("Prova Whisper non riuscita: " + coda(e));
    }
    try {
      const t = Date.now();
      lento("npm run prova-render");
      ok(`Prova render Remotion: out/prova.mp4 in ${Math.round((Date.now() - t) / 1000)} s`);
    } catch (e) {
      ko("Prova render Remotion non riuscita: " + coda(e));
    }
  }
}
console.log(errori ? `\n${errori} punti da sistemare.` : completo ? "\nTutto pronto, prove complete comprese." : "\nTutto pronto (controlli veloci). Per le prove complete: npm run verifica:completo");
process.exit(errori ? 1 : 0);
