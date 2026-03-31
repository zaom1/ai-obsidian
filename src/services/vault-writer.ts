import { TFile, normalizePath, type Vault } from "obsidian";

export async function appendToVaultFile(vault: Vault, path: string, content: string): Promise<void> {
  const normalizedPath = normalizePath(path);
  await ensureParentFolder(vault, normalizedPath);

  const file = vault.getAbstractFileByPath(normalizedPath);
  if (file instanceof TFile) {
    await vault.append(file, content);
  } else {
    await vault.create(normalizedPath, content);
  }
}

export async function prependToVaultFile(vault: Vault, path: string, content: string): Promise<void> {
  const normalizedPath = normalizePath(path);
  await ensureParentFolder(vault, normalizedPath);

  const file = vault.getAbstractFileByPath(normalizedPath);
  if (file instanceof TFile) {
    const current = await vault.read(file);
    await vault.modify(file, `${content}${current}`);
  } else {
    await vault.create(normalizedPath, content);
  }
}

async function ensureParentFolder(vault: Vault, path: string): Promise<void> {
  const parts = path.split("/");
  parts.pop();
  if (parts.length === 0) return;

  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!vault.getAbstractFileByPath(current)) {
      await vault.createFolder(current);
    }
  }
}
