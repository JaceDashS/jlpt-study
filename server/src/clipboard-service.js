import { spawn } from "node:child_process";

function runPowershell(command, readStdout = false) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", command], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (readStdout) stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `powershell failed with exit code ${code}`));
    });

    child.stdin.end();
  });
}

export async function writeClipboardText(text) {
  const base64Text = Buffer.from(String(text ?? ""), "utf8").toString("base64");
  const command = `$b='${base64Text}';$t=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b));Set-Clipboard -Value $t`;
  await runPowershell(command);
}

export async function readClipboardText() {
  const command = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$text=Get-Clipboard -Raw; if ($null -eq $text) { $text='' }; [Console]::Write($text)";
  return runPowershell(command, true);
}
