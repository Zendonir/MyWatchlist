import { prisma } from "../db";
import { emailConfigured } from "../env";
import { sendMail } from "./email";

interface CompletedEntry {
  mediaItemId: number;
  title: string;
}

interface NewEpisodesEntry {
  title: string;
  count: number;
}

/**
 * Builds the subject/text/html for a digest email. Shared between the real
 * daily digest (RefreshDigest.send below) and the admin's "send example
 * email" preview in Settings, so the preview is byte-for-byte what a real
 * one looks like.
 */
export function buildDigestEmail(opts: { newEpisodes: NewEpisodesEntry[]; completed: string[]; example?: boolean }) {
  const newEpisodeLines = opts.newEpisodes.map(
    (e) => `${e.title}${e.count > 1 ? ` (+${e.count} Folgen)` : " (neue Folge)"}`
  );
  const completedLines = opts.completed;

  const textSections: string[] = [];
  const htmlSections: string[] = [];

  if (opts.example) {
    textSections.push("Dies ist eine Beispiel-E-Mail, um dir zu zeigen, wie die täglichen Benachrichtigungen aussehen.");
    htmlSections.push(
      "<p><em>Dies ist eine Beispiel-E-Mail, um dir zu zeigen, wie die täglichen Benachrichtigungen aussehen.</em></p>"
    );
  }
  if (newEpisodeLines.length > 0) {
    textSections.push(`Neue Folgen sind verfügbar für:\n${newEpisodeLines.map((l) => `- ${l}`).join("\n")}`);
    htmlSections.push(
      `<p><strong>Neue Folgen sind verfügbar für:</strong></p><ul>${newEpisodeLines
        .map((l) => `<li>${l}</li>`)
        .join("")}</ul>`
    );
  }
  if (completedLines.length > 0) {
    textSections.push(`Folgende Serien sind nun abgeschlossen:\n${completedLines.map((l) => `- ${l}`).join("\n")}`);
    htmlSections.push(
      `<p><strong>Folgende Serien sind nun abgeschlossen:</strong></p><ul>${completedLines
        .map((l) => `<li>${l}</li>`)
        .join("")}</ul>`
    );
  }

  return {
    subject: opts.example
      ? "MyWatchlist - Beispiel: Neuigkeiten zu deiner Watchlist"
      : "MyWatchlist - Neuigkeiten zu deiner Watchlist",
    text: textSections.join("\n\n"),
    html: htmlSections.join(""),
  };
}

/**
 * Accumulates "new episodes" / "show completed" events per user while a
 * metadata refresh runs, then emails each opted-in user a single digest
 * covering everything found in that run (see runMetadataRefresh).
 */
export class RefreshDigest {
  private newEpisodes = new Map<number, Map<number, NewEpisodesEntry>>();
  private completed = new Map<number, CompletedEntry[]>();

  addNewEpisodes(userId: number, mediaItemId: number, title: string, count: number) {
    if (count <= 0) return;
    const forUser = this.newEpisodes.get(userId) ?? new Map();
    const existing = forUser.get(mediaItemId);
    forUser.set(mediaItemId, { title, count: (existing?.count ?? 0) + count });
    this.newEpisodes.set(userId, forUser);
  }

  addCompleted(userId: number, mediaItemId: number, title: string) {
    const list = this.completed.get(userId) ?? [];
    list.push({ mediaItemId, title });
    this.completed.set(userId, list);
  }

  async send() {
    if (!emailConfigured) return;

    const userIds = new Set([...this.newEpisodes.keys(), ...this.completed.keys()]);
    for (const userId of userIds) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.notifyEmail) continue;

      const newEpisodes = [...(this.newEpisodes.get(userId)?.values() ?? [])];
      const completed = (this.completed.get(userId) ?? []).map((e) => e.title);
      if (newEpisodes.length === 0 && completed.length === 0) continue;

      const content = buildDigestEmail({ newEpisodes, completed });
      await sendMail({ to: user.email, ...content }).catch((err) =>
        console.error(`Failed to send digest email to user ${userId}:`, err)
      );
    }
  }
}
