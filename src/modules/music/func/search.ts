import play, { type YouTubeVideo } from "play-dl";
import type { Track, TrackRequester } from "./player.ts";

function toTrack(v: YouTubeVideo, requestedBy: TrackRequester): Track {
  return {
    title: v.title ?? "Titre inconnu",
    url: v.url,
    durationSec: v.durationInSec ?? 0,
    thumbnail: v.thumbnails[0]?.url,
    requestedBy,
  };
}

/**
 * Recherche YouTube via play-dl.
 * - Si `query` est un lien de vidéo YouTube : retourne directement la vidéo.
 * - Sinon : retourne jusqu'à 5 résultats de recherche.
 * Lève une Error avec un message clair en cas d'échec.
 */
export async function searchYouTube(query: string, requestedBy: TrackRequester): Promise<Track[]> {
  const q = query.trim();
  if (!q) throw new Error("Donne-moi un titre ou un lien YouTube.");
  if (/^https?:\/\//i.test(q)) {
    const kind = play.yt_validate(q);
    if (kind === "video") {
      const info = await play.video_info(q);
      return [toTrack(info.video_details, requestedBy)];
    }
    if (kind === "playlist") {
      throw new Error("Les playlists ne sont pas prises en charge — envoie le lien d'une vidéo.");
    }
    throw new Error("Ce lien n'est pas une vidéo YouTube valide.");
  }
  const results = await play.search(q, { limit: 5, source: { youtube: "video" } });
  if (results.length === 0) throw new Error("Aucun résultat trouvé pour cette recherche.");
  return results.map((v) => toTrack(v, requestedBy));
}
