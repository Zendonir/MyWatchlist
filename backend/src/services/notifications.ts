import { prisma } from "../db";
import { emailConfigured } from "../env";
import { sendMail } from "./email";

interface CompletedEntry {
  mediaItemId: number;
  title: string;
}

/**
 * Accumulates "new episodes" / "show completed" events per user while a
 * metadata refresh runs, then emails each opted-in user a single digest
 * covering everything found in that run (see runMetadataRefresh).
 */
export class RefreshDigest {
  private newEpisodes = new Map<number, Map<number, { title: string; count: number }>>();
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
      if (!user?.email || !user.notifyEmail) continue;

      const newEpisodeLines = [...(this.newEpisodes.get(userId)?.values() ?? [])].map(
        (e) => `${e.title}${e.count > 1 ? ` (+${e.count} Folgen)` : " (neue Folge)"}`
      );
      const completedLines = (this.completed.get(userId) ?? []).map((e) => e.title);
      if (newEpisodeLines.length === 0 && completedLines.length === 0) continue;

      const textSections: string[] = [];
      const htmlSections: string[] = [];
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

      await sendMail({
        to: user.email,
        subject: "MyWatchlist - Neuigkeiten zu deiner Watchlist",
        text: textSections.join("\n\n"),
        html: htmlSections.join(""),
      }).catch((err) => console.error(`Failed to send digest email to user ${userId}:`, err));
    }
  }
}
