import type { VaultPage } from "@/lib/vault";

export function Hatnote({ page }: { page: VaultPage }) {
  if (page.aliases.length === 0) return null;
  return (
    <div className="hatnote" role="note">
      Also known as <b>{page.aliases.join(", ")}</b>.
    </div>
  );
}
