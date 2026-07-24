import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';

export const dynamic = 'force-dynamic';

const KEY = process.env.TENOR_API_KEY;

interface TenorFormat {
  url?: string;
  dims?: number[];
}

// Proxies Tenor GIF search so the API key stays server-side. Content-filtered to medium
// (G + PG). Returns only what the picker needs. If TENOR_API_KEY is unset, replies with
// { disabled: true } so the client hides the GIF button. Handles both the legacy v1
// (media: [{ gif, tinygif }]) and the v2 (media_formats: { gif, tinygif }) response shapes.
export async function GET(request: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return NextResponse.json({ results: [], disabled: true });
  if (!KEY) return NextResponse.json({ results: [], disabled: true });

  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 100).trim();
  const locale = (request.nextUrl.searchParams.get('locale') || 'en_US').slice(0, 5);

  const path = q ? `search?q=${encodeURIComponent(q)}&` : 'trending?';
  const url = `https://g.tenor.com/v1/${path}key=${encodeURIComponent(KEY)}&client_key=narutomythos&limit=24&media_filter=minimal&contentfilter=medium&locale=${encodeURIComponent(locale)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = await res.json();
    const results = (Array.isArray(data?.results) ? data.results : [])
      .map((g: { id?: string; media?: Array<Record<string, TenorFormat>>; media_formats?: Record<string, TenorFormat> }) => {
        const fmt: Record<string, TenorFormat> | undefined = Array.isArray(g.media) ? g.media[0] : g.media_formats;
        const tiny = fmt?.tinygif;
        const gif = fmt?.gif;
        return {
          id: g.id ?? '',
          preview: tiny?.url ?? gif?.url ?? '',
          url: gif?.url ?? tiny?.url ?? '',
          dims: tiny?.dims ?? gif?.dims ?? [0, 0],
        };
      })
      .filter((r: { url: string }) => !!r.url);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
